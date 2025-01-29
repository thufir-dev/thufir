export interface Alert {
    name: string;
    state: 'firing' | 'pending' | 'inactive';
    labels: Record<string, string>;
    annotations: Record<string, string>;
    activeAt: string;
    value: string;
}

export interface MetricValue {
    values: Array<[number, string]>;
}

export interface PrometheusConfig {
    url: string;
    port: number;
    tls?: {
        cert: string;
        key: string;
        ca?: string;
    };
}

export interface SSHAuthConfig {
    type: 'password' | 'privateKey';
    password?: string;
    privateKey?: {
        path: string;
        passphrase?: string;
    };
}

export interface SSHConfig {
    host: string;
    port: number;
    username: string;
    auth: SSHAuthConfig;
    keepaliveInterval?: number;
    readyTimeout?: number;
}

export interface ModelConfig {
    name: string;
    isCustom: boolean;
}

export interface LLMConfig {
    provider: 'openai' | 'anthropic' | 'google';
    apiKey: string;
    model?: string;
    customModels?: ModelConfig[];
} 