import axios from 'axios';

export interface PrometheusConfig {
    url: string;
    port: number;
}

export interface PrometheusQueryResult {
    metric: {
        [key: string]: string;
    };
    value: [number, string];
}

export interface PrometheusAlert {
    labels: {
        alertname: string;
        [key: string]: string;
    };
    annotations: {
        [key: string]: string;
    };
    state: 'firing' | 'pending' | 'inactive';
    activeAt: string;
    value: string;
}

export class PrometheusClient {
    private baseUrl: string;

    constructor(config: PrometheusConfig) {
        this.baseUrl = `${config.url}:${config.port}`;
    }

    async queryInstant(query: string): Promise<PrometheusQueryResult[]> {
        try {
            const response = await axios.get(`${this.baseUrl}/api/v1/query`, {
                params: {
                    query: query
                }
            });

            if (response.data.status === 'success') {
                return response.data.data.result;
            }
            throw new Error('Query failed');
        } catch (error) {
            console.error('Prometheus query error:', error);
            throw error;
        }
    }

    async queryRange(query: string, start: number, end: number, step: string): Promise<PrometheusQueryResult[]> {
        try {
            const response = await axios.get(`${this.baseUrl}/api/v1/query_range`, {
                params: {
                    query: query,
                    start: start,
                    end: end,
                    step: step
                }
            });

            if (response.data.status === 'success') {
                return response.data.data.result;
            }
            throw new Error('Query failed');
        } catch (error) {
            console.error('Prometheus query error:', error);
            throw error;
        }
    }

    async getMetricNames(): Promise<string[]> {
        try {
            const response = await axios.get(`${this.baseUrl}/api/v1/label/__name__/values`);
            if (response.data.status === 'success') {
                return response.data.data;
            }
            throw new Error('Failed to fetch metric names');
        } catch (error) {
            console.error('Error fetching metric names:', error);
            throw error;
        }
    }

    async getAlerts(): Promise<PrometheusAlert[]> {
        try {
            const response = await axios.get(`${this.baseUrl}/api/v1/alerts`);
            if (response.data.status === 'success') {
                return response.data.data.alerts;
            }
            throw new Error('Failed to fetch alerts');
        } catch (error) {
            console.error('Error fetching alerts:', error);
            throw error;
        }
    }

    async getRules(): Promise<any[]> {
        try {
            const response = await axios.get(`${this.baseUrl}/api/v1/rules`);
            if (response.data.status === 'success') {
                return response.data.data.groups.flatMap((group: any) => group.rules);
            }
            throw new Error('Failed to fetch rules');
        } catch (error) {
            console.error('Error fetching rules:', error);
            throw error;
        }
    }
} 