import * as vscode from 'vscode';

export class SREAgentView implements vscode.WebviewViewProvider {
    public static readonly viewType = 'sreAgent';
    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'selectAction':
                    vscode.window.showInformationMessage('This feature will be implemented soon!');
                    break;
            }
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>SRE Agent</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    color: var(--vscode-foreground);
                    padding: 0;
                    margin: 0;
                }
                .container {
                    padding: 16px;
                }
                .composer {
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 6px;
                    overflow: hidden;
                }
                .composer-header {
                    padding: 8px 12px;
                    background-color: var(--vscode-editor-inactiveSelectionBackground);
                    border-bottom: 1px solid var(--vscode-panel-border);
                    font-weight: 600;
                }
                .action-list {
                    list-style: none;
                    padding: 0;
                    margin: 0;
                }
                .action-item {
                    padding: 12px;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    cursor: pointer;
                    border-bottom: 1px solid var(--vscode-panel-border);
                }
                .action-item:hover {
                    background-color: var(--vscode-list-hoverBackground);
                }
                .action-item:last-child {
                    border-bottom: none;
                }
                .action-icon {
                    width: 24px;
                    height: 24px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background-color: var(--vscode-button-background);
                    border-radius: 4px;
                    color: var(--vscode-button-foreground);
                }
                .action-details {
                    flex: 1;
                }
                .action-title {
                    font-weight: 500;
                    margin-bottom: 4px;
                }
                .action-description {
                    font-size: 12px;
                    color: var(--vscode-descriptionForeground);
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="composer">
                    <div class="composer-header">
                        What would you like to do?
                    </div>
                    <ul class="action-list">
                        <li class="action-item" onclick="selectAction('analyze-metrics')">
                            <div class="action-icon">📊</div>
                            <div class="action-details">
                                <div class="action-title">Analyze Metrics</div>
                                <div class="action-description">Get insights about server performance metrics</div>
                            </div>
                        </li>
                        <li class="action-item" onclick="selectAction('investigate-incident')">
                            <div class="action-icon">🔍</div>
                            <div class="action-details">
                                <div class="action-title">Investigate Incident</div>
                                <div class="action-description">Analyze and debug server incidents</div>
                            </div>
                        </li>
                        <li class="action-item" onclick="selectAction('optimize-performance')">
                            <div class="action-icon">⚡</div>
                            <div class="action-details">
                                <div class="action-title">Optimize Performance</div>
                                <div class="action-description">Get recommendations for server optimization</div>
                            </div>
                        </li>
                        <li class="action-item" onclick="selectAction('security-audit')">
                            <div class="action-icon">🔒</div>
                            <div class="action-details">
                                <div class="action-title">Security Audit</div>
                                <div class="action-description">Check server security and get recommendations</div>
                            </div>
                        </li>
                        <li class="action-item" onclick="selectAction('backup-recovery')">
                            <div class="action-icon">💾</div>
                            <div class="action-details">
                                <div class="action-title">Backup & Recovery</div>
                                <div class="action-description">Manage server backups and recovery plans</div>
                            </div>
                        </li>
                    </ul>
                </div>
            </div>
            <script>
                const vscode = acquireVsCodeApi();
                
                function selectAction(action) {
                    vscode.postMessage({
                        type: 'selectAction',
                        action: action
                    });
                }
            </script>
        </body>
        </html>`;
    }
} 