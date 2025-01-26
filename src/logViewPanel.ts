import * as vscode from 'vscode';
import { ServerNode } from './serverNode';
import { LogManager, LogEntry, LogAnalysis } from './logManager';

export class LogViewPanel {
    public static currentPanel: LogViewPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _serverNode: ServerNode;
    private readonly _logManager: LogManager;
    private _disposables: vscode.Disposable[] = [];
    private _currentFilter: {
        level?: LogEntry['level'];
        source?: string;
        since?: Date;
        search?: string;
    } = {};

    private constructor(panel: vscode.WebviewPanel, serverNode: ServerNode) {
        this._panel = panel;
        this._serverNode = serverNode;
        this._logManager = LogManager.getInstance();

        this._update();

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'filter':
                        this._currentFilter = message.filter;
                        this._update();
                        break;
                    case 'analyze':
                        await this._analyze();
                        break;
                    case 'refresh':
                        this._update();
                        break;
                }
            },
            null,
            this._disposables
        );

        // Update every 2 seconds
        setInterval(() => {
            this._update();
        }, 2000);

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }

    public static createOrShow(serverNode: ServerNode) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (LogViewPanel.currentPanel) {
            LogViewPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'serverLogs',
            `Logs: ${serverNode.label}`,
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        LogViewPanel.currentPanel = new LogViewPanel(panel, serverNode);
    }

    private async _analyze() {
        try {
            const analysis = await this._logManager.analyzeLogPatterns(this._serverNode);
            this._panel.webview.postMessage({ 
                type: 'analysisResult', 
                analysis 
            });
        } catch (error) {
            if (error instanceof Error) {
                vscode.window.showErrorMessage(`Failed to analyze logs: ${error.message}`);
            }
        }
    }

    private _update() {
        const entries = this._logManager.getLogEntries(this._serverNode, this._currentFilter);
        this._panel.webview.html = this._getHtmlForWebview(entries);
    }

    private _getHtmlForWebview(entries: LogEntry[]): string {
        const levelCounts = {
            INFO: 0,
            WARN: 0,
            ERROR: 0,
            DEBUG: 0
        };

        entries.forEach(entry => {
            levelCounts[entry.level]++;
        });

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Server Logs</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    padding: 20px;
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                }
                .toolbar {
                    position: sticky;
                    top: 0;
                    background-color: var(--vscode-editor-background);
                    padding: 10px 0;
                    border-bottom: 1px solid var(--vscode-panel-border);
                    margin-bottom: 20px;
                    display: flex;
                    gap: 10px;
                    align-items: center;
                    z-index: 100;
                }
                .filter-group {
                    display: flex;
                    gap: 10px;
                    align-items: center;
                }
                .log-stats {
                    display: flex;
                    gap: 20px;
                    margin-bottom: 20px;
                }
                .stat-item {
                    padding: 8px 16px;
                    border-radius: 4px;
                    font-size: 12px;
                }
                .log-entry {
                    font-family: var(--vscode-editor-font-family);
                    padding: 8px;
                    margin-bottom: 4px;
                    border-radius: 4px;
                    font-size: 12px;
                    white-space: pre-wrap;
                    word-wrap: break-word;
                }
                .log-entry.INFO {
                    background-color: var(--vscode-textBlockQuote-background);
                }
                .log-entry.WARN {
                    background-color: var(--vscode-inputValidation-warningBackground);
                    border: 1px solid var(--vscode-inputValidation-warningBorder);
                }
                .log-entry.ERROR {
                    background-color: var(--vscode-inputValidation-errorBackground);
                    border: 1px solid var(--vscode-inputValidation-errorBorder);
                }
                .log-entry.DEBUG {
                    opacity: 0.7;
                }
                .timestamp {
                    color: var(--vscode-descriptionForeground);
                    margin-right: 10px;
                }
                .level {
                    font-weight: bold;
                    margin-right: 10px;
                }
                .source {
                    color: var(--vscode-textLink-foreground);
                    margin-right: 10px;
                }
                select, input {
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                    padding: 4px 8px;
                    border-radius: 4px;
                }
                button {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 4px 12px;
                    border-radius: 4px;
                    cursor: pointer;
                }
                button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                .analysis-panel {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    width: 300px;
                    background-color: var(--vscode-editor-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 6px;
                    padding: 16px;
                    display: none;
                }
                .analysis-panel.visible {
                    display: block;
                }
                .analysis-section {
                    margin-bottom: 16px;
                }
                .analysis-section h3 {
                    margin: 0 0 8px 0;
                    font-size: 14px;
                }
                .analysis-item {
                    font-size: 12px;
                    margin-bottom: 4px;
                    padding: 4px;
                    background-color: var(--vscode-textBlockQuote-background);
                    border-radius: 2px;
                }
            </style>
        </head>
        <body>
            <div class="toolbar">
                <div class="filter-group">
                    <select id="levelFilter" onchange="updateFilter()">
                        <option value="">All Levels</option>
                        <option value="INFO">Info</option>
                        <option value="WARN">Warning</option>
                        <option value="ERROR">Error</option>
                        <option value="DEBUG">Debug</option>
                    </select>
                    <input type="text" id="searchFilter" placeholder="Search logs..." 
                        oninput="updateFilter()">
                    <button onclick="refresh()">Refresh</button>
                    <button onclick="analyze()">Analyze Patterns</button>
                </div>
            </div>

            <div class="log-stats">
                <div class="stat-item">
                    INFO: ${levelCounts.INFO}
                </div>
                <div class="stat-item">
                    WARN: ${levelCounts.WARN}
                </div>
                <div class="stat-item">
                    ERROR: ${levelCounts.ERROR}
                </div>
                <div class="stat-item">
                    DEBUG: ${levelCounts.DEBUG}
                </div>
            </div>

            <div id="logEntries">
                ${entries.map(entry => `
                    <div class="log-entry ${entry.level}">
                        <span class="timestamp">${entry.timestamp.toISOString()}</span>
                        <span class="level">${entry.level}</span>
                        <span class="source">${entry.source}</span>
                        <span class="message">${this._escapeHtml(entry.message)}</span>
                    </div>
                `).join('')}
            </div>

            <div id="analysisPanel" class="analysis-panel">
                <h2>Log Analysis</h2>
                <div class="analysis-section">
                    <h3>Patterns</h3>
                    <div id="patterns"></div>
                </div>
                <div class="analysis-section">
                    <h3>Anomalies</h3>
                    <div id="anomalies"></div>
                </div>
                <div class="analysis-section">
                    <h3>Recommendations</h3>
                    <div id="recommendations"></div>
                </div>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                let currentFilter = ${JSON.stringify(this._currentFilter)};

                function updateFilter() {
                    const level = document.getElementById('levelFilter').value;
                    const search = document.getElementById('searchFilter').value;
                    
                    currentFilter = {
                        ...(level && { level }),
                        ...(search && { search })
                    };

                    vscode.postMessage({
                        command: 'filter',
                        filter: currentFilter
                    });
                }

                function refresh() {
                    vscode.postMessage({ command: 'refresh' });
                }

                function analyze() {
                    vscode.postMessage({ command: 'analyze' });
                }

                // Handle messages from the extension
                window.addEventListener('message', event => {
                    const message = event.data;
                    switch (message.type) {
                        case 'analysisResult':
                            showAnalysis(message.analysis);
                            break;
                    }
                });

                function showAnalysis(analysis) {
                    const panel = document.getElementById('analysisPanel');
                    panel.classList.add('visible');

                    document.getElementById('patterns').innerHTML = 
                        analysis.patterns.map(p => \`<div class="analysis-item">\${p}</div>\`).join('');
                    document.getElementById('anomalies').innerHTML = 
                        analysis.anomalies.map(a => \`<div class="analysis-item">\${a}</div>\`).join('');
                    document.getElementById('recommendations').innerHTML = 
                        analysis.recommendations.map(r => \`<div class="analysis-item">\${r}</div>\`).join('');
                }

                // Restore filter state
                if (currentFilter.level) {
                    document.getElementById('levelFilter').value = currentFilter.level;
                }
                if (currentFilter.search) {
                    document.getElementById('searchFilter').value = currentFilter.search;
                }
            </script>
        </body>
        </html>`;
    }

    private _escapeHtml(unsafe: string): string {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    public dispose() {
        LogViewPanel.currentPanel = undefined;

        this._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
} 