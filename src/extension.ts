import * as vscode from 'vscode';
import { GitLabMCPConfigManager } from './config-manager';
import { MCPManager } from './mcp-manager';

let mcpManager: MCPManager | undefined;
let configManager: GitLabMCPConfigManager | undefined;

export async function activate(context: vscode.ExtensionContext) {
    console.log('GitLab MCP extension activated');

    configManager = new GitLabMCPConfigManager(context);

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
            const success = await configManager.configureInteractively();
            if (success) {
                // Inicia servidor após configuração
                mcpManager = new MCPManager(context, configManager);
                await mcpManager.start();
            }
        }
    } else {
        // Inicia servidor MCP
        try {
            mcpManager = new MCPManager(context, configManager);
            await mcpManager.start();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to start MCP Server: ${errorMessage}`);
        }
    }

    // ======================================================================
    // Comando: Configure Server
    // ======================================================================
    context.subscriptions.push(
        vscode.commands.registerCommand('gitlabmcp.configure', async () => {
            if (!configManager) {
                return;
            }

            const success = await configManager.configureInteractively();
            
            if (success) {
                // Reinicia MCP se já estava rodando
                if (mcpManager) {
                    try {
                        await mcpManager.restart();
                        vscode.window.showInformationMessage('✅ GitLab MCP restarted with new configuration!');
                    } catch (error) {
                        const errorMessage = error instanceof Error ? error.message : String(error);
                        vscode.window.showErrorMessage(`Failed to restart server: ${errorMessage}`);
                    }
                } else {
                    // Primeiro start
                    try {
                        mcpManager = new MCPManager(context, configManager);
                        await mcpManager.start();
                        vscode.window.showInformationMessage('✅ GitLab MCP started successfully!');
                    } catch (error) {
                        const errorMessage = error instanceof Error ? error.message : String(error);
                        vscode.window.showErrorMessage(`Failed to start server: ${errorMessage}`);
                    }
                }
            }
        })
    );

    // ======================================================================
    // Comando: Show Configuration
    // ======================================================================
    context.subscriptions.push(
        vscode.commands.registerCommand('gitlabmcp.showConfiguration', async () => {
            if (!configManager) {
                return;
            }
            await configManager.showConfiguration();
        })
    );

    // ======================================================================
    // Comando: Clear Configuration
    // ======================================================================
    context.subscriptions.push(
        vscode.commands.registerCommand('gitlabmcp.clearConfiguration', async () => {
            if (!configManager) {
                return;
            }

            const confirm = await vscode.window.showWarningMessage(
                '⚠️ This will delete all GitLab MCP credentials from secure storage. Continue?',
                { modal: true },
                'Yes, Delete',
                'Cancel'
            );

            if (confirm === 'Yes, Delete') {
                await configManager.clearConfiguration();
                
                // Para o servidor se estiver rodando
                if (mcpManager) {
                    await mcpManager.stop();
                    mcpManager = undefined;
                }

                vscode.window.showInformationMessage('✅ Configuration cleared. Run "Configure Server" to set up again.');
            }
        })
    );

    // ======================================================================
    // Comandos informativos (direcionam para uso no Chat)
    // ======================================================================
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
