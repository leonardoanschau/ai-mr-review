#!/bin/bash
# Script de instalação da extensão Varejo CRM MCP
# Baixa a última versão do GitLab Releases e instala

set -e

VERSION="${1:-1.0.0}"
GITLAB_URL="http://gitlab.dimed.com.br"
PROJECT_PATH="grupopanvel/varejo/crm/varejo-crm-mcp"
VSIX_NAME="varejo-crm-mcp-${VERSION}.vsix"

echo "🚀 Instalador Varejo CRM MCP v${VERSION}"
echo "========================================"
echo ""

# Verifica VS Code
if ! command -v code &> /dev/null; then
    echo "❌ VS Code não encontrado no PATH"
    echo "   Instale: https://code.visualstudio.com/"
    exit 1
fi

echo "✅ VS Code encontrado: $(code --version | head -1)"
echo ""

# Opção 1: Se o arquivo já existe localmente
if [ -f "$VSIX_NAME" ]; then
    echo "📦 Arquivo encontrado localmente: $VSIX_NAME"
    echo "   Instalando..."
    code --install-extension "$VSIX_NAME"
    echo ""
    echo "✅ Extensão instalada com sucesso!"
    echo ""
    echo "🎯 Próximos passos:"
    echo "   1. Reinicie o VS Code"
    echo "   2. Execute: Cmd+Shift+P → 'Varejo CRM: Configurar GitLab'"
    echo "   3. Preencha suas credenciais"
    echo "   4. Use o Copilot: '@workspace crie uma US...'"
    exit 0
fi

# Opção 2: Baixar do GitLab Releases (requer token)
echo "📥 Baixando do GitLab Releases..."
echo "   URL: ${GITLAB_URL}/${PROJECT_PATH}/-/releases/v${VERSION}"
echo ""

if [ -z "$GITLAB_TOKEN" ]; then
    echo "⚠️  GITLAB_TOKEN não configurado."
    echo ""
    echo "Para baixar automaticamente, defina:"
    echo "   export GITLAB_TOKEN='glpat-xxxxx'"
    echo ""
    echo "Ou baixe manualmente de:"
    echo "   ${GITLAB_URL}/${PROJECT_PATH}/-/releases/v${VERSION}"
    echo ""
    echo "E execute:"
    echo "   code --install-extension ${VSIX_NAME}"
    exit 1
fi

# Baixa via API
API_URL="${GITLAB_URL}/api/v4/projects/$(echo $PROJECT_PATH | sed 's/\//%2F/g')/releases/v${VERSION}"

echo "   Buscando release..."
curl -sS \
    --header "PRIVATE-TOKEN: ${GITLAB_TOKEN}" \
    "$API_URL" > release.json

# Extrai URL do asset
ASSET_URL=$(cat release.json | grep -o '"url":"[^"]*'${VSIX_NAME}'"' | sed 's/"url":"//;s/"$//')

if [ -z "$ASSET_URL" ]; then
    echo "❌ Arquivo .vsix não encontrado no release v${VERSION}"
    echo ""
    echo "Disponível em:"
    cat release.json | grep -o '"name":"[^"]*"' | sed 's/"name":"//;s/"$//' | head -5
    rm release.json
    exit 1
fi

echo "   Baixando arquivo..."
curl -L -o "$VSIX_NAME" \
    --header "PRIVATE-TOKEN: ${GITLAB_TOKEN}" \
    "$ASSET_URL"

rm release.json

echo "   ✅ Download concluído"
echo ""

# Instala
echo "📦 Instalando extensão..."
code --install-extension "$VSIX_NAME"

echo ""
echo "✅ Extensão instalada com sucesso!"
echo ""
echo "🎯 Próximos passos:"
echo "   1. Reinicie o VS Code"
echo "   2. Execute: Cmd+Shift+P → 'Varejo CRM: Configurar GitLab'"
echo "   3. Preencha suas credenciais"
echo "   4. Use o Copilot: '@workspace crie uma US no projeto X sobre Y'"
echo ""
echo "📚 Documentação completa:"
echo "   ${GITLAB_URL}/${PROJECT_PATH}/-/blob/main/README.md"
echo ""
