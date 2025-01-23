import * as vscode from 'vscode';
import * as path from 'path';

export class ServerNode extends vscode.TreeItem {
    private _isConnected: boolean = false;

    constructor(
        public readonly label: string,
        public readonly host: string,
        public readonly username: string,
        public readonly port: number = 22
    ) {
        super(
            label,
            vscode.TreeItemCollapsibleState.None
        );
        this.updateProperties();
    }

    get isConnected(): boolean {
        return this._isConnected;
    }

    set isConnected(value: boolean) {
        this._isConnected = value;
        this.updateProperties();
    }

    private updateProperties() {
        this.tooltip = `${this.username}@${this.host}:${this.port}`;
        this.description = this._isConnected ? 'Connected' : 'Disconnected';
        this.iconPath = {
            light: vscode.Uri.file(path.join(__filename, '..', '..', 'resources', this._isConnected ? 'server-connected.svg' : 'server-disconnected.svg')),
            dark: vscode.Uri.file(path.join(__filename, '..', '..', 'resources', this._isConnected ? 'server-connected.svg' : 'server-disconnected.svg'))
        };
        this.contextValue = this._isConnected ? 'connectedServer' : 'disconnectedServer';
    }
} 