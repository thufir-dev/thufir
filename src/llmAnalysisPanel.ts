import * as vscode from 'vscode';
import { LLMService } from './llmService';

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

export class LLMAnalysisPanel {
    public static currentPanel: LLMAnalysisPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _messages: Message[] = [];
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel) {
        this._panel = panel;
        this._update();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'sendMessage':
                        await this._handleUserMessage(message.text);
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    public static createOrShow() {
        const column = vscode.ViewColumn.Three;

        if (LLMAnalysisPanel.currentPanel) {
            LLMAnalysisPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'llmAnalysis',
            'Chat',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        LLMAnalysisPanel.currentPanel = new LLMAnalysisPanel(panel);
    }

    public async analyzeAlert(alert: any) {
        const message = `Analyze this Prometheus alert and suggest remediation steps:\n${JSON.stringify(alert, null, 2)}`;
        await this._handleUserMessage(message);
    }

    private async _handleUserMessage(content: string) {
        // Add user message
        this._messages.push({ role: 'user', content });
        this._update();

        try {
            const llmService = await LLMService.getInstance();
            const response = await llmService.analyze(content);
            
            // Add assistant message
            this._messages.push({ role: 'assistant', content: response });
            this._update();
        } catch (error) {
            if (error instanceof Error) {
                vscode.window.showErrorMessage(`LLM Analysis failed: ${error.message}`);
            }
        }
    }

    public dispose() {
        LLMAnalysisPanel.currentPanel = undefined;

        this._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    private _update() {
        this._panel.webview.html = this._getHtmlForWebview();
    }

    private _getHtmlForWebview(): string {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Chat</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    padding: 0;
                    margin: 0;
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                }
                .container {
                    display: flex;
                    flex-direction: column;
                    height: 100vh;
                    padding: 16px;
                    max-width: 800px;
                    margin: 0 auto;
                }
                .messages {
                    flex-grow: 1;
                    overflow-y: auto;
                    margin-bottom: 16px;
                    padding-right: 8px;
                }
                .message {
                    margin-bottom: 24px;
                    padding: 12px 16px;
                    border-radius: 8px;
                    line-height: 1.5;
                }
                .user-message {
                    background-color: var(--vscode-textBlockQuote-background);
                    margin-left: 20%;
                    position: relative;
                }
                .user-message::before {
                    content: "You";
                    position: absolute;
                    top: -20px;
                    left: 0;
                    font-size: 12px;
                    color: var(--vscode-descriptionForeground);
                }
                .assistant-message {
                    background-color: var(--vscode-editor-inactiveSelectionBackground);
                    margin-right: 20%;
                    position: relative;
                }
                .assistant-message::before {
                    content: "Assistant";
                    position: absolute;
                    top: -20px;
                    left: 0;
                    font-size: 12px;
                    color: var(--vscode-descriptionForeground);
                }
                .input-container {
                    display: flex;
                    gap: 8px;
                    padding: 16px;
                    background-color: var(--vscode-editor-background);
                    border-top: 1px solid var(--vscode-panel-border);
                    position: sticky;
                    bottom: 0;
                }
                #userInput {
                    flex-grow: 1;
                    padding: 8px 12px;
                    border: 1px solid var(--vscode-input-border);
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border-radius: 6px;
                    font-size: 14px;
                    resize: none;
                    min-height: 40px;
                    max-height: 200px;
                    overflow-y: auto;
                }
                button {
                    padding: 8px 16px;
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 14px;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                }
                button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                pre {
                    white-space: pre-wrap;
                    word-wrap: break-word;
                    margin: 0;
                    font-family: var(--vscode-editor-font-family);
                    font-size: 14px;
                }
                .messages::-webkit-scrollbar {
                    width: 8px;
                }
                .messages::-webkit-scrollbar-track {
                    background-color: transparent;
                }
                .messages::-webkit-scrollbar-thumb {
                    background-color: var(--vscode-scrollbarSlider-background);
                    border-radius: 4px;
                }
                .messages::-webkit-scrollbar-thumb:hover {
                    background-color: var(--vscode-scrollbarSlider-hoverBackground);
                }
                #userInput:focus {
                    outline: none;
                    border-color: var(--vscode-focusBorder);
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="messages">
                    ${this._messages.map(msg => `
                        <div class="message ${msg.role}-message">
                            <pre>${this._escapeHtml(msg.content)}</pre>
                        </div>
                    `).join('')}
                </div>
                <div class="input-container">
                    <textarea
                        id="userInput"
                        placeholder="Ask a question..."
                        rows="1"
                        oninput="this.style.height = 'auto'; this.style.height = this.scrollHeight + 'px';"
                    ></textarea>
                    <button onclick="sendMessage()">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M1.5 8L3.5 13.5L14.5 8L3.5 2.5L1.5 8Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
                            <path d="M3.5 13.5L7.5 8L3.5 2.5" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
                        </svg>
                    </button>
                </div>
            </div>
            <script>
                const vscode = acquireVsCodeApi();
                const userInput = document.getElementById('userInput');
                const messagesDiv = document.querySelector('.messages');

                // Scroll to bottom on load
                messagesDiv.scrollTop = messagesDiv.scrollHeight;

                function sendMessage() {
                    const text = userInput.value.trim();
                    if (text) {
                        vscode.postMessage({
                            command: 'sendMessage',
                            text: text
                        });
                        userInput.value = '';
                        userInput.style.height = 'auto';
                    }
                }

                userInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                    }
                });

                // Auto-scroll when new messages arrive
                const observer = new MutationObserver(() => {
                    messagesDiv.scrollTop = messagesDiv.scrollHeight;
                });
                observer.observe(messagesDiv, { childList: true, subtree: true });
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
} 