import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { ConfigurationManager } from './configuration';

export class MCPManager {
    private outputChannel: vscode.OutputChannel;
    private isRegistered: boolean = false;

    constructor(
        private context: vscode.ExtensionContext,
        private configManager: ConfigurationManager
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
            const config = await this.configManager.getConfiguration();
            if (!config) {
                throw new Error('Configuration not found. Run "GitLab MCP: Configure GitLab"');
            }

            // Get binary path
            const binaryPath = this.getServerBinaryPath();
            this.outputChannel.appendLine(`📂 Server binary: ${binaryPath}`);

            // Check if binary exists
            if (!fs.existsSync(binaryPath)) {
                throw new Error(`Server binary not found at: ${binaryPath}`);
            }

            this.outputChannel.appendLine(`🚀 Registering GitLab MCP Server in mcp.json...`);

            // Registra no mcp.json (com env vars)
            await this.registerMCPServer(binaryPath, config);
            
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
    private async registerMCPServer(binaryPath: string, config: any): Promise<void> {
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

            // Adiciona/atualiza entrada do GitLab MCP (SEM env vars - servidor lê de ~/.gitlab-mcp-config.json)
            mcpConfig.servers = mcpConfig.servers || {};
            mcpConfig.servers['gitlab-mcp-server'] = {
                command: binaryPath,
                args: [],
                type: 'stdio'
            };

            // Salva mcp.json
            const dir = path.dirname(mcpConfigPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, '\t'));
            this.outputChannel.appendLine(`✅ Servidor registrado no mcp.json: ${mcpConfigPath}`);
            this.outputChannel.appendLine(`🔐 Credenciais salvas em ~/.gitlab-mcp-config.json (não no mcp.json!)`);
            this.outputChannel.appendLine(`�📝 O VS Code gerenciará o lifecycle do servidor`);
            
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
            if (mcpConfig.servers && mcpConfig.servers['gitlab-mcp-server']) {
                delete mcpConfig.servers['gitlab-mcp-server'];
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
     * Obtém caminho do script Python do servidor MCP
     */
    private getServerBinaryPath(): string {
        const configuredPath = vscode.workspace.getConfiguration('gitlabmcp').get<string>('mcp.serverPath');
        
        if (configuredPath) {
            return configuredPath;
        }

        // Detect OS and return appropriate binary
        const platform = process.platform;
        let binaryName: string;
        
        if (platform === 'darwin') {
            binaryName = 'gitlab-mcp-server';
        } else if (platform === 'win32') {
            binaryName = 'gitlab-mcp-server.exe';
        } else {
            // Linux
            binaryName = 'gitlab-mcp-server';
        }

        // Default path: extension/bin/gitlab-mcp-server
        return path.join(this.context.extensionPath, 'bin', binaryName);
    }

    /**
     * Verifica se o servidor está registrado
     */
    isRunning(): boolean {
        return this.isRegistered;
    }
}
