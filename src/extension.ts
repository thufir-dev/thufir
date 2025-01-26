// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { ServerExplorerProvider } from './serverExplorer';
import { ServerMetricsProvider } from './serverMetricsProvider';
import { ServerMetricsPanel } from './serverMetricsPanel';
import { ServerNode } from './serverNode';
import { LLMService } from './llmService';
import { SREAgentView } from './sreAgentView';
import { ChatView } from './chatView';
import { PrometheusClient } from './prometheusClient';
import { Alert, MetricValue } from './types';
import { LogManager } from './logManager';
import { LogViewPanel } from './logViewPanel';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	const metricsProvider = new ServerMetricsProvider();
	const serverExplorerProvider = new ServerExplorerProvider(context, metricsProvider);
	const sreAgentProvider = new SREAgentView(context.extensionUri);
	const chatProvider = new ChatView(context.extensionUri);

	// Register views
	vscode.window.registerTreeDataProvider('serverExplorer', serverExplorerProvider);
	vscode.window.registerTreeDataProvider('serverMetrics', metricsProvider);
	vscode.window.registerWebviewViewProvider('sreAgent', sreAgentProvider);
	vscode.window.registerWebviewViewProvider('chat', chatProvider);

	// Register commands
	context.subscriptions.push(
		vscode.commands.registerCommand('serverExplorer.addServer', () => {
			serverExplorerProvider.addServer();
		}),

		vscode.commands.registerCommand('serverExplorer.removeServer', (node: ServerNode) => {
			serverExplorerProvider.removeServer(node);
		}),

		vscode.commands.registerCommand('serverExplorer.connect', (node: ServerNode) => {
			serverExplorerProvider.connectToServer(node);
		}),

		vscode.commands.registerCommand('serverExplorer.disconnect', (node: ServerNode) => {
			serverExplorerProvider.disconnectFromServer(node);
		}),

		vscode.commands.registerCommand('serverExplorer.refresh', () => {
			serverExplorerProvider.refresh();
		}),

		vscode.commands.registerCommand('serverExplorer.showMetrics', (node: ServerNode) => {
			ServerMetricsPanel.createOrShow(node, metricsProvider);
		}),

		vscode.commands.registerCommand('thufir.openAIAnalysis', () => {
			vscode.commands.executeCommand('workbench.view.extension.ai-assistant');
		}),

		vscode.commands.registerCommand('thufir.configureLLM', async () => {
			try {
				const llmService = await LLMService.getInstance();
				await llmService.configure();
				vscode.window.showInformationMessage('AI provider configured successfully');
			} catch (error) {
				if (error instanceof Error) {
					vscode.window.showErrorMessage(`Failed to configure AI provider: ${error.message}`);
				}
			}
		}),

		vscode.commands.registerCommand('thufir.analyzeAlert', async (data: { 
			serverNode: ServerNode, 
			alert: Alert, 
			contextMetrics: string[],
			relatedMetrics: Record<string, any>
		}) => {
			try {
				const llmService = await LLMService.getInstance();
				
				if (!data.serverNode.prometheusConfig) {
					vscode.window.showErrorMessage('Prometheus is not configured for this server');
					return;
				}

				// Send to chat for analysis
				vscode.commands.executeCommand('workbench.view.extension.ai-assistant');
				chatProvider.analyzeAlert(
					data.serverNode, 
					[data.alert], 
					data.contextMetrics,
					data.relatedMetrics
				);
			} catch (error) {
				if (error instanceof Error) {
					vscode.window.showErrorMessage(`Failed to analyze alert: ${error.message}`);
				}
			}
		}),

		vscode.commands.registerCommand('thufir.analyzeMetrics', async (node: ServerNode) => {
			try {
				const metrics = metricsProvider.getMetrics(node);
				if (!metrics) {
					vscode.window.showErrorMessage('No metrics available for this server');
					return;
				}

				// First reveal the AI Assistant panel
				await vscode.commands.executeCommand('workbench.view.extension.ai-assistant');
				
				// Then focus specifically on the chat view within the panel
				await vscode.commands.executeCommand('chat.focus');

				// Send to chat for analysis
				chatProvider.analyzeMetrics(node, metrics);
			} catch (error) {
				if (error instanceof Error) {
					vscode.window.showErrorMessage(`Failed to analyze metrics: ${error.message}`);
				}
			}
		}),

		vscode.commands.registerCommand('thufir.optimizePerformance', async (node: ServerNode) => {
			try {
				const metrics = metricsProvider.getMetrics(node);
				if (!metrics) {
					vscode.window.showErrorMessage('No metrics available for this server');
					return;
				}

				// First reveal the AI Assistant panel
				await vscode.commands.executeCommand('workbench.view.extension.ai-assistant');
				
				// Then focus specifically on the chat view within the panel
				await vscode.commands.executeCommand('chat.focus');

				// Send to chat for performance analysis
				chatProvider.analyzePerformance(node, metrics);
			} catch (error) {
				if (error instanceof Error) {
					vscode.window.showErrorMessage(`Failed to analyze performance: ${error.message}`);
				}
			}
		}),

		vscode.commands.registerCommand('thufir.analyzeIncident', async (node: ServerNode) => {
			try {
				// Get server metrics if available
				const metrics = metricsProvider.getMetrics(node);
				
				// If no server metrics but Prometheus is configured, we can still proceed
				if (!metrics && !node.prometheusConfig) {
					vscode.window.showErrorMessage('No metrics or Prometheus data available for this server');
					return;
				}

				// First reveal the AI Assistant panel
				await vscode.commands.executeCommand('workbench.view.extension.ai-assistant');
				
				// Then focus specifically on the chat view within the panel
				await vscode.commands.executeCommand('chat.focus');

				// Send to chat for incident analysis
				chatProvider.analyzeIncident(node, metrics || {
					cpu: 0,
					memory: { used: 0, total: 0 },
					disk: { used: 0, total: 0 },
					uptime: 0,
					loadAverage: [0, 0, 0]
				});
			} catch (error) {
				if (error instanceof Error) {
					vscode.window.showErrorMessage(`Failed to analyze incident: ${error.message}`);
				}
			}
		}),

		vscode.commands.registerCommand('thufir.analyzeRemediation', async (node: ServerNode) => {
			try {
				// Get server metrics if available
				const metrics = metricsProvider.getMetrics(node);
				
				// If no server metrics but Prometheus is configured, we can still proceed
				if (!metrics && !node.prometheusConfig) {
					vscode.window.showErrorMessage('No metrics or Prometheus data available for this server');
					return;
				}

				// First reveal the AI Assistant panel
				await vscode.commands.executeCommand('workbench.view.extension.ai-assistant');
				
				// Then focus specifically on the chat view within the panel
				await vscode.commands.executeCommand('chat.focus');

				// Send to chat for remediation analysis
				chatProvider.analyzeRemediation(node, metrics || {
					cpu: 0,
					memory: { used: 0, total: 0 },
					disk: { used: 0, total: 0 },
					uptime: 0,
					loadAverage: [0, 0, 0]
				});
			} catch (error) {
				if (error instanceof Error) {
					vscode.window.showErrorMessage(`Failed to analyze remediation: ${error.message}`);
				}
			}
		}),

		vscode.commands.registerCommand('chat.focus', () => {
			// Focus on the chat view
			vscode.commands.executeCommand('workbench.view.extension.ai-assistant');
			const chatViewId = 'chat';
			const views = vscode.window.visibleTextEditors.filter(
				editor => editor.document.uri.scheme === 'vscode-webview' && 
				editor.document.uri.path.includes(chatViewId)
			);
			if (views.length > 0) {
				vscode.window.showTextDocument(views[0].document, views[0].viewColumn, true);
			}
		}),

		vscode.commands.registerCommand('serverExplorer.viewLogs', async (node: ServerNode) => {
			if (!node.isConnected) {
				vscode.window.showErrorMessage('Please connect to the server first');
				return;
			}

			if (!node.logConfig) {
				const configure = await vscode.window.showInformationMessage(
					'Log sources are not configured for this server. Would you like to configure them now?',
					'Configure', 'Cancel'
				);
				
				if (configure === 'Configure') {
					vscode.commands.executeCommand('serverExplorer.configureLogs', node);
				}
				return;
			}

			LogViewPanel.createOrShow(node);
		}),

		vscode.commands.registerCommand('serverExplorer.configureLogs', async (node: ServerNode) => {
			if (!node.isConnected) {
				vscode.window.showErrorMessage('Please connect to the server first');
				return;
			}

			const defaultPaths = vscode.workspace.getConfiguration('thufir.logs').get<string[]>('defaultPaths') || [];
			const currentPaths = node.logConfig?.paths || [];

			const logPaths = await vscode.window.showInputBox({
				prompt: 'Enter log file paths (comma-separated)',
				value: currentPaths.length > 0 ? currentPaths.join(',') : defaultPaths.join(','),
				validateInput: value => {
					if (!value.trim()) {
						return 'Please enter at least one log file path';
					}
					return null;
				}
			});

			if (!logPaths) {
				return;
			}

			const paths = logPaths.split(',').map(p => p.trim()).filter(p => p);
			node.logConfig = { paths };

			// Save the server configuration
			await serverExplorerProvider.saveServers();

			// Start log collection if the server is connected
			const serverKey = serverExplorerProvider.getServerKey(node);
			const connection = serverExplorerProvider.getConnection(serverKey);
			if (connection) {
				const logManager = LogManager.getInstance();
				await logManager.startLogCollection(connection, node, paths);
			}

			vscode.window.showInformationMessage(`Log sources configured for ${node.label}`);
		})
	);

	// Create server icons
	const iconPath = vscode.Uri.joinPath(context.extensionUri, 'resources');
	vscode.workspace.fs.createDirectory(iconPath);

	const serverIconContent = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
		<path fill="#C5C5C5" d="M13 2H3C2.4 2 2 2.4 2 3v2c0 .6.4 1 1 1h10c.6 0 1-.4 1-1V3c0-.6-.4-1-1-1zm0 5H3C2.4 7 2 7.4 2 8v2c0 .6.4 1 1 1h10c.6 0 1-.4 1-1V8c0-.6-.4-1-1-1zm0 5H3c-.6 0-1 .4-1 1v2c0 .6.4 1 1 1h10c.6 0 1-.4 1-1v-2c0-.6-.4-1-1-1z"/>
	</svg>`;

	const metricsIconContent = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
		<path fill="#C5C5C5" d="M15 2v12H1V2h14zm1-1H0v14h16V1zM5 11H2V8h3v3zm4-6H6v6h3V5zm4 3h-3v3h3V8z"/>
	</svg>`;

	const serverConnectedIconContent = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
		<path fill="#89D185" d="M13 2H3C2.4 2 2 2.4 2 3v2c0 .6.4 1 1 1h10c.6 0 1-.4 1-1V3c0-.6-.4-1-1-1zm0 5H3C2.4 7 2 7.4 2 8v2c0 .6.4 1 1 1h10c.6 0 1-.4 1-1V8c0-.6-.4-1-1-1zm0 5H3c-.6 0-1 .4-1 1v2c0 .6.4 1 1 1h10c.6 0 1-.4 1-1v-2c0-.6-.4-1-1-1z"/>
	</svg>`;

	const serverDisconnectedIconContent = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
		<path fill="#C5C5C5" d="M13 2H3C2.4 2 2 2.4 2 3v2c0 .6.4 1 1 1h10c.6 0 1-.4 1-1V3c0-.6-.4-1-1-1zm0 5H3C2.4 7 2 7.4 2 8v2c0 .6.4 1 1 1h10c.6 0 1-.4 1-1V8c0-.6-.4-1-1-1zm0 5H3c-.6 0-1 .4-1 1v2c0 .6.4 1 1 1h10c.6 0 1-.4 1-1v-2c0-.6-.4-1-1-1z"/>
		<path fill="#E51400" d="M12 3l-1-1-3 3-3-3-1 1 3 3-3 3 1 1 3-3 3 3 1-1-3-3z"/>
	</svg>`;

	// Write icons to files
	const writeIcon = async (filename: string, content: string) => {
		const iconUri = vscode.Uri.joinPath(iconPath, filename);
		const encoder = new TextEncoder();
		await vscode.workspace.fs.writeFile(iconUri, encoder.encode(content));
	};

	writeIcon('server.svg', serverIconContent);
	writeIcon('metrics.svg', metricsIconContent);
	writeIcon('server-connected.svg', serverConnectedIconContent);
	writeIcon('server-disconnected.svg', serverDisconnectedIconContent);

	// Export providers for access by other parts of the extension
	return {
		serverExplorerProvider,
		metricsProvider,
		chatProvider
	};
}

// This method is called when your extension is deactivated
export function deactivate() {}
