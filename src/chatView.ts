import * as vscode from 'vscode';
import { LLMService } from './llmService';
import { ServerNode } from './serverNode';
import { Alert, MetricValue } from './types';
import { ServerMetrics } from './serverMetricsProvider';
import { PrometheusClient } from './prometheusClient';

interface Message {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export class ChatView implements vscode.WebviewViewProvider {
    public static readonly viewType = 'chat';
    private _view?: vscode.WebviewView;
    private _messages: Message[] = [];

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
            switch (data.command) {
                case 'sendMessage':
                    await this._handleUserMessage(data.text);
                    break;
            }
        });
    }

    private async _handleUserMessage(content: string) {
        // Add user message
        this._messages.push({ role: 'user', content });
        this._updateView();

        try {
            const llmService = await LLMService.getInstance();
            const response = await llmService.analyze(content);
            
            // Add assistant message
            this._messages.push({ role: 'assistant', content: response });
            this._updateView();
        } catch (error) {
            if (error instanceof Error) {
                vscode.window.showErrorMessage(`Chat failed: ${error.message}`);
            }
        }
    }

    private _updateView() {
        if (this._view) {
            this._view.webview.html = this._getHtmlForWebview(this._view.webview);
        }
    }

    public async analyzeAlert(
        node: ServerNode, 
        alerts: Alert[], 
        contextMetrics: string[],
        relatedMetrics: Record<string, MetricValue>
    ) {
        if (!this._view) {
            return;
        }

        // Make sure the view is revealed
        this._view.show(true); // true means preserve focus

        // Add the initial system message
        this._messages.push({
            role: 'system',
            content: `Alert Analysis Request for ${node.label}`
        });

        // Add a temporary loading message
        const loadingMessageIndex = this._messages.length;
        this._messages.push({
            role: 'assistant',
            content: 'Analyzing alert data...'
        });
        this._updateView();

        const llmService = await LLMService.getInstance();
        
        // Format the alert data for analysis
        const alertAnalysisPrompt = `
            I need help analyzing the following Prometheus alerts from server ${node.label} (${node.host}):
            
            Alerts:
            ${alerts.map(alert => `
                Name: ${alert.name}
                Severity: ${alert.labels?.severity}
                Description: ${alert.annotations?.description || alert.annotations?.message || 'No description'}
                Started: ${alert.activeAt}
                Value: ${alert.value}
                Labels: ${Object.entries(alert.labels)
                    .map(([key, value]) => `${key}="${value}"`)
                    .join(', ')}
            `).join('\n')}
            
            Related Metrics (Last Hour):
            ${Object.entries(relatedMetrics).map(([name, data]) => `
                ${name}:
                - Latest Value: ${data.values?.[data.values.length - 1]?.[1] || 'N/A'}
                - Min Value: ${Math.min(...(data.values?.map((v: [number, string]) => parseFloat(v[1])) || []))}
                - Max Value: ${Math.max(...(data.values?.map((v: [number, string]) => parseFloat(v[1])) || []))}
            `).join('\n')}

            Available Context Metrics:
            ${contextMetrics.join('\n')}
            
            Please provide a comprehensive analysis including:
            1. Root cause analysis - What might be causing this alert?
            2. Potential impact - How does this affect the system and users?
            3. Recommended immediate actions - What should be done right now?
            4. Long-term remediation steps - How can we prevent this in the future?
            5. Related metrics analysis - How do the related metrics correlate with this alert?
            6. Prevention strategies - What monitoring or automation could help prevent this?
        `;

        try {
            const analysis = await llmService.analyze(alertAnalysisPrompt);
            // Replace the loading message with the actual analysis
            this._messages[loadingMessageIndex] = {
                role: 'assistant',
                content: analysis
            };
            this._updateView();
            
            // Ensure the view is visible and focused after the analysis
            this._view.show(true);
        } catch (error) {
            // Replace loading message with error
            this._messages[loadingMessageIndex] = {
                role: 'assistant',
                content: 'Failed to analyze alert. Please try again.'
            };
            this._updateView();
            
            if (error instanceof Error) {
                vscode.window.showErrorMessage(`Failed to analyze alert: ${error.message}`);
            }
        }
    }

    public async analyzeMetrics(node: ServerNode, metrics: ServerMetrics) {
        if (!this._view) {
            return;
        }

        // Make sure the view is revealed
        this._view.show(true); // true means preserve focus

        // Add the initial system message
        this._messages.push({
            role: 'system',
            content: `Metrics Analysis Request for ${node.label}`
        });

        // Add a temporary loading message
        const loadingMessageIndex = this._messages.length;
        this._messages.push({
            role: 'assistant',
            content: 'Analyzing server metrics...'
        });
        this._updateView();

        const llmService = await LLMService.getInstance();
        
        // Format the metrics data for analysis
        const metricsAnalysisPrompt = `
            I need help analyzing the following server metrics from ${node.label} (${node.host}):
            
            System Metrics:
            - CPU Usage: ${metrics.cpu.toFixed(1)}%
            - Memory Usage: ${(metrics.memory.used / 1024).toFixed(1)}GB / ${(metrics.memory.total / 1024).toFixed(1)}GB (${((metrics.memory.used / metrics.memory.total) * 100).toFixed(1)}%)
            - Disk Usage: ${metrics.disk.used}GB / ${metrics.disk.total}GB (${((metrics.disk.used / metrics.disk.total) * 100).toFixed(1)}%)
            - System Uptime: ${(metrics.uptime / 3600).toFixed(1)} hours
            - Load Average (1m, 5m, 15m): ${metrics.loadAverage.map((v: number) => v.toFixed(2)).join(', ')}
            
            ${metrics.prometheusMetrics ? `
            Prometheus Metrics:
            ${Object.entries(metrics.prometheusMetrics)
                .map(([key, value]) => `- ${key}: ${typeof value === 'number' ? value.toFixed(2) : value}`)
                .join('\n')}
            ` : ''}
            
            Please provide a comprehensive analysis including:
            1. System Health Overview - What is the overall health status of the server?
            2. Resource Utilization - Are any resources (CPU, memory, disk) under stress?
            3. Performance Analysis - How is the server performing based on load averages and metrics?
            4. Potential Issues - Are there any concerning patterns or potential problems?
            5. Optimization Recommendations - What can be done to improve performance?
            6. Monitoring Suggestions - What additional metrics or alerts would be helpful?
        `;

        try {
            const analysis = await llmService.analyze(metricsAnalysisPrompt);
            // Replace the loading message with the actual analysis
            this._messages[loadingMessageIndex] = {
                role: 'assistant',
                content: analysis
            };
            this._updateView();
            
            // Ensure the view is visible and focused after the analysis
            this._view.show(true);
        } catch (error) {
            // Replace loading message with error
            this._messages[loadingMessageIndex] = {
                role: 'assistant',
                content: 'Failed to analyze metrics. Please try again.'
            };
            this._updateView();
            
            if (error instanceof Error) {
                vscode.window.showErrorMessage(`Failed to analyze metrics: ${error.message}`);
            }
        }
    }

    public async analyzePerformance(node: ServerNode, metrics: ServerMetrics) {
        if (!this._view) {
            return;
        }

        // Make sure the view is revealed
        this._view.show(true); // true means preserve focus

        // Add the initial system message
        this._messages.push({
            role: 'system',
            content: `Performance Optimization Analysis for ${node.label}`
        });

        // Add a temporary loading message
        const loadingMessageIndex = this._messages.length;
        this._messages.push({
            role: 'assistant',
            content: 'Analyzing system performance...'
        });
        this._updateView();

        const llmService = await LLMService.getInstance();
        
        // Format the metrics data for performance analysis
        const performanceAnalysisPrompt = `
            I need help optimizing the performance of server ${node.label} (${node.host}). Here are the current metrics:
            
            System Metrics:
            - CPU Usage: ${metrics.cpu.toFixed(1)}%
            - Memory Usage: ${(metrics.memory.used / 1024).toFixed(1)}GB / ${(metrics.memory.total / 1024).toFixed(1)}GB (${((metrics.memory.used / metrics.memory.total) * 100).toFixed(1)}%)
            - Disk Usage: ${metrics.disk.used}GB / ${metrics.disk.total}GB (${((metrics.disk.used / metrics.disk.total) * 100).toFixed(1)}%)
            - System Uptime: ${(metrics.uptime / 3600).toFixed(1)} hours
            - Load Average (1m, 5m, 15m): ${metrics.loadAverage.map((v: number) => v.toFixed(2)).join(', ')}
            
            ${metrics.prometheusMetrics ? `
            Prometheus Metrics:
            ${Object.entries(metrics.prometheusMetrics)
                .map(([key, value]) => `- ${key}: ${typeof value === 'number' ? value.toFixed(2) : value}`)
                .join('\n')}
            ` : ''}
            
            Please provide a comprehensive performance optimization analysis including:
            1. Performance Bottlenecks - Identify any current or potential bottlenecks
            2. Resource Efficiency - Analyze how efficiently resources are being used
            3. System Tuning - Recommend system-level optimizations (e.g., kernel parameters, service configurations)
            4. Resource Allocation - Suggest optimal resource allocation adjustments
            5. Monitoring Improvements - Recommend additional metrics or alerts to track performance
            6. Long-term Recommendations - Strategic improvements for sustained performance
            7. Cost Optimization - If applicable, suggest ways to optimize resource usage for cost efficiency
            8. Best Practices - Recommend industry best practices for similar workloads
        `;

        try {
            const analysis = await llmService.analyze(performanceAnalysisPrompt);
            // Replace the loading message with the actual analysis
            this._messages[loadingMessageIndex] = {
                role: 'assistant',
                content: analysis
            };
            this._updateView();
            
            // Ensure the view is visible and focused after the analysis
            this._view.show(true);
        } catch (error) {
            // Replace loading message with error
            this._messages[loadingMessageIndex] = {
                role: 'assistant',
                content: 'Failed to analyze performance. Please try again.'
            };
            this._updateView();
            
            if (error instanceof Error) {
                vscode.window.showErrorMessage(`Failed to analyze performance: ${error.message}`);
            }
        }
    }

    public async analyzeIncident(node: ServerNode, metrics: ServerMetrics) {
        if (!this._view) {
            return;
        }

        // Make sure the view is revealed
        this._view.show(true);

        // Add the initial system message
        this._messages.push({
            role: 'system',
            content: `Incident Investigation for ${node.label}`
        });

        // Add a temporary loading message
        const loadingMessageIndex = this._messages.length;
        this._messages.push({
            role: 'assistant',
            content: 'Analyzing incident data...'
        });
        this._updateView();

        const llmService = await LLMService.getInstance();
        
        // Get Prometheus alerts if available
        let alerts: Alert[] = [];
        let contextMetrics: string[] = [];
        let relatedMetrics: Record<string, MetricValue> = {};

        if (node.prometheusConfig) {
            try {
                const prometheusClient = new PrometheusClient(node.prometheusConfig);
                alerts = await prometheusClient.getAlerts();
                
                // Get context metrics for active alerts
                if (alerts.length > 0) {
                    contextMetrics = await prometheusClient.getMetricNames();
                    const now = Math.floor(Date.now() / 1000);
                    const timeRange = 3600; // 1 hour of context
                    
                    for (const alert of alerts) {
                        try {
                            const result = await prometheusClient.queryRange(
                                alert.labels.alertname,
                                now - timeRange,
                                now,
                                '15s'
                            );
                            if (result.length > 0) {
                                relatedMetrics[alert.labels.alertname] = result[0];
                            }
                        } catch (error) {
                            console.error(`Failed to fetch metric for alert ${alert.name}:`, error);
                        }
                    }
                }
            } catch (error) {
                console.error('Failed to fetch Prometheus data:', error);
            }
        }

        // Format the incident analysis prompt
        const incidentAnalysisPrompt = `
            I need help investigating potential incidents on server ${node.label} (${node.host}):
            
            System Metrics:
            - CPU Usage: ${metrics.cpu.toFixed(1)}%
            - Memory Usage: ${(metrics.memory.used / 1024).toFixed(1)}GB / ${(metrics.memory.total / 1024).toFixed(1)}GB (${((metrics.memory.used / metrics.memory.total) * 100).toFixed(1)}%)
            - Disk Usage: ${metrics.disk.used}GB / ${metrics.disk.total}GB (${((metrics.disk.used / metrics.disk.total) * 100).toFixed(1)}%)
            - System Uptime: ${(metrics.uptime / 3600).toFixed(1)} hours
            - Load Average (1m, 5m, 15m): ${metrics.loadAverage.map((v: number) => v.toFixed(2)).join(', ')}
            
            ${metrics.prometheusMetrics ? `
            Prometheus Metrics:
            ${Object.entries(metrics.prometheusMetrics)
                .map(([key, value]) => `- ${key}: ${typeof value === 'number' ? value.toFixed(2) : value}`)
                .join('\n')}
            ` : ''}

            ${alerts.length > 0 ? `
            Active Alerts:
            ${alerts.map(alert => `
                Name: ${alert.name}
                Severity: ${alert.labels?.severity}
                Description: ${alert.annotations?.description || alert.annotations?.message || 'No description'}
                Started: ${alert.activeAt}
                Value: ${alert.value}
                Labels: ${Object.entries(alert.labels)
                    .map(([key, value]) => `${key}="${value}"`)
                    .join(', ')}
            `).join('\n')}
            ` : 'No active alerts.'}
            
            Please provide a comprehensive incident analysis including:
            1. Incident Detection - Are there any active or potential incidents?
            2. Severity Assessment - How severe are the identified issues?
            3. Root Cause Analysis - What might be causing these issues?
            4. Impact Analysis - What systems and users are affected?
            5. Correlation Analysis - How do the metrics and alerts correlate?
            6. Immediate Actions - What should be done right now?
            7. Investigation Steps - What additional information should we gather?
            8. Prevention Recommendations - How can we prevent similar incidents?
        `;

        try {
            const analysis = await llmService.analyze(incidentAnalysisPrompt);
            // Replace the loading message with the actual analysis
            this._messages[loadingMessageIndex] = {
                role: 'assistant',
                content: analysis
            };
            this._updateView();
            
            // Ensure the view is visible and focused after the analysis
            this._view.show(true);
        } catch (error) {
            // Replace loading message with error
            this._messages[loadingMessageIndex] = {
                role: 'assistant',
                content: 'Failed to analyze incident. Please try again.'
            };
            this._updateView();
            
            if (error instanceof Error) {
                vscode.window.showErrorMessage(`Failed to analyze incident: ${error.message}`);
            }
        }
    }

    public async analyzeRemediation(node: ServerNode, metrics: ServerMetrics) {
        if (!this._view) {
            return;
        }

        // Make sure the view is revealed
        this._view.show(true);

        // Add the initial system message
        this._messages.push({
            role: 'system',
            content: `Remediation Analysis for ${node.label}`
        });

        // Add a temporary loading message
        const loadingMessageIndex = this._messages.length;
        this._messages.push({
            role: 'assistant',
            content: 'Analyzing remediation options...'
        });
        this._updateView();

        const llmService = await LLMService.getInstance();
        
        // Get Prometheus alerts if available
        let alerts: Alert[] = [];
        let contextMetrics: string[] = [];
        let relatedMetrics: Record<string, MetricValue> = {};

        if (node.prometheusConfig) {
            try {
                const prometheusClient = new PrometheusClient(node.prometheusConfig);
                alerts = await prometheusClient.getAlerts();
                
                // Get context metrics for active alerts
                if (alerts.length > 0) {
                    contextMetrics = await prometheusClient.getMetricNames();
                    const now = Math.floor(Date.now() / 1000);
                    const timeRange = 3600; // 1 hour of context
                    
                    for (const alert of alerts) {
                        try {
                            const result = await prometheusClient.queryRange(
                                alert.labels.alertname,
                                now - timeRange,
                                now,
                                '15s'
                            );
                            if (result.length > 0) {
                                relatedMetrics[alert.labels.alertname] = result[0];
                            }
                        } catch (error) {
                            console.error(`Failed to fetch metric for alert ${alert.name}:`, error);
                        }
                    }
                }
            } catch (error) {
                console.error('Failed to fetch Prometheus data:', error);
            }
        }

        // Format the remediation analysis prompt
        const remediationAnalysisPrompt = `
            I need help determining remediation steps for server ${node.label} (${node.host}):
            
            System Metrics:
            - CPU Usage: ${metrics.cpu.toFixed(1)}%
            - Memory Usage: ${(metrics.memory.used / 1024).toFixed(1)}GB / ${(metrics.memory.total / 1024).toFixed(1)}GB (${((metrics.memory.used / metrics.memory.total) * 100).toFixed(1)}%)
            - Disk Usage: ${metrics.disk.used}GB / ${metrics.disk.total}GB (${((metrics.disk.used / metrics.disk.total) * 100).toFixed(1)}%)
            - System Uptime: ${(metrics.uptime / 3600).toFixed(1)} hours
            - Load Average (1m, 5m, 15m): ${metrics.loadAverage.map((v: number) => v.toFixed(2)).join(', ')}
            
            ${metrics.prometheusMetrics ? `
            Prometheus Metrics:
            ${Object.entries(metrics.prometheusMetrics)
                .map(([key, value]) => `- ${key}: ${typeof value === 'number' ? value.toFixed(2) : value}`)
                .join('\n')}
            ` : ''}

            ${alerts.length > 0 ? `
            Active Alerts:
            ${alerts.map(alert => `
                Name: ${alert.name}
                Severity: ${alert.labels?.severity}
                Description: ${alert.annotations?.description || alert.annotations?.message || 'No description'}
                Started: ${alert.activeAt}
                Value: ${alert.value}
                Labels: ${Object.entries(alert.labels)
                    .map(([key, value]) => `${key}="${value}"`)
                    .join(', ')}
            `).join('\n')}
            ` : 'No active alerts.'}
            
            Please provide a comprehensive remediation analysis including:
            1. Issue Summary - What are the current issues that need remediation?
            2. Priority Assessment - Which issues should be addressed first?
            3. Immediate Actions - What steps should be taken right now?
            4. Resource Requirements - What resources are needed for remediation?
            5. Risk Assessment - What are the risks associated with each remediation step?
            6. Implementation Plan - Step-by-step remediation instructions
            7. Verification Steps - How to verify the remediation was successful?
            8. Future Prevention - Long-term recommendations to prevent recurrence
        `;

        try {
            const analysis = await llmService.analyze(remediationAnalysisPrompt);
            // Replace the loading message with the actual analysis
            this._messages[loadingMessageIndex] = {
                role: 'assistant',
                content: analysis
            };
            this._updateView();
            
            // Ensure the view is visible and focused after the analysis
            this._view.show(true);
        } catch (error) {
            // Replace loading message with error
            this._messages[loadingMessageIndex] = {
                role: 'assistant',
                content: 'Failed to analyze remediation options. Please try again.'
            };
            this._updateView();
            
            if (error instanceof Error) {
                vscode.window.showErrorMessage(`Failed to analyze remediation options: ${error.message}`);
            }
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
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
                    height: 100vh;
                    overflow: hidden;
                }
                .container {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                }
                .messages {
                    flex: 1;
                    overflow-y: auto;
                    padding: 12px;
                    padding-bottom: 0;
                }
                .message {
                    margin-bottom: 16px;
                    padding: 8px 12px;
                    border-radius: 6px;
                    line-height: 1.4;
                    font-size: 12px;
                }
                .user-message {
                    background-color: var(--vscode-button-background);
                    margin-left: 16%;
                    position: relative;
                }
                .user-message::before {
                    content: "You";
                    position: absolute;
                    top: -16px;
                    left: 0;
                    font-size: 11px;
                    color: var(--vscode-descriptionForeground);
                }
                .assistant-message {
                    background-color: var(--vscode-editor-inactiveSelectionBackground);
                    margin-right: 16%;
                    position: relative;
                }
                .assistant-message::before {
                    content: "Assistant";
                    position: absolute;
                    top: -16px;
                    left: 0;
                    font-size: 11px;
                    color: var(--vscode-descriptionForeground);
                }
                .system-message {
                    background-color: var(--vscode-textBlockQuote-background);
                    margin-right: 16%;
                    position: relative;
                    font-style: italic;
                    opacity: 0.8;
                }
                .system-message::before {
                    content: "System";
                    position: absolute;
                    top: -16px;
                    left: 0;
                    font-size: 11px;
                    color: var(--vscode-descriptionForeground);
                }
                .loading {
                    color: var(--vscode-descriptionForeground);
                    font-style: italic;
                }
                .input-container {
                    display: flex;
                    gap: 6px;
                    padding: 12px;
                    background-color: var(--vscode-editor-background);
                    border-top: 1px solid var(--vscode-panel-border);
                    position: sticky;
                    bottom: 0;
                }
                #userInput {
                    flex-grow: 1;
                    padding: 6px 10px;
                    border: 1px solid var(--vscode-input-border);
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border-radius: 4px;
                    font-size: 12px;
                    resize: none;
                    min-height: 18px;
                    max-height: 120px;
                    overflow-y: auto;
                    line-height: 1.4;
                }
                button {
                    padding: 6px;
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-width: 28px;
                }
                button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                pre {
                    white-space: pre-wrap;
                    word-wrap: break-word;
                    margin: 0;
                    font-family: var(--vscode-editor-font-family);
                    font-size: 12px;
                }
                code {
                    font-family: var(--vscode-editor-font-family);
                    font-size: 12px;
                    padding: 2px 4px;
                    background-color: var(--vscode-textCodeBlock-background);
                    border-radius: 3px;
                }
                p {
                    margin: 0 0 8px 0;
                }
                p:last-child {
                    margin-bottom: 0;
                }
                ul, ol {
                    margin: 0 0 8px 0;
                    padding-left: 20px;
                }
                li {
                    margin-bottom: 4px;
                }
                li:last-child {
                    margin-bottom: 0;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="messages">
                    ${this._messages.map(msg => `
                        <div class="message ${msg.role}-message ${msg.content === 'Analyzing alert data...' ? 'loading' : ''}">
                            <pre>${this._escapeHtml(msg.content)}</pre>
                        </div>
                    `).join('')}
                </div>
                <div class="input-container">
                    <textarea
                        id="userInput"
                        placeholder="Ask a question..."
                        rows="1"
                        oninput="this.style.height = '20px'; this.style.height = Math.min(this.scrollHeight, 150) + 'px';"
                    ></textarea>
                    <button onclick="sendMessage()" title="Send message">
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
                        userInput.style.height = '20px';
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

                // Focus input on load
                userInput.focus();
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