import * as vscode from 'vscode';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface GitCommit {
    hash: string;
    author: string;
    date: Date;
    message: string;
    diff?: string;
}

interface SuspiciousPattern {
    type: 'emergency_fix' | 'reversion' | 'infinite_loop' | 'thread_blocking' | 'process_termination';
    description: string;
    severity: 'high' | 'medium' | 'low';
}

export class GitService {
    private static instance: GitService;
    private repoPath?: string;

    private constructor() {
        this.loadConfig();
    }

    public static getInstance(): GitService {
        if (!GitService.instance) {
            GitService.instance = new GitService();
        }
        return GitService.instance;
    }

    private loadConfig() {
        const config = vscode.workspace.getConfiguration('thufir.git');
        this.repoPath = config.get<string>('repositoryPath');
    }

    public async configureRepository(): Promise<void> {
        const repoPath = await vscode.window.showInputBox({
            prompt: 'Enter the path to your Git repository',
            value: this.repoPath || '',
            validateInput: async (value) => {
                if (!value) {
                    return 'Repository path cannot be empty';
                }
                try {
                    await this.validateGitRepo(value);
                    return null;
                } catch (error) {
                    return 'Invalid Git repository path';
                }
            }
        });

        if (!repoPath) {
            return;
        }

        // Save the configuration
        const config = vscode.workspace.getConfiguration('thufir.git');
        await config.update('repositoryPath', repoPath, true);
        this.repoPath = repoPath;
    }

    private async validateGitRepo(path: string): Promise<void> {
        try {
            await execAsync('git rev-parse --git-dir', { cwd: path });
        } catch (error) {
            throw new Error('Invalid Git repository');
        }
    }

    public async getRecentCommits(hours: number = 24): Promise<GitCommit[]> {
        if (!this.repoPath) {
            throw new Error('Git repository not configured');
        }

        const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
        const { stdout } = await execAsync(
            `git log --since="${since}" --format="%H|%an|%aI|%s"`,
            { cwd: this.repoPath }
        );

        const commits: GitCommit[] = [];
        const lines = stdout.trim().split('\n');

        for (const line of lines) {
            if (!line) continue;
            const [hash, author, dateStr, message] = line.split('|');
            const commit: GitCommit = {
                hash,
                author,
                date: new Date(dateStr),
                message,
                diff: await this.getCommitDiff(hash)
            };
            commits.push(commit);
        }

        return commits;
    }

    private async getCommitDiff(hash: string): Promise<string> {
        if (!this.repoPath) {
            throw new Error('Git repository not configured');
        }

        const { stdout } = await execAsync(
            `git show --format="" ${hash}`,
            { cwd: this.repoPath }
        );
        return stdout;
    }

    public analyzeSuspiciousPatterns(commit: GitCommit): SuspiciousPattern[] {
        const patterns: SuspiciousPattern[] = [];

        // Check commit message patterns
        const messageLower = commit.message.toLowerCase();
        if (messageLower.includes('hotfix') || messageLower.includes('emergency') || messageLower.includes('urgent')) {
            patterns.push({
                type: 'emergency_fix',
                description: 'Emergency or hotfix commit detected',
                severity: 'high'
            });
        }

        if (messageLower.includes('revert') || messageLower.includes('rollback') || messageLower.includes('undo')) {
            patterns.push({
                type: 'reversion',
                description: 'Code reversion or rollback detected',
                severity: 'medium'
            });
        }

        // Check diff patterns
        if (commit.diff) {
            const diffLower = commit.diff.toLowerCase();
            
            // Check for infinite loops
            if (
                diffLower.includes('while(true)') || 
                diffLower.includes('while (true)') ||
                diffLower.includes('for(;;)')
            ) {
                patterns.push({
                    type: 'infinite_loop',
                    description: 'Potential infinite loop introduced',
                    severity: 'high'
                });
            }

            // Check for thread blocking
            if (
                diffLower.includes('thread.sleep') ||
                diffLower.includes('synchronized') ||
                diffLower.includes('lock.acquire')
            ) {
                patterns.push({
                    type: 'thread_blocking',
                    description: 'Potential thread blocking code detected',
                    severity: 'medium'
                });
            }

            // Check for process termination
            if (
                diffLower.includes('system.exit') ||
                diffLower.includes('process.exit') ||
                diffLower.includes('os.exit')
            ) {
                patterns.push({
                    type: 'process_termination',
                    description: 'Process termination calls detected',
                    severity: 'high'
                });
            }
        }

        return patterns;
    }

    public async analyzeRecentCommits(): Promise<{
        commits: GitCommit[],
        suspiciousCommits: Array<{ commit: GitCommit, patterns: SuspiciousPattern[] }>
    }> {
        const commits = await this.getRecentCommits();
        const suspiciousCommits = [];

        for (const commit of commits) {
            const patterns = this.analyzeSuspiciousPatterns(commit);
            if (patterns.length > 0) {
                suspiciousCommits.push({ commit, patterns });
            }
        }

        return { commits, suspiciousCommits };
    }
} 