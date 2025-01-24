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
} 