import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as path from 'path';
import { ConfigurationManager } from './configuration';

export class MCPManager {
    private mcpProcess: child_process.ChildProcess | undefined;
    private outputChannel: vscode.OutputChannel;

    constructor(
        private context: vscode.ExtensionContext,
        private configManager: ConfigurationManager
    ) {
        this.outputChannel = vscode.window.createOutputChannel('Varejo CRM MCP Server');
        context.subscriptions.push(this.outputChannel);
    }

    /**
     * Inicia o servidor MCP
     */
    async start(): Promise<void> {
        if (this.mcpProcess) {
            this.outputChannel.appendLine('⚠️ Servidor MCP já está rodando');
            return;
        }

        try {
            const config = await this.configManager.getConfiguration();
            if (!config) {
                throw new Error('Configuração não encontrada. Execute "Varejo CRM: Configurar GitLab"');
            }

            // Valida se o script Python existe
            const serverPath = this.getServerScriptPath();
            this.outputChannel.appendLine(`📂 Caminho do servidor: ${serverPath}`);

            // Obtém comando Python
            const pythonPath = vscode.workspace.getConfiguration('varejocrm').get<string>('mcp.pythonPath') || 'python3';
            
            this.outputChannel.appendLine(`🐍 Python: ${pythonPath}`);
            this.outputChannel.appendLine(`🚀 Iniciando servidor MCP...`);

            // Cria arquivo de configuração MCP
            const mcpConfigPath = await this.configManager.createMCPConfigFile();
            this.outputChannel.appendLine(`⚙️ Configuração MCP: ${mcpConfigPath}`);

            // Prepara variáveis de ambiente
            const env = {
                ...process.env,
                GITLAB_TOKEN: config.token,
                GITLAB_API_URL: config.url,
                GITLAB_DEFAULT_GROUP: config.defaultGroup,
                GITLAB_DEFAULT_ASSIGNEE: config.defaultAssignee,
            };

            // Inicia processo Python
            this.mcpProcess = child_process.spawn(pythonPath, [serverPath], {
                env,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            // Monitora stdout
            this.mcpProcess.stdout?.on('data', (data) => {
                this.outputChannel.appendLine(`[STDOUT] ${data.toString()}`);
            });

            // Monitora stderr (logs do servidor)
            this.mcpProcess.stderr?.on('data', (data) => {
                const message = data.toString();
                this.outputChannel.appendLine(`[LOG] ${message}`);
            });

            // Monitora erro
            this.mcpProcess.on('error', (error) => {
                this.outputChannel.appendLine(`❌ Erro: ${error.message}`);
                vscode.window.showErrorMessage(`Erro no servidor MCP: ${error.message}`);
            });

            // Monitora exit
            this.mcpProcess.on('exit', (code) => {
                this.outputChannel.appendLine(`⛔ Servidor MCP encerrado (código: ${code})`);
                this.mcpProcess = undefined;
                
                if (code !== 0 && code !== null) {
                    vscode.window.showWarningMessage(
                        `Servidor MCP encerrado inesperadamente (código: ${code})`
                    );
                }
            });

            this.outputChannel.appendLine(`✅ Servidor MCP iniciado (PID: ${this.mcpProcess.pid})`);
            this.outputChannel.show(true);

            // Registra no status bar
            const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
            statusBarItem.text = '$(check) CRM MCP';
            statusBarItem.tooltip = 'Varejo CRM MCP Server está rodando';
            statusBarItem.command = 'varejocrm.configure';
            statusBarItem.show();
            this.context.subscriptions.push(statusBarItem);

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.outputChannel.appendLine(`❌ Falha ao iniciar servidor: ${errorMessage}`);
            throw error;
        }
    }

    /**
     * Para o servidor MCP
     */
    async stop(): Promise<void> {
        if (!this.mcpProcess) {
            return;
        }

        this.outputChannel.appendLine('⏹️ Parando servidor MCP...');
        
        this.mcpProcess.kill();
        this.mcpProcess = undefined;
        
        this.outputChannel.appendLine('✅ Servidor MCP parado');
    }

    /**
     * Obtém caminho do script Python do servidor MCP
     */
    private getServerScriptPath(): string {
        const configuredPath = vscode.workspace.getConfiguration('varejocrm').get<string>('mcp.serverPath');
        
        if (configuredPath) {
            return configuredPath;
        }

        // Caminho padrão: extensão/crm_mcp_server.py
        return path.join(this.context.extensionPath, 'crm_mcp_server.py');
    }

    /**
     * Verifica se o servidor está rodando
     */
    isRunning(): boolean {
        return this.mcpProcess !== undefined;
    }
}
