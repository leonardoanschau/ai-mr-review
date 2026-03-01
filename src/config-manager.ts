import * as vscode from 'vscode';

/**
 * Gerenciador de configurações do GitLab MCP
 * Armazena credenciais de forma segura usando SecretStorage API
 */
export class GitLabMCPConfigManager {
    private static readonly KEYS = {
        TOKEN: 'gitlab-mcp.token',
        API_URL: 'gitlab-mcp.apiUrl',
        DEFAULT_GROUP: 'gitlab-mcp.defaultGroup',
        DEFAULT_ASSIGNEE: 'gitlab-mcp.defaultAssignee'
    };

    constructor(private context: vscode.ExtensionContext) {}

    /**
     * Verifica se a configuração está completa
     */
    async isConfigured(): Promise<boolean> {
        const token = await this.getToken();
        const apiUrl = await this.getApiUrl();
        return !!token && !!apiUrl;
    }

    /**
     * Obtém o token do GitLab
     */
    async getToken(): Promise<string | undefined> {
        return await this.context.secrets.get(GitLabMCPConfigManager.KEYS.TOKEN);
    }

    /**
     * Obtém a URL da API do GitLab
     */
    async getApiUrl(): Promise<string | undefined> {
        return await this.context.secrets.get(GitLabMCPConfigManager.KEYS.API_URL);
    }

    /**
     * Obtém o grupo padrão
     */
    async getDefaultGroup(): Promise<string | undefined> {
        return await this.context.secrets.get(GitLabMCPConfigManager.KEYS.DEFAULT_GROUP);
    }

    /**
     * Obtém o assignee padrão
     */
    async getDefaultAssignee(): Promise<string | undefined> {
        return await this.context.secrets.get(GitLabMCPConfigManager.KEYS.DEFAULT_ASSIGNEE);
    }

    /**
     * Salva todas as configurações
     */
    async saveConfiguration(config: {
        token: string;
        apiUrl: string;
        defaultGroup?: string;
        defaultAssignee?: string;
    }): Promise<void> {
        await this.context.secrets.store(GitLabMCPConfigManager.KEYS.TOKEN, config.token);
        await this.context.secrets.store(GitLabMCPConfigManager.KEYS.API_URL, config.apiUrl);
        
        if (config.defaultGroup) {
            await this.context.secrets.store(GitLabMCPConfigManager.KEYS.DEFAULT_GROUP, config.defaultGroup);
        }
        
        if (config.defaultAssignee) {
            await this.context.secrets.store(GitLabMCPConfigManager.KEYS.DEFAULT_ASSIGNEE, config.defaultAssignee);
        }
    }

    /**
     * Limpa todas as configurações
     */
    async clearConfiguration(): Promise<void> {
        await this.context.secrets.delete(GitLabMCPConfigManager.KEYS.TOKEN);
        await this.context.secrets.delete(GitLabMCPConfigManager.KEYS.API_URL);
        await this.context.secrets.delete(GitLabMCPConfigManager.KEYS.DEFAULT_GROUP);
        await this.context.secrets.delete(GitLabMCPConfigManager.KEYS.DEFAULT_ASSIGNEE);
    }

    /**
     * Obtém todas as variáveis de ambiente para o servidor MCP
     */
    async getEnvironmentVariables(): Promise<Record<string, string>> {
        const token = await this.getToken();
        const apiUrl = await this.getApiUrl();
        const defaultGroup = await this.getDefaultGroup();
        const defaultAssignee = await this.getDefaultAssignee();

        const env: Record<string, string> = {};

        if (token) {
            env.GITLAB_TOKEN = token;
        }

        if (apiUrl) {
            env.GITLAB_API_URL = apiUrl;
        }

        if (defaultGroup) {
            env.GITLAB_DEFAULT_GROUP = defaultGroup;
        }

        if (defaultAssignee) {
            env.GITLAB_DEFAULT_ASSIGNEE = defaultAssignee;
        }

        return env;
    }

    /**
     * Configura o servidor interativamente (pede credenciais ao usuário)
     */
    async configureInteractively(): Promise<boolean> {
        try {
            // Pedir Token
            const token = await vscode.window.showInputBox({
                prompt: 'GitLab Personal Access Token',
                password: true,
                placeHolder: 'glpat-...',
                ignoreFocusOut: true,
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'Token é obrigatório';
                    }
                    if (!value.startsWith('glpat-') && !value.startsWith('glptt-')) {
                        return 'Token deve começar com glpat- ou glptt-';
                    }
                    return null;
                }
            });

            if (!token) {
                return false; // Usuário cancelou
            }

            // Pedir API URL
            const apiUrl = await vscode.window.showInputBox({
                prompt: 'GitLab API URL',
                placeHolder: 'https://gitlab.com/api/v4 or https://your-gitlab.com/api/v4',
                ignoreFocusOut: true,
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'API URL é obrigatória';
                    }
                    if (!value.startsWith('http://') && !value.startsWith('https://')) {
                        return 'URL deve começar com http:// ou https://';
                    }
                    return null;
                }
            });

            if (!apiUrl) {
                return false; // Usuário cancelou
            }

            // Pedir grupo padrão (opcional)
            const defaultGroup = await vscode.window.showInputBox({
                prompt: 'Default Group (optional)',
                placeHolder: 'e.g., organization/group/subgroup',
                ignoreFocusOut: true
            });

            // Pedir assignee padrão (opcional)
            const defaultAssignee = await vscode.window.showInputBox({
                prompt: 'Default Assignee (optional - your GitLab username)',
                placeHolder: 'e.g., jsmith',
                ignoreFocusOut: true
            });

            // Salvar configuração
            await this.saveConfiguration({
                token,
                apiUrl,
                defaultGroup: defaultGroup || undefined,
                defaultAssignee: defaultAssignee || undefined
            });

            vscode.window.showInformationMessage('✅ GitLab MCP configurado com sucesso!');
            return true;

        } catch (error) {
            vscode.window.showErrorMessage(`Erro ao configurar GitLab MCP: ${error}`);
            return false;
        }
    }

    /**
     * Exibe a configuração atual (sem mostrar o token completo)
     */
    async showConfiguration(): Promise<void> {
        const token = await this.getToken();
        const apiUrl = await this.getApiUrl();
        const defaultGroup = await this.getDefaultGroup();
        const defaultAssignee = await this.getDefaultAssignee();

        const maskedToken = token ? `${token.substring(0, 10)}...${token.substring(token.length - 10)}` : 'Não configurado';

        const message = `
🔑 **GitLab MCP Configuration**

**Token:** ${maskedToken}
**API URL:** ${apiUrl || 'Não configurado'}
**Default Group:** ${defaultGroup || 'Não configurado'}
**Default Assignee:** ${defaultAssignee || 'Não configurado'}
        `.trim();

        vscode.window.showInformationMessage(message, { modal: true });
    }
}
