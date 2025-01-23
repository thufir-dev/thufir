import * as vscode from 'vscode';
import * as ssh2 from 'ssh2';
import { ServerNode } from './serverNode';
import { ServerMetricsProvider } from './serverMetricsProvider';

export class ServerExplorerProvider implements vscode.TreeDataProvider<ServerNode> {
    private _onDidChangeTreeData: vscode.EventEmitter<ServerNode | undefined | null | void> = new vscode.EventEmitter<ServerNode | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ServerNode | undefined | null | void> = this._onDidChangeTreeData.event;

    private servers: ServerNode[] = [];
    private context: vscode.ExtensionContext;
    private metricsProvider: ServerMetricsProvider;
    private connections: Map<string, ssh2.Client> = new Map();

    constructor(context: vscode.ExtensionContext, metricsProvider: ServerMetricsProvider) {
        this.context = context;
        this.metricsProvider = metricsProvider;
        this.loadServers();
    }

    private loadServers() {
        const savedServers = this.context.globalState.get<any[]>('servers') || [];
        this.servers = savedServers.map(s => new ServerNode(s.label, s.host, s.username, s.port || 22));
    }

    private saveServers() {
        this.context.globalState.update('servers', this.servers.map(s => ({
            label: s.label,
            host: s.host,
            username: s.username,
            port: s.port
        })));
    }

    private getServerKey(node: ServerNode): string {
        return `${node.username}@${node.host}:${node.port}`;
    }

    getTreeItem(element: ServerNode): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ServerNode): Thenable<ServerNode[]> {
        if (element) {
            return Promise.resolve([]);
        }
        return Promise.resolve(this.servers);
    }

    async addServer() {
        const label = await vscode.window.showInputBox({
            placeHolder: 'Enter a name for the server'
        });
        if (!label) return;

        const host = await vscode.window.showInputBox({
            placeHolder: 'Enter the hostname or IP address'
        });
        if (!host) return;

        const username = await vscode.window.showInputBox({
            placeHolder: 'Enter the SSH username'
        });
        if (!username) return;

        const portInput = await vscode.window.showInputBox({
            placeHolder: 'Enter the SSH port (default: 22)',
            value: '22'
        });
        if (!portInput) return;

        const port = parseInt(portInput);
        if (isNaN(port) || port < 1 || port > 65535) {
            vscode.window.showErrorMessage('Invalid port number. Please enter a number between 1 and 65535.');
            return;
        }

        const password = await vscode.window.showInputBox({
            prompt: `Enter password for ${username}@${host}:${port}`,
            password: true
        });
        if (!password) return;

        try {
            const conn = new ssh2.Client();
            
            await new Promise((resolve, reject) => {
                let errorMessage = '';
                
                conn.on('ready', () => {
                    resolve(conn);
                });

                conn.on('error', (err) => {
                    errorMessage = err.message;
                    reject(new Error(errorMessage));
                });

                conn.on('timeout', () => {
                    errorMessage = 'Connection timed out';
                    reject(new Error(errorMessage));
                });

                conn.connect({
                    host: host,
                    port: port,
                    username: username,
                    password: password,
                    readyTimeout: 10000,
                    debug: (msg) => console.log(msg)
                });
            });

            const server = new ServerNode(label, host, username, port);
            this.servers.push(server);
            this.saveServers();

            // Store the connection
            const serverKey = this.getServerKey(server);
            this.connections.set(serverKey, conn);
            
            // Update server state and start monitoring
            server.isConnected = true;
            this._onDidChangeTreeData.fire(undefined);
            this.metricsProvider.startMonitoring(conn, server);
            
            vscode.window.showInformationMessage(`Successfully added and connected to ${label}`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            vscode.window.showErrorMessage(`Failed to connect: ${errorMessage}`);
            console.error('Connection error:', error);
        }
    }

    async connectToServer(node: ServerNode) {
        try {
            const password = await vscode.window.showInputBox({
                prompt: `Enter password for ${node.username}@${node.host}:${node.port}`,
                password: true
            });
            if (!password) return;

            const conn = new ssh2.Client();
            
            await new Promise((resolve, reject) => {
                let errorMessage = '';
                
                conn.on('ready', () => {
                    resolve(conn);
                });

                conn.on('error', (err) => {
                    errorMessage = err.message;
                    reject(new Error(errorMessage));
                });

                conn.on('timeout', () => {
                    errorMessage = 'Connection timed out';
                    reject(new Error(errorMessage));
                });

                conn.connect({
                    host: node.host,
                    port: node.port,
                    username: node.username,
                    password: password,
                    readyTimeout: 10000,
                    debug: (msg) => console.log(msg)
                });
            });

            // Store the connection
            const serverKey = this.getServerKey(node);
            this.connections.set(serverKey, conn);
            
            // Update server state and start monitoring
            node.isConnected = true;
            this._onDidChangeTreeData.fire(undefined);
            this.metricsProvider.startMonitoring(conn, node);
            
            vscode.window.showInformationMessage(`Connected to ${node.label}`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            vscode.window.showErrorMessage(`Failed to connect: ${errorMessage}`);
            console.error('Connection error:', error);
        }
    }

    disconnectFromServer(node: ServerNode) {
        const serverKey = this.getServerKey(node);
        const conn = this.connections.get(serverKey);
        if (conn) {
            conn.end();
            this.connections.delete(serverKey);
        }
        this.metricsProvider.stopMonitoring(node);
        node.isConnected = false;
        this._onDidChangeTreeData.fire(undefined);
        vscode.window.showInformationMessage(`Disconnected from ${node.label}`);
    }

    removeServer(node: ServerNode) {
        if (node.isConnected) {
            this.disconnectFromServer(node);
        }
        const index = this.servers.indexOf(node);
        if (index > -1) {
            this.servers.splice(index, 1);
            this.saveServers();
            this._onDidChangeTreeData.fire(undefined);
        }
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }
} 