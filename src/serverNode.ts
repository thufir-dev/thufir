import * as vscode from 'vscode';
import * as path from 'path';
import { PrometheusConfig } from './prometheusClient';

export class ServerNode extends vscode.TreeItem {
    private _isConnected: boolean = false;
    private _prometheusConfig?: PrometheusConfig;
    private _isLocalOnly: boolean = false;

    constructor(
        public readonly label: string,
        public readonly host: string,
        public readonly username: string,
        public readonly port: number = 22,
        prometheusConfig?: PrometheusConfig,
        isLocalOnly: boolean = false
    ) {
        super(
            label,
            vscode.TreeItemCollapsibleState.None
        );
        this._prometheusConfig = prometheusConfig;
        this._isLocalOnly = isLocalOnly;
        if (isLocalOnly) {
            this._isConnected = true; // Local connections are always considered connected
        }
        this.updateProperties();
    }

    get isConnected(): boolean {
        return this._isConnected;
    }

    set isConnected(value: boolean) {
        if (!this._isLocalOnly) { // Only allow changing connection state for non-local servers
            this._isConnected = value;
            this.updateProperties();
        }
    }

    get prometheusConfig(): PrometheusConfig | undefined {
        return this._prometheusConfig;
    }

    set prometheusConfig(config: PrometheusConfig | undefined) {
        this._prometheusConfig = config;
        this.updateProperties();
    }

    get isLocalOnly(): boolean {
        return this._isLocalOnly;
    }

    private updateProperties() {
        if (this._isLocalOnly) {
            this.tooltip = `Local Prometheus at ${this._prometheusConfig?.url}:${this._prometheusConfig?.port}`;
            this.description = 'Local';
            this.contextValue = 'localPrometheus';
        } else {
            this.tooltip = `${this.username}@${this.host}:${this.port}${this._prometheusConfig ? '\nPrometheus enabled' : ''}`;
            this.description = this._isConnected ? 'Connected' : 'Disconnected';
            this.contextValue = this._isConnected ? 'connectedServer' : 'disconnectedServer';
        }

        this.iconPath = {
            light: vscode.Uri.file(path.join(__filename, '..', '..', 'resources', 
                this._isLocalOnly ? 'prometheus.svg' : (this._isConnected ? 'server-connected.svg' : 'server-disconnected.svg'))),
            dark: vscode.Uri.file(path.join(__filename, '..', '..', 'resources', 
                this._isLocalOnly ? 'prometheus.svg' : (this._isConnected ? 'server-connected.svg' : 'server-disconnected.svg')))
        };
    }
} 