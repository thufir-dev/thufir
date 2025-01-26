import * as vscode from 'vscode';
import * as ssh2 from 'ssh2';
import { ServerNode, LogConfig } from './serverNode';
import { ServerMetricsProvider } from './serverMetricsProvider';
import { PrometheusClient } from './prometheusClient';
import { PrometheusDashboard } from './prometheusDashboard';
import { PrometheusConfig } from './types';

interface SavedServer {
    label: string;
    host: string;
    username: string;
    port?: number;
    prometheusConfig?: PrometheusConfig;
    logConfig?: LogConfig;
    isLocalOnly?: boolean;
}

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

        // Register commands
        context.subscriptions.push(
            vscode.commands.registerCommand('serverExplorer.configurePrometheus', (node: ServerNode) => {
                this.configurePrometheus(node);
            }),
            vscode.commands.registerCommand('serverExplorer.addLocalPrometheus', () => {
                this.addLocalPrometheus();
            }),
            vscode.commands.registerCommand('serverExplorer.openPrometheusDashboard', (node: ServerNode) => {
                this.openPrometheusDashboard(node);
            })
        );
    }

    private loadServers() {
        const savedServers = this.context.globalState.get<SavedServer[]>('servers') || [];
        this.servers = savedServers.map(s => new ServerNode(
            s.label, 
            s.host, 
            s.username, 
            s.port || 22,
            s.isLocalOnly || false,
            s.prometheusConfig,
            s.logConfig
        ));
    }

    public async saveServers() {
        const serversToSave: SavedServer[] = this.servers.map(s => ({
            label: s.label,
            host: s.host,
            username: s.username,
            port: s.port,
            prometheusConfig: s.prometheusConfig,
            logConfig: s.logConfig,
            isLocalOnly: s.isLocalOnly
        }));
        await this.context.globalState.update('servers', serversToSave);
    }

    public getServerKey(node: ServerNode): string {
        return `${node.username}@${node.host}:${node.port}`;
    }

    public getConnection(serverKey: string): ssh2.Client | undefined {
        return this.connections.get(serverKey);
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

    public async addServer() {
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

        // Ask if user wants to configure Prometheus
        const configurePrometheus = await vscode.window.showQuickPick(['Yes', 'No'], {
            placeHolder: 'Do you want to configure Prometheus for this server?'
        });

        let prometheusConfig;
        if (configurePrometheus === 'Yes') {
            const prometheusUrl = await vscode.window.showInputBox({
                placeHolder: 'Enter Prometheus URL (e.g., http://localhost)',
                value: 'http://localhost'
            });
            if (!prometheusUrl) return;

            const prometheusPortInput = await vscode.window.showInputBox({
                placeHolder: 'Enter Prometheus port (default: 9090)',
                value: '9090'
            });
            if (!prometheusPortInput) return;

            const prometheusPort = parseInt(prometheusPortInput);
            if (isNaN(prometheusPort) || prometheusPort < 1 || prometheusPort > 65535) {
                vscode.window.showErrorMessage('Invalid Prometheus port number. Please enter a number between 1 and 65535.');
                return;
            }

            prometheusConfig = {
                url: prometheusUrl,
                port: prometheusPort
            };
        }

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

            const server = new ServerNode(label, host, username, port, false, prometheusConfig);
            this.servers.push(server);
            this.saveServers();

            // Store the connection
            const serverKey = this.getServerKey(server);
            this.connections.set(serverKey, conn);
            
            // Update server state and start monitoring
            server.isConnected = true;
            this._onDidChangeTreeData.fire(undefined);
            this.metricsProvider.startMonitoring(conn, server);
            
            vscode.window.showInformationMessage(`Successfully added and connected to ${label}${prometheusConfig ? ' with Prometheus integration' : ''}`);
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

    async configurePrometheus(node: ServerNode) {
        // Ask if user wants to configure or remove Prometheus
        const action = node.prometheusConfig 
            ? await vscode.window.showQuickPick(['Reconfigure', 'Remove'], {
                placeHolder: 'Do you want to reconfigure or remove Prometheus?'
            })
            : 'Configure';

        if (!action) {
            return;
        }

        if (action === 'Remove') {
            node.prometheusConfig = undefined;
            this.saveServers();
            
            // If server is connected, restart monitoring without Prometheus
            const serverKey = this.getServerKey(node);
            const connection = this.connections.get(serverKey);
            if (connection && node.isConnected) {
                this.metricsProvider.stopMonitoring(node);
                this.metricsProvider.startMonitoring(connection, node);
            }
            
            vscode.window.showInformationMessage(`Removed Prometheus configuration from ${node.label}`);
            return;
        }

        const prometheusUrl = await vscode.window.showInputBox({
            placeHolder: 'Enter Prometheus URL (e.g., http://localhost)',
            value: node.prometheusConfig?.url || 'http://localhost'
        });
        if (!prometheusUrl) return;

        const prometheusPortInput = await vscode.window.showInputBox({
            placeHolder: 'Enter Prometheus port (default: 9090)',
            value: node.prometheusConfig?.port.toString() || '9090'
        });
        if (!prometheusPortInput) return;

        const prometheusPort = parseInt(prometheusPortInput);
        if (isNaN(prometheusPort) || prometheusPort < 1 || prometheusPort > 65535) {
            vscode.window.showErrorMessage('Invalid Prometheus port number. Please enter a number between 1 and 65535.');
            return;
        }

        // Test the Prometheus connection before saving
        try {
            const testClient = new PrometheusClient({
                url: prometheusUrl,
                port: prometheusPort
            });
            await testClient.getMetricNames();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            vscode.window.showErrorMessage(`Failed to connect to Prometheus: ${errorMessage}`);
            return;
        }

        // Update the server's Prometheus configuration
        node.prometheusConfig = {
            url: prometheusUrl,
            port: prometheusPort
        };
        this.saveServers();

        // If server is connected, restart monitoring with new Prometheus config
        const serverKey = this.getServerKey(node);
        const connection = this.connections.get(serverKey);
        if (connection && node.isConnected) {
            this.metricsProvider.stopMonitoring(node);
            this.metricsProvider.startMonitoring(connection, node);
        }

        vscode.window.showInformationMessage(`Successfully ${action.toLowerCase()}d Prometheus for ${node.label}`);
    }

    public async addLocalPrometheus() {
        const label = await vscode.window.showInputBox({
            placeHolder: 'Enter a name for this Prometheus connection'
        });
        if (!label) return;

        const prometheusUrl = await vscode.window.showInputBox({
            placeHolder: 'Enter Prometheus URL (e.g., http://localhost)',
            value: 'http://localhost'
        });
        if (!prometheusUrl) return;

        const prometheusPortInput = await vscode.window.showInputBox({
            placeHolder: 'Enter Prometheus port (default: 9090)',
            value: '9090'
        });
        if (!prometheusPortInput) return;

        const prometheusPort = parseInt(prometheusPortInput);
        if (isNaN(prometheusPort) || prometheusPort < 1 || prometheusPort > 65535) {
            vscode.window.showErrorMessage('Invalid port number. Please enter a number between 1 and 65535.');
            return;
        }

        // Test the Prometheus connection before saving
        try {
            const testClient = new PrometheusClient({
                url: prometheusUrl,
                port: prometheusPort
            });
            await testClient.getMetricNames();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            vscode.window.showErrorMessage(`Failed to connect to Prometheus: ${errorMessage}`);
            return;
        }

        const prometheusConfig = {
            url: prometheusUrl,
            port: prometheusPort
        };

        // Create a local-only server node
        const server = new ServerNode(
            label,
            'localhost',
            'local',
            9090,
            true, // isLocalOnly
            prometheusConfig
        );

        this.servers.push(server);
        this.saveServers();
        
        // Start monitoring Prometheus metrics
        this.metricsProvider.startMonitoringLocalPrometheus(server);
        this._onDidChangeTreeData.fire(undefined);
        
        vscode.window.showInformationMessage(`Successfully connected to local Prometheus at ${prometheusUrl}:${prometheusPort}`);
    }

    private openPrometheusDashboard(node: ServerNode) {
        if (!node.prometheusConfig) {
            vscode.window.showErrorMessage('This server does not have Prometheus configured');
            return;
        }

        PrometheusDashboard.createOrShow(node);
    }
} 