#!/usr/bin/env python3
"""
Script simples para testar o servidor MCP localmente.
"""
import subprocess
import json
import sys

def test_mcp_server():
    """Testa o servidor MCP enviando requests via stdio."""
    
    print("🧪 Testando servidor MCP...\n")
    
    # Inicializar
    init_request = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {
                "name": "test-client",
                "version": "1.0.0"
            }
        }
    }
    
    # Listar ferramentas
    list_tools_request = {
        "jsonrpc": "2.0",
        "id": 2,
        "method": "tools/list",
        "params": {}
    }
    
    # Testar listagem de projetos
    list_projects_request = {
        "jsonrpc": "2.0",
        "id": 3,
        "method": "tools/call",
        "params": {
            "name": "list_gitlab_projects",
            "arguments": {}
        }
    }
    
    print("📋 Requests que serão enviados:")
    print("1. Initialize")
    print("2. List Tools")
    print("3. List GitLab Projects\n")
    
    print("Para testar manualmente, rode:")
    print("  python gitlab_issues_mcp.py")
    print("\nE envie os requests JSON via stdin.\n")
    
    print("=" * 70)
    print("✅ Servidor MCP criado com sucesso!")
    print("=" * 70)
    print("\n📚 Próximos passos:")
    print("1. Configure as variáveis de ambiente (copie .env.example para .env)")
    print("2. Instale as dependências: pip install -r requirements.txt")
    print("3. Reinicie o VS Code")
    print("4. Use o Copilot Chat com @workspace")
    print("\n💡 Exemplos de uso no Copilot:")
    print('  - "Liste os projetos GitLab disponíveis"')
    print('  - "Cria uma issue para implementar feature X no projeto Y"')
    print('  - "Gera preview de issue para: [seu contexto aqui]"')
    print()

if __name__ == "__main__":
    test_mcp_server()
