import * as vscode from 'vscode';
import * as path from 'path';
import { PrometheusConfig, SSHConfig } from './types';

export interface LogConfig {
    paths: string[];
}

export class ServerNode extends vscode.TreeItem {
    private _isConnected: boolean = false;
    private _prometheusConfig?: PrometheusConfig;
    private _logConfig?: LogConfig;
    private _isLocalOnly: boolean = false;
    private _sshConfig?: SSHConfig;

    constructor(
        public readonly label: string,
        public readonly host: string,
        public readonly username: string,
        public readonly port: number = 22,
        isLocalOnly: boolean = false,
        prometheusConfig?: PrometheusConfig,
        logConfig?: LogConfig,
        sshConfig?: SSHConfig
    ) {
        super(
            label,
            vscode.TreeItemCollapsibleState.None
        );
        this._prometheusConfig = prometheusConfig;
        this._logConfig = logConfig;
        this._isLocalOnly = isLocalOnly;
        this._sshConfig = sshConfig;
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

    get logConfig(): LogConfig | undefined {
        return this._logConfig;
    }

    set logConfig(config: LogConfig | undefined) {
        this._logConfig = config;
        this.updateProperties();
    }

    get isLocalOnly(): boolean {
        return this._isLocalOnly;
    }

    get sshConfig(): SSHConfig | undefined {
        return this._sshConfig;
    }

    set sshConfig(config: SSHConfig | undefined) {
        this._sshConfig = config;
    }

    private updateProperties() {
        if (this._isLocalOnly) {
            this.tooltip = `Local Prometheus at ${this._prometheusConfig?.url}:${this._prometheusConfig?.port}`;
            this.description = 'Local';
            this.contextValue = 'localPrometheus';
        } else {
            const features = [];
            if (this._prometheusConfig) features.push('Prometheus enabled');
            if (this._logConfig) features.push('Logs configured');
            
            this.tooltip = `${this.username}@${this.host}:${this.port}${features.length ? '\n' + features.join('\n') : ''}`;
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