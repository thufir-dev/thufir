// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { ServerExplorerProvider } from './serverExplorer';
import { ServerMetricsProvider } from './serverMetricsProvider';
import { ServerMetricsPanel } from './serverMetricsPanel';
import { ServerNode } from './serverNode';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	const metricsProvider = new ServerMetricsProvider();
	const serverExplorerProvider = new ServerExplorerProvider(context, metricsProvider);

	// Register views
	vscode.window.registerTreeDataProvider('serverExplorer', serverExplorerProvider);
	vscode.window.registerTreeDataProvider('serverMetrics', metricsProvider);

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
}

// This method is called when your extension is deactivated
export function deactivate() {}
