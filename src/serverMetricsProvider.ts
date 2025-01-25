import * as vscode from 'vscode';
import { Client, ClientChannel } from 'ssh2';
import { ServerNode } from './serverNode';
import { PrometheusClient } from './prometheusClient';

export interface ServerMetrics {
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
    prometheusMetrics?: {
        [key: string]: number;
    };
}

export class MetricItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly value: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
        this.description = value;
    }
}

export class ServerMetricsProvider implements vscode.TreeDataProvider<MetricItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<MetricItem | undefined | null | void> = new vscode.EventEmitter<MetricItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<MetricItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private serverConnections: Map<string, Client> = new Map();
    private serverMetrics: Map<string, ServerMetrics> = new Map();
    private updateIntervals: Map<string, NodeJS.Timeout> = new Map();
    private prometheusClients: Map<string, PrometheusClient> = new Map();

    constructor() {}

    getTreeItem(element: MetricItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: MetricItem): Thenable<MetricItem[]> {
        if (element) {
            return Promise.resolve([]);
        }

        const items: MetricItem[] = [];
        this.serverMetrics.forEach((metrics, serverKey) => {
            items.push(new MetricItem(`Server: ${serverKey}`, '', vscode.TreeItemCollapsibleState.Expanded));
            items.push(new MetricItem('CPU Usage', `${metrics.cpu.toFixed(1)}%`, vscode.TreeItemCollapsibleState.None));
            items.push(new MetricItem('Memory', `${(metrics.memory.used / 1024).toFixed(1)}GB / ${(metrics.memory.total / 1024).toFixed(1)}GB`, vscode.TreeItemCollapsibleState.None));
            items.push(new MetricItem('Disk', `${metrics.disk.used}GB / ${metrics.disk.total}GB`, vscode.TreeItemCollapsibleState.None));
            items.push(new MetricItem('Uptime', `${(metrics.uptime / 3600).toFixed(1)} hours`, vscode.TreeItemCollapsibleState.None));
            items.push(new MetricItem('Load Average', metrics.loadAverage.map(v => v.toFixed(2)).join(', '), vscode.TreeItemCollapsibleState.None));
        });

        return Promise.resolve(items);
    }

    private getServerKey(node: ServerNode): string {
        return `${node.label} (${node.username}@${node.host})`;
    }

    startMonitoring(connection: Client, node: ServerNode) {
        const serverKey = this.getServerKey(node);
        this.serverConnections.set(serverKey, connection);

        // Initialize Prometheus client if configured
        if (node.prometheusConfig) {
            this.prometheusClients.set(serverKey, new PrometheusClient(node.prometheusConfig));
        }

        this.updateMetrics(node);

        // Set up periodic updates
        const interval = setInterval(() => this.updateMetrics(node), 5000);
        this.updateIntervals.set(serverKey, interval);
    }

    stopMonitoring(node: ServerNode) {
        const serverKey = this.getServerKey(node);
        const connection = this.serverConnections.get(serverKey);
        const interval = this.updateIntervals.get(serverKey);

        if (interval) {
            clearInterval(interval);
            this.updateIntervals.delete(serverKey);
        }

        if (connection) {
            connection.end();
            this.serverConnections.delete(serverKey);
        }

        this.prometheusClients.delete(serverKey);
        this.serverMetrics.delete(serverKey);
        this._onDidChangeTreeData.fire();
    }

    private async updateMetrics(node: ServerNode) {
        const serverKey = this.getServerKey(node);
        const connection = this.serverConnections.get(serverKey);
        const prometheusClient = this.prometheusClients.get(serverKey);

        if (!connection) {
            return;
        }

        try {
            const metrics = await this.collectMetrics(connection);

            // Add Prometheus metrics if available
            if (prometheusClient) {
                try {
                    const prometheusMetrics: { [key: string]: number } = {};
                    
                    // Query some basic Prometheus metrics
                    const queries = [
                        { name: 'node_cpu_seconds_total', query: 'rate(node_cpu_seconds_total{mode="idle"}[1m])' },
                        { name: 'node_memory_MemAvailable_bytes', query: 'node_memory_MemAvailable_bytes' },
                        { name: 'node_filesystem_avail_bytes', query: 'node_filesystem_avail_bytes' }
                    ];

                    for (const { name, query } of queries) {
                        const result = await prometheusClient.queryInstant(query);
                        if (result.length > 0) {
                            prometheusMetrics[name] = parseFloat(result[0].value[1]);
                        }
                    }

                    metrics.prometheusMetrics = prometheusMetrics;
                } catch (error) {
                    console.error('Error fetching Prometheus metrics:', error);
                }
            }

            this.serverMetrics.set(serverKey, metrics);
            this._onDidChangeTreeData.fire();
        } catch (error) {
            console.error(`Error collecting metrics for ${serverKey}:`, error);
        }
    }

    private collectMetrics(connection: Client): Promise<ServerMetrics> {
        return new Promise((resolve, reject) => {
            const commands = [
                "top -bn1 | grep 'Cpu(s)' | awk '{print $2}'", // CPU usage
                "free -m | awk 'NR==2{printf \"%s %s\", $3, $2}'", // Memory usage
                "df -h / | awk 'NR==2{printf \"%s %s\", $3, $2}'", // Disk usage
                "uptime | awk '{print $3}'", // Uptime
                "uptime | grep -o 'load average:.*' | awk '{print $3, $4, $5}'" // Load average
            ];

            let results: string[] = [];

            const executeCommand = (index: number) => {
                if (index >= commands.length) {
                    try {
                        const [cpu, memory, disk, uptime, loadAvg] = results;
                        const [memUsed, memTotal] = memory.split(' ');
                        const [diskUsed, diskTotal] = disk.split(' ');
                        const loadAvgValues = loadAvg.split(',').map(v => parseFloat(v.trim()));

                        resolve({
                            cpu: parseFloat(cpu),
                            memory: {
                                used: parseInt(memUsed),
                                total: parseInt(memTotal)
                            },
                            disk: {
                                used: parseFloat(diskUsed),
                                total: parseFloat(diskTotal)
                            },
                            uptime: parseFloat(uptime),
                            loadAverage: loadAvgValues
                        });
                    } catch (error) {
                        reject(error);
                    }
                    return;
                }

                connection.exec(commands[index], (err: Error | undefined, stream: ClientChannel) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    let data = '';
                    stream.on('data', (chunk: Buffer | string) => {
                        data += chunk;
                    });

                    stream.on('end', () => {
                        results[index] = data.trim();
                        executeCommand(index + 1);
                    });

                    stream.on('error', (error: Error) => {
                        reject(error);
                    });
                });
            };

            executeCommand(0);
        });
    }

    getMetrics(node: ServerNode): ServerMetrics | undefined {
        return this.serverMetrics.get(this.getServerKey(node));
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    startMonitoringLocalPrometheus(node: ServerNode) {
        if (!node.prometheusConfig) {
            return;
        }

        const serverKey = this.getServerKey(node);
        this.prometheusClients.set(serverKey, new PrometheusClient(node.prometheusConfig));

        // Initialize empty metrics for the server
        const emptyMetrics: ServerMetrics = {
            cpu: 0,
            memory: { used: 0, total: 0 },
            disk: { used: 0, total: 0 },
            uptime: 0,
            loadAverage: [0, 0, 0],
            prometheusMetrics: {}
        };
        this.serverMetrics.set(serverKey, emptyMetrics);

        // Set up periodic updates
        const interval = setInterval(() => this.updateLocalPrometheusMetrics(node), 5000);
        this.updateIntervals.set(serverKey, interval);

        // Initial update
        this.updateLocalPrometheusMetrics(node);
    }

    private async updateLocalPrometheusMetrics(node: ServerNode) {
        const serverKey = this.getServerKey(node);
        const prometheusClient = this.prometheusClients.get(serverKey);

        if (!prometheusClient) {
            return;
        }

        try {
            const metrics = this.serverMetrics.get(serverKey) || {
                cpu: 0,
                memory: { used: 0, total: 0 },
                disk: { used: 0, total: 0 },
                uptime: 0,
                loadAverage: [0, 0, 0],
                prometheusMetrics: {}
            };

            // Query Prometheus metrics
            const queries = [
                { name: 'node_cpu_seconds_total', query: 'rate(node_cpu_seconds_total{mode="idle"}[1m])' },
                { name: 'node_memory_MemAvailable_bytes', query: 'node_memory_MemAvailable_bytes' },
                { name: 'node_filesystem_avail_bytes', query: 'node_filesystem_avail_bytes' }
            ];

            const prometheusMetrics: { [key: string]: number } = {};
            for (const { name, query } of queries) {
                const result = await prometheusClient.queryInstant(query);
                if (result.length > 0) {
                    prometheusMetrics[name] = parseFloat(result[0].value[1]);
                }
            }

            metrics.prometheusMetrics = prometheusMetrics;

            // For local-only connections, we'll use Prometheus metrics to populate the main metrics
            if (node.isLocalOnly && prometheusMetrics['node_cpu_seconds_total']) {
                metrics.cpu = (1 - prometheusMetrics['node_cpu_seconds_total']) * 100;
            }

            this.serverMetrics.set(serverKey, metrics);
            this._onDidChangeTreeData.fire();
        } catch (error) {
            console.error(`Error collecting Prometheus metrics for ${serverKey}:`, error);
        }
    }
}