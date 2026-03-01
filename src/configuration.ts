import * as vscode from 'vscode';

export interface GitLabConfiguration {
    url: string;
    token: string;
    defaultGroup: string;
    defaultAssignee: string;
}

export class ConfigurationManager {
    private static readonly SECRET_KEY_TOKEN = 'gitlab.token';
    private static readonly CONFIG_SECTION = 'gitlabmcp';

    constructor(private context: vscode.ExtensionContext) {}

    /**
     * Verifica se a extensão está configurada
     */
    async isConfigured(): Promise<boolean> {
        const token = await this.getToken();
        return token !== undefined && token !== '';
    }

    /**
     * Obtém token do Secret Storage
     */
    async getToken(): Promise<string | undefined> {
        return await this.context.secrets.get(ConfigurationManager.SECRET_KEY_TOKEN);
    }

    /**
     * Salva token no Secret Storage
     */
    async setToken(token: string): Promise<void> {
        await this.context.secrets.store(ConfigurationManager.SECRET_KEY_TOKEN, token);
    }

    /**
     * Obtém configuração completa
     */
    async getConfiguration(): Promise<GitLabConfiguration | undefined> {
        const token = await this.getToken();
        if (!token) {
            return undefined;
        }

        const config = vscode.workspace.getConfiguration(ConfigurationManager.CONFIG_SECTION);
        
        return {
            url: config.get('gitlab.url') || 'https://gitlab.com/api/v4',
            token,
            defaultGroup: config.get('gitlab.defaultGroup') || '',
            defaultAssignee: config.get('gitlab.defaultAssignee') || '',
        };
    }

    /**
     * Mostra wizard de configuração
     */
    async showConfigurationWizard(): Promise<boolean> {
        // 1. GitLab URL
        const url = await vscode.window.showInputBox({
            prompt: 'GitLab API URL',
            value: 'https://gitlab.com/api/v4',
            placeHolder: 'https://gitlab.com/api/v4',
            ignoreFocusOut: true,
            validateInput: (value) => {
                if (!value) return 'URL é obrigatória';
                if (!value.startsWith('http')) return 'URL deve começar com http:// ou https://';
                return null;
            }
        });

        if (!url) {
            return false; // Usuário cancelou
        }

        // 2. GitLab Token
        const token = await vscode.window.showInputBox({
            prompt: 'GitLab Personal Access Token (será armazenado com segurança)',
            placeHolder: 'glpat-xxxxxxxxxxxxxxxxxxxxx',
            password: true,
            ignoreFocusOut: true,
            validateInput: (value) => {
                if (!value) return 'Token é obrigatório';
                if (value.length < 10) return 'Token inválido';
                return null;
            }
        });

        if (!token) {
            return false;
        }

        // 3. Grupo padrão
        const defaultGroup = await vscode.window.showInputBox({
            prompt: 'Default GitLab group (with recursive subgroups) - optional',
            value: '',
            placeHolder: 'e.g., mycompany/myteam',
            ignoreFocusOut: true,
            validateInput: (value) => {
                return null; // Optional field
            }
        });

        if (defaultGroup === undefined) {
            return false;
        }

        // 4. Assignee padrão
        const defaultAssignee = await vscode.window.showInputBox({
            prompt: 'Default assignee username (leave empty for none)',
            placeHolder: 'your-username',
            ignoreFocusOut: true
        });

        // Salva configurações
        const config = vscode.workspace.getConfiguration(ConfigurationManager.CONFIG_SECTION);
        await config.update('gitlab.url', url, vscode.ConfigurationTarget.Global);
        await config.update('gitlab.defaultGroup', defaultGroup, vscode.ConfigurationTarget.Global);
        await config.update('gitlab.defaultAssignee', defaultAssignee || '', vscode.ConfigurationTarget.Global);
        
        // Salva token no Secret Storage
        await this.setToken(token);

        // IMPORTANTE: Também cria arquivo de config para o servidor Python ler
        await this.createGitLabConfigFile(url, token, defaultGroup || '', defaultAssignee || '');

        vscode.window.showInformationMessage('✅ Configuration saved successfully!');
        
        return true;
    }

    /**
     * Cria arquivo ~/.gitlab-mcp-config.json para o servidor Python ler
     */
    private async createGitLabConfigFile(url: string, token: string, defaultGroup: string, defaultAssignee: string): Promise<void> {
        const os = require('os');
        const fs = require('fs').promises;
        const path = require('path');

        const configPath = path.join(os.homedir(), '.gitlab-mcp-config.json');
        
        const configContent = {
            token: token,
            api_url: url,
            default_group: defaultGroup,
            default_assignee: defaultAssignee
        };

        await fs.writeFile(configPath, JSON.stringify(configContent, null, 2), 'utf8');
        console.log(`GitLab config file created at: ${configPath}`);
    }

    /**
     * Cria arquivo de configuração MCP temporário para o servidor Python
     */
    async createMCPConfigFile(): Promise<string> {
        const config = await this.getConfiguration();
        if (!config) {
            throw new Error('Configuração não encontrada');
        }

        const mcpConfig = {
            mcpServers: {
                "gitlab-mcp-anschauti-tools": {
                    command: vscode.workspace.getConfiguration('gitlabmcp').get('mcp.pythonPath') || 'python3',
                    args: [this.getServerScriptPath()],
                    env: {
                        GITLAB_TOKEN: config.token,
                        GITLAB_API_URL: config.url,
                        GITLAB_DEFAULT_GROUP: config.defaultGroup,
                        GITLAB_DEFAULT_ASSIGNEE: config.defaultAssignee
                    }
                }
            }
        };

        const configPath = vscode.Uri.joinPath(this.context.globalStorageUri, 'mcp-config.json');
        
        // Garante que o diretório existe
        await vscode.workspace.fs.createDirectory(this.context.globalStorageUri);
        
        await vscode.workspace.fs.writeFile(
            configPath,
            Buffer.from(JSON.stringify(mcpConfig, null, 2))
        );

        return configPath.fsPath;
    }

    /**
     * Obtém caminho do script Python do servidor MCP
     */
    private getServerScriptPath(): string {
        const configuredPath = vscode.workspace.getConfiguration('gitlabmcp').get<string>('mcp.serverPath');
        
        if (configuredPath) {
            return configuredPath;
        }

        // Tenta encontrar automaticamente
        const extensionPath = this.context.extensionPath;
        return `${extensionPath}/crm_mcp_server.py`;
    }
}
