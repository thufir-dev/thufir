import * as vscode from 'vscode';
import { Client, ClientChannel } from 'ssh2';
import { ServerNode } from './serverNode';
import { LLMService } from './llmService';

export interface LogEntry {
    timestamp: Date;
    level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
    source: string;
    message: string;
    raw: string;
}

export interface LogAnalysis {
    patterns: string[];
    anomalies: string[];
    recommendations: string[];
}

export class LogManager {
    private static instance: LogManager;
    private logStreams: Map<string, ClientChannel> = new Map();
    private logBuffer: Map<string, LogEntry[]> = new Map();
    private readonly maxBufferSize = 1000; // Keep last 1000 log entries per server

    private constructor() {}

    public static getInstance(): LogManager {
        if (!LogManager.instance) {
            LogManager.instance = new LogManager();
        }
        return LogManager.instance;
    }

    private getServerKey(node: ServerNode): string {
        return `${node.label} (${node.username}@${node.host})`;
    }

    public async startLogCollection(connection: Client, node: ServerNode, logPaths: string[]): Promise<void> {
        const serverKey = this.getServerKey(node);
        
        // Stop any existing log collection
        await this.stopLogCollection(node);

        // Initialize log buffer
        this.logBuffer.set(serverKey, []);

        // Start tailing each log file
        for (const logPath of logPaths) {
            try {
                const stream = await this.tailLogFile(connection, logPath);
                this.logStreams.set(`${serverKey}:${logPath}`, stream);

                stream.on('data', (data: Buffer) => {
                    const entries = this.parseLogEntries(data.toString(), logPath);
                    this.addToBuffer(serverKey, entries);
                });

                stream.stderr.on('data', (data: Buffer) => {
                    console.error(`Error tailing ${logPath}:`, data.toString());
                });
            } catch (error) {
                console.error(`Failed to tail ${logPath}:`, error);
                vscode.window.showErrorMessage(`Failed to collect logs from ${logPath}`);
            }
        }
    }

    public async stopLogCollection(node: ServerNode): Promise<void> {
        const serverKey = this.getServerKey(node);
        
        // Close all log streams for this server
        for (const [streamKey, stream] of this.logStreams.entries()) {
            if (streamKey.startsWith(serverKey)) {
                stream.end();
                this.logStreams.delete(streamKey);
            }
        }

        // Clear the log buffer
        this.logBuffer.delete(serverKey);
    }

    private tailLogFile(connection: Client, logPath: string): Promise<ClientChannel> {
        return new Promise((resolve, reject) => {
            connection.exec(`tail -f ${logPath}`, (err, stream) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(stream);
            });
        });
    }

    private parseLogEntries(logData: string, source: string): LogEntry[] {
        const entries: LogEntry[] = [];
        const lines = logData.split('\n').filter(line => line.trim());

        for (const line of lines) {
            try {
                // Basic log parsing - can be extended for different log formats
                const entry = this.parseLogLine(line, source);
                if (entry) {
                    entries.push(entry);
                }
            } catch (error) {
                console.error('Failed to parse log line:', error);
            }
        }

        return entries;
    }

    private parseLogLine(line: string, source: string): LogEntry | null {
        // This is a basic parser - you can extend it for different log formats
        const timestampRegex = /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/;
        const levelRegex = /\b(INFO|WARN(?:ING)?|ERROR|DEBUG)\b/i;

        const timestampMatch = line.match(timestampRegex);
        const levelMatch = line.match(levelRegex);

        if (!timestampMatch) {
            return null;
        }

        return {
            timestamp: new Date(timestampMatch[0]),
            level: (levelMatch?.[1]?.toUpperCase() as LogEntry['level']) || 'INFO',
            source,
            message: line.substring(timestampMatch[0].length).trim(),
            raw: line
        };
    }

    private addToBuffer(serverKey: string, entries: LogEntry[]): void {
        let buffer = this.logBuffer.get(serverKey) || [];
        buffer = [...buffer, ...entries];

        // Keep buffer size in check
        if (buffer.length > this.maxBufferSize) {
            buffer = buffer.slice(buffer.length - this.maxBufferSize);
        }

        this.logBuffer.set(serverKey, buffer);
    }

    public getLogEntries(node: ServerNode, filter?: {
        level?: LogEntry['level'],
        source?: string,
        since?: Date,
        search?: string
    }): LogEntry[] {
        const serverKey = this.getServerKey(node);
        let entries = this.logBuffer.get(serverKey) || [];

        if (filter) {
            entries = entries.filter(entry => {
                if (filter.level && entry.level !== filter.level) return false;
                if (filter.source && entry.source !== filter.source) return false;
                if (filter.since && entry.timestamp < filter.since) return false;
                if (filter.search && !entry.raw.toLowerCase().includes(filter.search.toLowerCase())) return false;
                return true;
            });
        }

        return entries;
    }

    public async analyzeLogPatterns(node: ServerNode): Promise<LogAnalysis> {
        const entries = this.getLogEntries(node);
        if (entries.length === 0) {
            return { patterns: [], anomalies: [], recommendations: [] };
        }

        try {
            const llmService = await LLMService.getInstance();
            
            // Prepare log data for analysis
            const logSample = entries.slice(-100).map(e => e.raw).join('\n');
            const prompt = `Analyze these server logs and provide:
1. Common patterns or trends you observe
2. Any anomalies or potential issues
3. Specific recommendations for addressing identified issues

Logs:
${logSample}`;

            const analysis = await llmService.analyze(prompt);
            
            // Parse the analysis into structured format
            const sections = analysis.split('\n\n');
            return {
                patterns: this.extractSection(sections[0]),
                anomalies: this.extractSection(sections[1]),
                recommendations: this.extractSection(sections[2])
            };
        } catch (error) {
            console.error('Failed to analyze logs:', error);
            throw error;
        }
    }

    private extractSection(text: string): string[] {
        return text
            .split('\n')
            .filter(line => line.trim().startsWith('-'))
            .map(line => line.trim().substring(1).trim());
    }
} 