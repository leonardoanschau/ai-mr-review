import * as vscode from 'vscode';
import { ConfigurationManager } from './configuration';
import { MCPManager } from './mcp-manager';

let mcpManager: MCPManager | undefined;

export async function activate(context: vscode.ExtensionContext) {
    console.log('Extensão Varejo CRM MCP ativada');

    const configManager = new ConfigurationManager(context);

    // Verifica se está configurado
    const isConfigured = await configManager.isConfigured();
    
    if (!isConfigured) {
        // Mostra wizard de configuração
        const configure = await vscode.window.showInformationMessage(
            '🚀 Bem-vindo ao Varejo CRM MCP! Configure suas credenciais GitLab para começar.',
            'Configurar Agora',
            'Depois'
        );

        if (configure === 'Configurar Agora') {
            await configManager.showConfigurationWizard();
        }
    } else {
        // Inicia servidor MCP
        try {
            mcpManager = new MCPManager(context, configManager);
            await mcpManager.start();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Erro ao iniciar MCP Server: ${errorMessage}`);
        }
    }

    // Registra comandos
    context.subscriptions.push(
        vscode.commands.registerCommand('varejocrm.configure', async () => {
            await configManager.showConfigurationWizard();
            
            // Reinicia MCP se já estava rodando
            if (mcpManager) {
                await mcpManager.stop();
                mcpManager = new MCPManager(context, configManager);
                await mcpManager.start();
            } else {
                mcpManager = new MCPManager(context, configManager);
                await mcpManager.start();
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('varejocrm.createIssue', () => {
            vscode.window.showInformationMessage(
                '💡 Use o GitHub Copilot Chat para criar issues! Digite: "@workspace crie uma US no GitLab"'
            );
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('varejocrm.listProjects', () => {
            vscode.window.showInformationMessage(
                '💡 Use o GitHub Copilot Chat para listar projetos! Digite: "liste os projetos GitLab do CRM"'
            );
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('varejocrm.showTemplate', () => {
            vscode.window.showInformationMessage(
                '💡 Use o GitHub Copilot Chat para ver o template! Digite: "mostre o template de issues do GitLab"'
            );
        })
    );
}

export function deactivate() {
    if (mcpManager) {
        mcpManager.stop();
    }
}
