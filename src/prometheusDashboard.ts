import * as vscode from 'vscode';
import { ServerNode } from './serverNode';
import { PrometheusClient } from './prometheusClient';
import { Alert, MetricValue } from './types';

interface AlertRule {
    name: string;
    query: string;
    duration: string;
    labels: Record<string, string>;
    annotations: Record<string, string>;
    state: 'firing' | 'pending' | 'inactive';
}

interface DashboardPanel {
    id: string;
    title: string;
    type: 'graph' | 'singlestat' | 'table' | 'alerts';
    query?: string;
    timeRange?: string;
}

export class PrometheusDashboard {
    public static currentPanel: PrometheusDashboard | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _serverNode: ServerNode;
    private readonly _prometheusClient: PrometheusClient;
    private _disposables: vscode.Disposable[] = [];
    private _dashboardPanels: DashboardPanel[] = [];

    private constructor(panel: vscode.WebviewPanel, serverNode: ServerNode) {
        this._panel = panel;
        this._serverNode = serverNode;
        
        if (!serverNode.prometheusConfig) {
            throw new Error('Server does not have Prometheus configured');
        }
        
        this._prometheusClient = new PrometheusClient(serverNode.prometheusConfig);

        // Load saved panels or use defaults
        this._loadPanels();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        
        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'refresh':
                        await this._update();
                        break;
                    case 'addPanel':
                        await this._addPanel(message.panel);
                        break;
                    case 'removePanel':
                        await this._removePanel(message.panelId);
                        break;
                    case 'editPanel':
                        await this._editPanel(message.panel);
                        break;
                    case 'analyzeAlert':
                        await this._analyzeAlert(message.alertName);
                        break;
                }
            },
            null,
            this._disposables
        );

        // Initial update
        this._update();

        // Update every 30 seconds
        setInterval(() => {
            this._update();
        }, 30000);
    }

    public static createOrShow(serverNode: ServerNode) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (PrometheusDashboard.currentPanel) {
            PrometheusDashboard.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'prometheusDashboard',
            `Prometheus Dashboard: ${serverNode.label}`,
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        PrometheusDashboard.currentPanel = new PrometheusDashboard(panel, serverNode);
    }

    private _getPanelStorageKey(): string {
        return `prometheus-dashboard.panels.${this._serverNode.host}`;
    }

    private _loadPanels(): void {
        const savedPanels = vscode.workspace.getConfiguration('thufir').get<DashboardPanel[]>(this._getPanelStorageKey());
        
        if (savedPanels && savedPanels.length > 0) {
            this._dashboardPanels = savedPanels;
        } else {
            // Default panels
            this._dashboardPanels = [
                {
                    id: 'alerts',
                    title: 'Active Alerts',
                    type: 'alerts'
                },
                {
                    id: 'cpu',
                    title: 'CPU Usage',
                    type: 'graph',
                    query: '100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[1m])) * 100)',
                    timeRange: '1h'
                },
                {
                    id: 'memory',
                    title: 'Memory Usage',
                    type: 'graph',
                    query: '(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100',
                    timeRange: '1h'
                }
            ];
        }
    }

    private async _savePanels(): Promise<void> {
        await vscode.workspace.getConfiguration('thufir').update(
            this._getPanelStorageKey(),
            this._dashboardPanels,
            vscode.ConfigurationTarget.Global
        );
    }

    private async _update() {
        try {
            const alerts = await this._fetchAlerts();
            const panelData = await this._fetchPanelData();

            this._panel.webview.html = this._getHtmlForWebview(alerts, panelData);
        } catch (error) {
            console.error('Error updating dashboard:', error);
            vscode.window.showErrorMessage('Failed to update Prometheus dashboard');
        }
    }

    private async _fetchAlerts(): Promise<Alert[]> {
        try {
            const response = await this._prometheusClient.getAlerts();
            return response.map(alert => ({
                name: alert.labels.alertname,
                state: alert.state,
                labels: alert.labels,
                annotations: alert.annotations,
                activeAt: alert.activeAt,
                value: alert.value
            }));
        } catch (error) {
            console.error('Error fetching alerts:', error);
            return [];
        }
    }

    private async _fetchPanelData(): Promise<Record<string, any>> {
        const data: Record<string, any> = {};
        
        for (const panel of this._dashboardPanels) {
            if (panel.type === 'alerts') {
                continue;
            }

            if (!panel.query) {
                continue;
            }

            try {
                if (panel.type === 'graph') {
                    const end = Math.floor(Date.now() / 1000);
                    const start = end - this._parseTimeRange(panel.timeRange || '1h');
                    console.log(`Fetching data for panel ${panel.id}:`, {
                        query: panel.query,
                        start,
                        end,
                        timeRange: panel.timeRange
                    });
                    const result = await this._prometheusClient.queryRange(
                        panel.query,
                        start,
                        end,
                        '15s'
                    );
                    console.log(`Result for panel ${panel.id}:`, result);
                    data[panel.id] = result;
                } else {
                    const result = await this._prometheusClient.queryInstant(panel.query);
                    data[panel.id] = result;
                }
            } catch (error) {
                console.error(`Error fetching data for panel ${panel.id}:`, error);
            }
        }

        return data;
    }

    private _parseTimeRange(range: string): number {
        const value = parseInt(range);
        const unit = range.slice(-1);
        
        switch (unit) {
            case 'h':
                return value * 3600;
            case 'd':
                return value * 86400;
            case 'w':
                return value * 604800;
            default:
                return 3600; // Default to 1h
        }
    }

    private async _addPanel(panel?: DashboardPanel) {
        if (!panel) {
            // Show panel creation dialog
            const panelType = await vscode.window.showQuickPick(['graph', 'singlestat', 'table'], {
                placeHolder: 'Select panel type'
            });
            if (!panelType) return;

            const title = await vscode.window.showInputBox({
                placeHolder: 'Enter panel title'
            });
            if (!title) return;

            const query = await vscode.window.showInputBox({
                placeHolder: 'Enter Prometheus query'
            });
            if (!query) return;

            const timeRange = await vscode.window.showQuickPick(['1h', '6h', '12h', '24h'], {
                placeHolder: 'Select time range'
            });
            if (!timeRange) return;

            panel = {
                id: `panel_${Date.now()}`,
                title,
                type: panelType as 'graph' | 'singlestat' | 'table',
                query,
                timeRange
            };
        }

        this._dashboardPanels.push(panel);
        await this._savePanels();
        await this._update();
    }

    private async _removePanel(panelId: string) {
        // Don't allow removing the alerts panel
        if (panelId === 'alerts') {
            return;
        }
        this._dashboardPanels = this._dashboardPanels.filter(p => p.id !== panelId);
        await this._savePanels();
        await this._update();
    }

    private async _editPanel(panel: DashboardPanel) {
        const title = await vscode.window.showInputBox({
            value: panel.title,
            placeHolder: 'Enter panel title'
        });
        if (!title) return;

        const query = await vscode.window.showInputBox({
            value: panel.query,
            placeHolder: 'Enter Prometheus query'
        });
        if (!query) return;

        const timeRangeOptions = [
            { label: '1h', description: 'Last hour' },
            { label: '6h', description: 'Last 6 hours' },
            { label: '12h', description: 'Last 12 hours' },
            { label: '24h', description: 'Last 24 hours' }
        ];
        
        const selectedTimeRange = await vscode.window.showQuickPick(timeRangeOptions, {
            placeHolder: 'Select time range'
        });
        if (!selectedTimeRange) return;

        const index = this._dashboardPanels.findIndex(p => p.id === panel.id);
        if (index !== -1) {
            this._dashboardPanels[index] = {
                ...this._dashboardPanels[index],
                title,
                query,
                timeRange: selectedTimeRange.label
            };
            await this._savePanels();
            await this._update();
        }
    }

    private async _analyzeAlert(alertName: string) {
        try {
            const alerts = await this._prometheusClient.getAlerts();
            const alert = alerts.find(a => a.labels.alertname === alertName);
            
            if (!alert) {
                vscode.window.showErrorMessage(`Alert ${alertName} not found`);
                return;
            }

            // Get additional context metrics
            const contextMetrics = await this._prometheusClient.getMetricNames();
            
            // Get related metrics for this alert
            const relatedMetrics = await this._getRelatedMetrics(alert);
            
            // First reveal the AI Assistant panel
            await vscode.commands.executeCommand('workbench.view.extension.ai-assistant');
            
            // Then focus specifically on the chat view within the panel
            await vscode.commands.executeCommand('chat.focus');
            
            // Execute the analyze alert command with the specific alert data
            await vscode.commands.executeCommand('thufir.analyzeAlert', {
                serverNode: this._serverNode,
                alert: {
                    name: alert.labels.alertname,
                    state: alert.state,
                    labels: alert.labels,
                    annotations: alert.annotations,
                    activeAt: alert.activeAt,
                    value: alert.value
                },
                contextMetrics: contextMetrics,
                relatedMetrics: relatedMetrics
            });
        } catch (error) {
            if (error instanceof Error) {
                vscode.window.showErrorMessage(`Failed to analyze alert: ${error.message}`);
            }
        }
    }

    private async _getRelatedMetrics(alert: Alert): Promise<Record<string, any>> {
        const metrics: Record<string, any> = {};
        
        try {
            // Get CPU, Memory, and Disk metrics around the alert time
            const end = Math.floor(Date.now() / 1000);
            const start = end - 3600; // Last hour
            
            const queries = [
                { 
                    name: 'cpu_usage', 
                    query: '100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[1m])) * 100)'
                },
                { 
                    name: 'memory_usage', 
                    query: '(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100'
                },
                { 
                    name: 'disk_usage', 
                    query: '(1 - (node_filesystem_avail_bytes / node_filesystem_size_bytes)) * 100'
                }
            ];

            for (const { name, query } of queries) {
                const result = await this._prometheusClient.queryRange(query, start, end, '15s');
                if (result.length > 0) {
                    metrics[name] = result[0];
                }
            }
        } catch (error) {
            console.error('Error fetching related metrics:', error);
        }

        return metrics;
    }

    private _getHtmlForWebview(alerts: Alert[], panelData: Record<string, any>): string {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Prometheus Dashboard</title>
            <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                    padding: 20px;
                }
                .dashboard-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
                    gap: 20px;
                    margin-bottom: 20px;
                }
                .panel {
                    background-color: var(--vscode-editor-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 6px;
                    padding: 16px;
                }
                .panel-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 16px;
                }
                .panel-title {
                    font-size: 16px;
                    font-weight: bold;
                    color: var(--vscode-foreground);
                }
                .alert {
                    margin: 8px 0;
                    padding: 12px;
                    border-radius: 4px;
                }
                .alert.firing {
                    background-color: var(--vscode-inputValidation-errorBackground);
                    border: 1px solid var(--vscode-inputValidation-errorBorder);
                }
                .alert.pending {
                    background-color: var(--vscode-inputValidation-warningBackground);
                    border: 1px solid var(--vscode-inputValidation-warningBorder);
                }
                .alert-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 8px;
                }
                .alert-name {
                    font-weight: bold;
                }
                .alert-actions {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .alert-state {
                    padding: 2px 6px;
                    border-radius: 3px;
                    font-size: 12px;
                    background-color: var(--vscode-badge-background);
                    color: var(--vscode-badge-foreground);
                }
                .alert-labels {
                    font-size: 12px;
                    margin-top: 4px;
                }
                .alert-annotation {
                    margin-top: 8px;
                    font-size: 14px;
                }
                .chart-container {
                    height: 300px;
                }
                .toolbar {
                    margin-bottom: 20px;
                    display: flex;
                    gap: 8px;
                }
                .button {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 6px 12px;
                    border-radius: 4px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    font-size: 12px;
                }
                .button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                .codicon {
                    font-family: codicon;
                    font-size: 14px;
                }
                .codicon-comment-discussion:before {
                    content: "\\ea6b";
                }
                .empty-panel {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    height: 300px;
                    color: var(--vscode-descriptionForeground);
                    font-style: italic;
                }
                .panel-actions {
                    display: flex;
                    gap: 8px;
                }
            </style>
            <link href="https://cdn.jsdelivr.net/npm/vscode-codicons/dist/codicon.css" rel="stylesheet">
        </head>
        <body>
            <div class="toolbar">
                <button class="button" onclick="addPanel()">
                    <span class="codicon codicon-add"></span>
                    Add Panel
                </button>
                <button class="button" onclick="refresh()">
                    <span class="codicon codicon-refresh"></span>
                    Refresh
                </button>
            </div>
            <div class="dashboard-grid">
                ${this._renderAlertPanel(alerts)}
                ${this._renderMetricPanels(panelData)}
            </div>
            <script>
                const vscode = acquireVsCodeApi();
                
                function refresh() {
                    vscode.postMessage({ command: 'refresh' });
                }

                function analyzeAlert(alertName) {
                    vscode.postMessage({ 
                        command: 'analyzeAlert',
                        alertName: alertName
                    });
                }

                function addPanel() {
                    vscode.postMessage({ command: 'addPanel' });
                }

                function removePanel(panelId) {
                    // Remove the panel element immediately from the DOM
                    const panelElement = document.getElementById('panel-' + panelId);
                    if (panelElement) {
                        panelElement.remove();
                    }
                    
                    vscode.postMessage({ 
                        command: 'removePanel', 
                        panelId: panelId 
                    });
                }

                function editPanel(panel) {
                    vscode.postMessage({ 
                        command: 'editPanel', 
                        panel: panel
                    });
                }

                // Initialize charts
                ${this._generateChartInitCode(panelData)}
            </script>
        </body>
        </html>`;
    }

    private _renderAlertPanel(alerts: Alert[]): string {
        return `
        <div class="panel">
            <div class="panel-header">
                <div class="panel-title">Active Alerts</div>
            </div>
            <div class="alerts-container">
                ${alerts.map(alert => `
                    <div class="alert ${alert.state}">
                        <div class="alert-header">
                            <span class="alert-name">${alert.name}</span>
                            <div class="alert-actions">
                                <button class="button" onclick="analyzeAlert('${alert.name}')">
                                    <span class="codicon codicon-comment-discussion"></span>
                                    Analyze
                                </button>
                                <span class="alert-state">${alert.state}</span>
                            </div>
                        </div>
                        <div class="alert-labels">
                            ${Object.entries(alert.labels)
                                .map(([key, value]) => `${key}="${value}"`)
                                .join(', ')}
                        </div>
                        ${Object.entries(alert.annotations)
                            .map(([key, value]) => `
                                <div class="alert-annotation">
                                    <strong>${key}:</strong> ${value}
                                </div>
                            `).join('')}
                    </div>
                `).join('')}
            </div>
        </div>`;
    }

    private _renderMetricPanels(panelData: Record<string, any>): string {
        return this._dashboardPanels
            .filter(panel => panel.type !== 'alerts')
            .map(panel => {
                const hasData = panelData[panel.id]?.length > 0 && panelData[panel.id][0]?.values?.length > 0;
                
                return `
                <div class="panel" id="panel-${panel.id}">
                    <div class="panel-header">
                        <div class="panel-title">${panel.title}</div>
                        <div class="panel-actions">
                            <button class="button" onclick='editPanel(${JSON.stringify({
                                id: panel.id,
                                title: panel.title,
                                type: panel.type,
                                query: panel.query,
                                timeRange: panel.timeRange
                            })})'>
                                <span class="codicon codicon-edit"></span>
                                Edit
                            </button>
                            <button class="button" onclick="removePanel('${panel.id}')">
                                <span class="codicon codicon-trash"></span>
                                Remove
                            </button>
                        </div>
                    </div>
                    ${hasData ? 
                        `<div class="chart-container">
                            <canvas id="chart-${panel.id}"></canvas>
                        </div>` :
                        `<div class="empty-panel">
                            No data available
                        </div>`
                    }
                </div>
            `}).join('');
    }

    private _generateChartInitCode(panelData: Record<string, any>): string {
        return this._dashboardPanels
            .filter(panel => panel.type === 'graph' && panelData[panel.id])
            .map(panel => {
                const data = panelData[panel.id];
                if (!data || !data[0]?.values?.length) {
                    console.warn(`No data for panel ${panel.id}`);
                    return '';
                }

                const values = data[0].values;
                const timestamps = values.map((v: [number, string]) => 
                    new Date(v[0] * 1000).toLocaleTimeString());
                const metrics = values.map((v: [number, string]) => 
                    parseFloat(v[1]).toFixed(2));

                let yAxisConfig = {};
                if (panel.id === 'cpu' || panel.id === 'memory') {
                    yAxisConfig = {
                        beginAtZero: true,
                        max: 100,
                        title: {
                            display: true,
                            text: '%'
                        }
                    };
                }

                return `
                new Chart(document.getElementById('chart-${panel.id}').getContext('2d'), {
                    type: 'line',
                    data: {
                        labels: ${JSON.stringify(timestamps)},
                        datasets: [{
                            label: '${panel.title}',
                            data: ${JSON.stringify(metrics)},
                            borderColor: '#2196f3',
                            tension: 0.4,
                            fill: true,
                            backgroundColor: 'rgba(33, 150, 243, 0.1)'
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            y: ${JSON.stringify(yAxisConfig)},
                            x: {
                                grid: {
                                    display: false
                                }
                            }
                        },
                        plugins: {
                            legend: {
                                display: false
                            }
                        }
                    }
                });`;
            }).join('\n');
    }

    public dispose() {
        PrometheusDashboard.currentPanel = undefined;

        this._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}