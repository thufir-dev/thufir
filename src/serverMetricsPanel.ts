import * as vscode from 'vscode';
import { ServerNode } from './serverNode';
import { ServerMetricsProvider } from './serverMetricsProvider';

interface ServerMetrics {
    cpu: number;
    memory: {
        used: number;
        total: number;
    };
    disk: {
        used: number;
        total: number;
    };
    uptime: number;
    loadAverage: number[];
}

export class ServerMetricsPanel {
    public static currentPanel: ServerMetricsPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _serverNode: ServerNode;
    private readonly _metricsProvider: ServerMetricsProvider;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, serverNode: ServerNode, metricsProvider: ServerMetricsProvider) {
        this._panel = panel;
        this._serverNode = serverNode;
        this._metricsProvider = metricsProvider;

        this._update();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Update the content every second
        setInterval(() => {
            this._update();
        }, 1000);
    }

    public static createOrShow(serverNode: ServerNode, metricsProvider: ServerMetricsProvider) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (ServerMetricsPanel.currentPanel) {
            ServerMetricsPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'serverMetrics',
            `Server Metrics: ${serverNode.label}`,
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        ServerMetricsPanel.currentPanel = new ServerMetricsPanel(panel, serverNode, metricsProvider);
    }

    public dispose() {
        ServerMetricsPanel.currentPanel = undefined;

        this._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    private _update() {
        const metrics = this._metricsProvider.getMetrics(this._serverNode);
        if (!metrics) {
            return;
        }

        this._panel.webview.html = this._getHtmlForWebview(metrics);
    }

    private _getHtmlForWebview(metrics: ServerMetrics): string {
        const cpuUsage = metrics.cpu.toFixed(1);
        const memoryUsedGB = (metrics.memory.used / 1024).toFixed(1);
        const memoryTotalGB = (metrics.memory.total / 1024).toFixed(1);
        const memoryPercentage = ((metrics.memory.used / metrics.memory.total) * 100).toFixed(1);
        const diskUsedGB = metrics.disk.used;
        const diskTotalGB = metrics.disk.total;
        const diskPercentage = ((metrics.disk.used / metrics.disk.total) * 100).toFixed(1);
        const uptimeHours = (metrics.uptime / 3600).toFixed(1);
        const loadAvg = metrics.loadAverage.map((v: number) => v.toFixed(2)).join(', ');

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Server Metrics</title>
            <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
                    padding: 20px;
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                }
                .metric-card {
                    background-color: var(--vscode-editor-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 8px;
                    padding: 16px;
                    margin-bottom: 16px;
                }
                .metric-title {
                    font-size: 14px;
                    color: var(--vscode-foreground);
                    margin-bottom: 8px;
                }
                .metric-value {
                    font-size: 24px;
                    font-weight: bold;
                    color: var(--vscode-foreground);
                }
                .progress-bar {
                    width: 100%;
                    height: 8px;
                    background-color: var(--vscode-progressBar-background);
                    border-radius: 4px;
                    margin-top: 8px;
                    overflow: hidden;
                }
                .progress-fill {
                    height: 100%;
                    background-color: var(--vscode-progressBar-foreground);
                    transition: width 0.3s ease;
                }
                .grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                    gap: 16px;
                }
            </style>
        </head>
        <body>
            <div class="grid">
                <div class="metric-card">
                    <div class="metric-title">CPU Usage</div>
                    <div class="metric-value">${cpuUsage}%</div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${cpuUsage}%"></div>
                    </div>
                </div>
                <div class="metric-card">
                    <div class="metric-title">Memory Usage</div>
                    <div class="metric-value">${memoryUsedGB}GB / ${memoryTotalGB}GB (${memoryPercentage}%)</div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${memoryPercentage}%"></div>
                    </div>
                </div>
                <div class="metric-card">
                    <div class="metric-title">Disk Usage</div>
                    <div class="metric-value">${diskUsedGB}GB / ${diskTotalGB}GB (${diskPercentage}%)</div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${diskPercentage}%"></div>
                    </div>
                </div>
                <div class="metric-card">
                    <div class="metric-title">System Uptime</div>
                    <div class="metric-value">${uptimeHours} hours</div>
                </div>
                <div class="metric-card">
                    <div class="metric-title">Load Average (1m, 5m, 15m)</div>
                    <div class="metric-value">${loadAvg}</div>
                </div>
            </div>
            <div class="metric-card">
                <canvas id="metricsChart"></canvas>
            </div>
            <script>
                const ctx = document.getElementById('metricsChart').getContext('2d');
                const chart = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: [],
                        datasets: [{
                            label: 'CPU Usage',
                            data: [],
                            borderColor: '#2196f3',
                            tension: 0.4
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            y: {
                                beginAtZero: true,
                                max: 100
                            }
                        }
                    }
                });

                // Update chart data
                function updateChart(cpuUsage) {
                    const time = new Date().toLocaleTimeString();
                    chart.data.labels.push(time);
                    chart.data.datasets[0].data.push(cpuUsage);

                    if (chart.data.labels.length > 20) {
                        chart.data.labels.shift();
                        chart.data.datasets[0].data.shift();
                    }

                    chart.update();
                }

                // Initial update
                updateChart(${cpuUsage});
            </script>
        </body>
        </html>`;
    }
} 