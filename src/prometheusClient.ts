import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs';
import * as https from 'https';
import { Alert, PrometheusConfig, MetricValue } from './types';

export interface PrometheusQueryResult {
    metric: {
        [key: string]: string;
    };
    value: [number, string];
}

interface RawPrometheusAlert {
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
    private client: AxiosInstance;

    constructor(config: PrometheusConfig) {
        this.baseUrl = `${config.url}:${config.port}`;

        let httpsAgent;
        if (config.tls) {
            const cert = fs.readFileSync(config.tls.cert);
            const key = fs.readFileSync(config.tls.key);
            const ca = config.tls.ca ? fs.readFileSync(config.tls.ca) : undefined;

            httpsAgent = new https.Agent({
                cert,
                key,
                ca,
                rejectUnauthorized: true
            });
        }

        this.client = axios.create({
            baseURL: this.baseUrl,
            httpsAgent,
            validateStatus: (status) => status >= 200 && status < 300
        });
    }

    async queryInstant(query: string): Promise<PrometheusQueryResult[]> {
        try {
            const response = await this.client.get('/api/v1/query', {
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

    async queryRange(query: string, start: number, end: number, step: string): Promise<MetricValue[]> {
        try {
            const response = await this.client.get('/api/v1/query_range', {
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
            const response = await this.client.get('/api/v1/label/__name__/values');
            if (response.data.status === 'success') {
                return response.data.data;
            }
            throw new Error('Failed to fetch metric names');
        } catch (error) {
            console.error('Error fetching metric names:', error);
            throw error;
        }
    }

    async getAlerts(): Promise<Alert[]> {
        try {
            const response = await this.client.get('/api/v1/alerts');
            if (response.data.status === 'success') {
                return response.data.data.alerts
                    .filter((alert: RawPrometheusAlert) => alert.state === 'firing')
                    .map((alert: RawPrometheusAlert) => ({
                        name: alert.labels.alertname,
                        state: alert.state,
                        labels: alert.labels,
                        annotations: alert.annotations,
                        activeAt: alert.activeAt,
                        value: alert.value
                    }));
            }
            throw new Error('Failed to fetch alerts');
        } catch (error) {
            console.error('Error fetching alerts:', error);
            throw error;
        }
    }

    async getRules(): Promise<any[]> {
        try {
            const response = await this.client.get('/api/v1/rules');
            if (response.data.status === 'success') {
                return response.data.data.groups;
            }
            throw new Error('Failed to fetch rules');
        } catch (error) {
            console.error('Error fetching rules:', error);
            throw error;
        }
    }
} 