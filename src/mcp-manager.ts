import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { GitLabMCPConfigManager } from './config-manager';

export class MCPManager {
    private outputChannel: vscode.OutputChannel;
    private isRegistered: boolean = false;

    constructor(
        private context: vscode.ExtensionContext,
        private configManager: GitLabMCPConfigManager
    ) {
        this.outputChannel = vscode.window.createOutputChannel('GitLab MCP Server');
        context.subscriptions.push(this.outputChannel);
    }

    /**
     * Registra o servidor MCP no mcp.json
     * O VS Code/Copilot é quem gerencia o lifecycle do servidor
     */
    async start(): Promise<void> {
        if (this.isRegistered) {
            this.outputChannel.appendLine('⚠️ Servidor MCP já está registrado');
            return;
        }

        try {
            // Verifica se está configurado
            const isConfigured = await this.configManager.isConfigured();
            if (!isConfigured) {
                throw new Error('Configuration not found. Run "GitLab MCP: Configure Server"');
            }

            // Get server script path
            const serverScriptPath = this.getServerScriptPath();
            this.outputChannel.appendLine(`📂 Server script: ${serverScriptPath}`);

            // Check if server script exists
            if (!fs.existsSync(serverScriptPath)) {
                throw new Error(`Server script not found at: ${serverScriptPath}`);
            }

            this.outputChannel.appendLine(`🚀 Registering GitLab MCP Server in mcp.json...`);

            // Registra no mcp.json (com env vars do SecretStorage)
            await this.registerMCPServer(serverScriptPath);
            
            this.isRegistered = true;
            this.outputChannel.appendLine(`✅ Servidor registrado! O VS Code gerenciará o processo.`);
            this.outputChannel.show(true);

            // Registra no status bar
            const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
            statusBarItem.text = '$(check) GitLab MCP';
            statusBarItem.tooltip = 'GitLab MCP Server is registered';
            statusBarItem.command = 'gitlabmcp.configure';
            statusBarItem.show();
            this.context.subscriptions.push(statusBarItem);

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.outputChannel.appendLine(`❌ Falha ao registrar servidor: ${errorMessage}`);
            throw error;
        }
    }

    /**
     * Remove o registro do servidor MCP do mcp.json
     */
    async stop(): Promise<void> {
        if (!this.isRegistered) {
            return;
        }

        this.outputChannel.appendLine('⏹️ Removendo registro do servidor MCP...');
        
        await this.unregisterMCPServer();
        
        this.isRegistered = false;
        this.outputChannel.appendLine('✅ Servidor desregistrado do mcp.json');
    }

    /**
     * Registra o servidor MCP no mcp.json para integração com Copilot
     */
    private async registerMCPServer(serverScriptPath: string): Promise<void> {
        try {
            const mcpConfigPath = this.getMCPConfigPath();
            
            // Lê mcp.json atual ou cria estrutura vazia
            let mcpConfig: any = { servers: {}, inputs: [] };
            
            if (fs.existsSync(mcpConfigPath)) {
                const content = fs.readFileSync(mcpConfigPath, 'utf8');
                try {
                    mcpConfig = JSON.parse(content);
                } catch (e) {
                    this.outputChannel.appendLine(`⚠️ Erro ao ler mcp.json, criando novo...`);
                }
            }

            // Adiciona/atualiza entrada do GitLab MCP
            const env = await this.configManager.getEnvironmentVariables();
            
            mcpConfig.servers = mcpConfig.servers || {};
            mcpConfig.servers['GitlabMCP-AnschauTI'] = {
                command: process.execPath,  // Use Node.js runtime from VS Code
                args: [serverScriptPath],
                env: env,
                type: 'stdio'
            };

            // Salva mcp.json
            const dir = path.dirname(mcpConfigPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, '\t'));
            this.outputChannel.appendLine(`✅ Servidor registrado no mcp.json: ${mcpConfigPath}`);
            this.outputChannel.appendLine(` O VS Code gerenciará o lifecycle do servidor`);
            
        } catch (error) {
            this.outputChannel.appendLine(`⚠️ Erro ao registrar no mcp.json: ${error}`);
            throw error;
        }
    }

    /**
     * Remove o registro do servidor MCP do mcp.json
     */
    private async unregisterMCPServer(): Promise<void> {
        try {
            const mcpConfigPath = this.getMCPConfigPath();
            
            if (!fs.existsSync(mcpConfigPath)) {
                return;
            }

            const content = fs.readFileSync(mcpConfigPath, 'utf8');
            const mcpConfig = JSON.parse(content);

            // Remove servidor
            if (mcpConfig.servers && mcpConfig.servers['GitlabMCP-AnschauTI']) {
                delete mcpConfig.servers['GitlabMCP-AnschauTI'];
                this.outputChannel.appendLine(`✅ Servidor removido do mcp.json`);
            }
            
            fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, '\t'));
        } catch (error) {
            this.outputChannel.appendLine(`⚠️ Erro ao remover do mcp.json: ${error}`);
        }
    }

    /**
     * Obtém caminho do mcp.json do VS Code
     */
    private getMCPConfigPath(): string {
        const platform = process.platform;
        let configDir: string;

        if (platform === 'darwin') {
            // macOS
            configDir = path.join(os.homedir(), 'Library', 'Application Support', 'Code', 'User');
        } else if (platform === 'win32') {
            // Windows
            configDir = path.join(process.env.APPDATA || '', 'Code', 'User');
        } else {
            // Linux
            configDir = path.join(os.homedir(), '.config', 'Code', 'User');
        }

        return path.join(configDir, 'mcp.json');
    }

    /**
     * Obtém caminho do script do servidor MCP (Node.js)
     */
    private getServerScriptPath(): string {
        const configuredPath = vscode.workspace.getConfiguration('gitlabmcp').get<string>('mcp.serverPath');
        
        if (configuredPath) {
            return configuredPath;
        }

        // Default path: extension/server/dist/server.js
        return path.join(this.context.extensionPath, 'server', 'dist', 'server.js');
    }

    /**
     * Verifica se o servidor está registrado
     */
    isRunning(): boolean {
        return this.isRegistered;
    }

    /**
     * Reinicia o servidor (útil após mudanças de configuração)
     */
    async restart(): Promise<void> {
        await this.stop();
        await this.start();
    }
}
