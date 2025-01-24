import * as vscode from 'vscode';
import { ServerNode } from './serverNode';
import { PrometheusClient } from './prometheusClient';

interface AlertRule {
    name: string;
    query: string;
    duration: string;
    labels: Record<string, string>;
    annotations: Record<string, string>;
    state: 'firing' | 'pending' | 'inactive';
}

interface Alert {
    name: string;
    state: 'firing' | 'pending' | 'inactive';
    labels: Record<string, string>;
    annotations: Record<string, string>;
    activeAt: string;
    value: string;
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
    private _dashboardPanels: DashboardPanel[] = [
        {
            id: 'alerts',
            title: 'Active Alerts',
            type: 'alerts'
        },
        {
            id: 'cpu',
            title: 'CPU Usage',
            type: 'graph',
            query: 'rate(node_cpu_seconds_total{mode="idle"}[1m])',
            timeRange: '1h'
        },
        {
            id: 'memory',
            title: 'Memory Usage',
            type: 'graph',
            query: 'node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes',
            timeRange: '1h'
        }
    ];

    private constructor(panel: vscode.WebviewPanel, serverNode: ServerNode) {
        this._panel = panel;
        this._serverNode = serverNode;
        
        if (!serverNode.prometheusConfig) {
            throw new Error('Server does not have Prometheus configured');
        }
        
        this._prometheusClient = new PrometheusClient(serverNode.prometheusConfig);

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
                        this._removePanel(message.panelId);
                        break;
                    case 'editPanel':
                        await this._editPanel(message.panel);
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
                    const result = await this._prometheusClient.queryRange(
                        panel.query,
                        start,
                        end,
                        '15s'
                    );
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

    private async _addPanel(panel: DashboardPanel) {
        this._dashboardPanels.push(panel);
        await this._update();
    }

    private _removePanel(panelId: string) {
        this._dashboardPanels = this._dashboardPanels.filter(p => p.id !== panelId);
        this._update();
    }

    private async _editPanel(panel: DashboardPanel) {
        const index = this._dashboardPanels.findIndex(p => p.id === panel.id);
        if (index !== -1) {
            this._dashboardPanels[index] = panel;
            await this._update();
        }
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
                    margin-bottom: 8px;
                }
                .alert-name {
                    font-weight: bold;
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
                }
                .button {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 6px 12px;
                    border-radius: 4px;
                    cursor: pointer;
                }
                .button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
            </style>
        </head>
        <body>
            <div class="toolbar">
                <button class="button" onclick="addPanel()">Add Panel</button>
                <button class="button" onclick="refresh()">Refresh</button>
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

                function addPanel() {
                    // TODO: Implement panel addition UI
                }

                function removePanel(panelId) {
                    vscode.postMessage({ command: 'removePanel', panelId });
                }

                function editPanel(panel) {
                    // TODO: Implement panel editing UI
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
                            <span class="alert-state">${alert.state}</span>
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
            .map(panel => `
                <div class="panel">
                    <div class="panel-header">
                        <div class="panel-title">${panel.title}</div>
                        <div class="panel-actions">
                            <button class="button" onclick="editPanel(${JSON.stringify(panel)})">Edit</button>
                            <button class="button" onclick="removePanel('${panel.id}')">Remove</button>
                        </div>
                    </div>
                    <div class="chart-container">
                        <canvas id="chart-${panel.id}"></canvas>
                    </div>
                </div>
            `).join('');
    }

    private _generateChartInitCode(panelData: Record<string, any>): string {
        return this._dashboardPanels
            .filter(panel => panel.type === 'graph' && panelData[panel.id])
            .map(panel => {
                const data = panelData[panel.id];
                return `
                new Chart(document.getElementById('chart-${panel.id}').getContext('2d'), {
                    type: 'line',
                    data: {
                        labels: ${JSON.stringify(data[0]?.values.map((v: [number, string]) => 
                            new Date(v[0] * 1000).toLocaleTimeString()))},
                        datasets: [{
                            label: '${panel.title}',
                            data: ${JSON.stringify(data[0]?.values.map((v: [number, string]) => 
                                parseFloat(v[1])))},
                            borderColor: '#2196f3',
                            tension: 0.4
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            y: {
                                beginAtZero: true
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