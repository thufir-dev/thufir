import * as vscode from 'vscode';
import axios from 'axios';
import { LLMConfig, ModelConfig } from './types';

export class LLMService {
    private static instance: LLMService;
    private config: LLMConfig | undefined;

    private constructor() {
        this.loadConfig();
    }

    public static async getInstance(): Promise<LLMService> {
        if (!LLMService.instance) {
            LLMService.instance = new LLMService();
        }
        return LLMService.instance;
    }

    private loadConfig() {
        const config = vscode.workspace.getConfiguration('thufir.llm');
        const provider = config.get<'openai' | 'anthropic' | 'google'>('provider');
        const apiKey = config.get<string>('apiKey');
        const model = config.get<string>('model');
        const customModels = config.get<ModelConfig[]>('customModels') || [];

        if (provider && apiKey) {
            this.config = { provider, apiKey, model, customModels };
        }
    }

    public async configure(): Promise<void> {
        const provider = await vscode.window.showQuickPick(
            ['openai', 'anthropic', 'google'],
            { 
                placeHolder: 'Select LLM provider',
                ignoreFocusOut: true
            }
        ) as 'openai' | 'anthropic' | 'google' | undefined;
        
        if (!provider) {
            throw new Error('LLM provider not selected');
        }

        const apiKey = await vscode.window.showInputBox({
            prompt: `Enter your ${provider} API key`,
            password: true,
            ignoreFocusOut: true
        });

        if (!apiKey) {
            throw new Error('API key not provided');
        }

        let model: string | undefined;
        const customModels = await this.getCustomModels(provider);
        
        const modelType = await vscode.window.showQuickPick(
            ['Default Models', 'Custom Model'],
            {
                placeHolder: 'Select model type',
                ignoreFocusOut: true
            }
        );

        if (modelType === 'Default Models') {
            const defaultModels = this.getDefaultModels(provider);
            model = await vscode.window.showQuickPick(
                defaultModels,
                { 
                    placeHolder: 'Select model',
                    ignoreFocusOut: true
                }
            ) || defaultModels[0];
        } else if (modelType === 'Custom Model') {
            const existingModels = customModels.map(m => m.name);
            const modelAction = await vscode.window.showQuickPick(
                [...existingModels, '+ Add New Model'],
                {
                    placeHolder: 'Select or add custom model',
                    ignoreFocusOut: true
                }
            );

            if (modelAction === '+ Add New Model') {
                const newModel = await vscode.window.showInputBox({
                    prompt: 'Enter the model name',
                    ignoreFocusOut: true
                });

                if (newModel) {
                    customModels.push({ name: newModel, isCustom: true });
                    model = newModel;
                }
            } else {
                model = modelAction;
            }
        }

        // Save the configuration
        const config = vscode.workspace.getConfiguration('thufir.llm');
        await config.update('provider', provider, true);
        await config.update('apiKey', apiKey, true);
        await config.update('model', model, true);
        await config.update('customModels', customModels, true);

        this.config = { provider, apiKey, model, customModels };
    }

    private getDefaultModels(provider: string): string[] {
        switch (provider) {
            case 'openai':
                return ['gpt-4', 'gpt-3.5-turbo'];
            case 'anthropic':
                return ['claude-3-opus-20240229', 'claude-3-sonnet-20240229'];
            case 'google':
                return ['gemini-pro'];
            default:
                return [];
        }
    }

    private async getCustomModels(provider: string): Promise<ModelConfig[]> {
        const config = vscode.workspace.getConfiguration('thufir.llm');
        return config.get<ModelConfig[]>('customModels') || [];
    }

    private async ensureConfig(): Promise<void> {
        if (!this.config) {
            await this.configure();
        }
    }

    public async analyze(content: string): Promise<string> {
        try {
            await this.ensureConfig();
            
            if (!this.config) {
                throw new Error('LLM not configured');
            }

            switch (this.config.provider) {
                case 'openai':
                    return this.analyzeWithOpenAI(content);
                case 'anthropic':
                    return this.analyzeWithAnthropic(content);
                case 'google':
                    return this.analyzeWithGoogle(content);
                default:
                    throw new Error('Unsupported LLM provider');
            }
        } catch (error) {
            if (error instanceof Error && 
                (error.message.includes('API key') || 
                 error.message.includes('provider') || 
                 error.message.includes('not configured'))) {
                this.config = undefined;
                const config = vscode.workspace.getConfiguration('thufir.llm');
                await config.update('provider', undefined, true);
                await config.update('apiKey', undefined, true);
                await config.update('model', undefined, true);
            }
            throw error;
        }
    }

    private async analyzeWithOpenAI(content: string): Promise<string> {
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: this.config?.model || 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a helpful assistant analyzing server metrics and Prometheus alerts. Provide clear explanations and actionable remediation steps.'
                    },
                    {
                        role: 'user',
                        content
                    }
                ]
            },
            {
                headers: {
                    'Authorization': `Bearer ${this.config?.apiKey}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        return response.data.choices[0].message.content;
    }

    private async analyzeWithAnthropic(content: string): Promise<string> {
        const response = await axios.post(
            'https://api.anthropic.com/v1/messages',
            {
                model: this.config?.model || 'claude-3-sonnet-20240229',
                max_tokens: 1024,
                messages: [
                    {
                        role: 'user',
                        content
                    }
                ]
            },
            {
                headers: {
                    'x-api-key': this.config?.apiKey,
                    'anthropic-version': '2023-06-01',
                    'Content-Type': 'application/json'
                }
            }
        );

        return response.data.content[0].text;
    }

    private async analyzeWithGoogle(content: string): Promise<string> {
        const response = await axios.post(
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
            {
                contents: [
                    {
                        parts: [
                            {
                                text: content
                            }
                        ]
                    }
                ]
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': this.config?.apiKey
                }
            }
        );

        return response.data.candidates[0].content.parts[0].text;
    }
}