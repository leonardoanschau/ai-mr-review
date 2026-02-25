#!/bin/bash
# Script para testar o MCP Server do GitLab Issue Creator

echo "🧪 Testando GitLab Issue Creator MCP Server"
echo "=========================================="
echo ""

# Verifica variáveis de ambiente
if [ -z "$GITLAB_TOKEN" ]; then
    echo "❌ GITLAB_TOKEN não configurado"
    exit 1
fi

if [ -z "$OPENAI_API_KEY" ]; then
    echo "❌ OPENAI_API_KEY não configurado"
    exit 1
fi

echo "✅ Variáveis de ambiente configuradas"
echo ""

# Teste 1: Initialize
echo "📋 Teste 1: Initialize"
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | python3 gitlab_issue_mcp_server.py
echo ""

# Teste 2: List Tools
echo "📋 Teste 2: List Tools"
echo '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | python3 gitlab_issue_mcp_server.py
echo ""

# Teste 3: List Projects
echo "📋 Teste 3: List Projects"
echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_gitlab_projects","arguments":{}}}' | python3 gitlab_issue_mcp_server.py
echo ""

# Teste 4: Generate Content (sem criar issue)
echo "📋 Teste 4: Generate Content Only"
echo '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"generate_issue_content","arguments":{"context":"Implementar sistema de notificações push para usuários mobile. Deve suportar iOS e Android com Firebase."}}}' | python3 gitlab_issue_mcp_server.py
echo ""

echo "✅ Testes concluídos!"
echo ""
echo "Para criar uma issue de verdade, use:"
echo '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"create_gitlab_issue","arguments":{"project_name":"user-stories","context":"Seu contexto aqui"}}}' | python3 gitlab_issue_mcp_server.py
