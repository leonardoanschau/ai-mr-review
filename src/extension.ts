import * as vscode from 'vscode';
import { ConfigurationManager } from './configuration';
import { MCPManager } from './mcp-manager';

let mcpManager: MCPManager | undefined;

export async function activate(context: vscode.ExtensionContext) {
    console.log('GitLab MCP extension activated');

    const configManager = new ConfigurationManager(context);

    // Verifica se está configurado
    const isConfigured = await configManager.isConfigured();
    
    if (!isConfigured) {
        // Mostra wizard de configuração
        const configure = await vscode.window.showInformationMessage(
            '🚀 Welcome to GitLab MCP! Configure your GitLab credentials to get started.',
            'Configure Now',
            'Later'
        );

        if (configure === 'Configure Now') {
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
        vscode.commands.registerCommand('gitlabmcp.configure', async () => {
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
        vscode.commands.registerCommand('gitlabmcp.createIssue', () => {
            vscode.window.showInformationMessage(
                '💡 Use GitHub Copilot Chat to create issues! Type: "@workspace create a GitLab issue..."'
            );
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('gitlabmcp.listProjects', () => {
            vscode.window.showInformationMessage(
                '💡 Use GitHub Copilot Chat to list projects! Type: "list GitLab projects"'
            );
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('gitlabmcp.showTemplate', () => {
            vscode.window.showInformationMessage(
                '💡 Use GitHub Copilot Chat to see template! Type: "show GitLab issue template"'
            );
        })
    );
}

export function deactivate() {
    if (mcpManager) {
        mcpManager.stop();
    }
}
