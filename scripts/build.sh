#!/bin/bash
# Script para build e empacotamento da extensão VS Code

set -e

echo "🚀 Build da extensão GitLab MCP"
echo "=================================="

# Verifica Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js não encontrado. Instale: https://nodejs.org/"
    exit 1
fi

# Verifica Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 não encontrado. Instale: https://www.python.org/"
    exit 1
fi

echo "✅ Node.js: $(node --version)"
echo "✅ Python: $(python3 --version)"
echo ""

# Instala dependências Node
echo "📦 Instalando dependências Node..."
npm install

# Instala dependências Python
echo "🐍 Instalando dependências Python..."
if [ ! -d ".venv" ]; then
    python3 -m venv .venv
fi

source .venv/bin/activate
pip install -r requirements.txt

echo ""

# Compila TypeScript
echo "🔨 Compilando TypeScript..."
npm run compile

echo ""

# Compila binário Python
echo "🔨 Compilando binário Python..."
./scripts/build-binary.sh

echo ""

# Empacota extensão
echo "📦 Gerando arquivo .vsix..."
npm run package

echo ""
echo "✅ Build concluído!"
echo ""
echo "📁 Arquivo gerado:"
ls -lh *.vsix | tail -1

echo ""
echo "🎯 Para instalar:"
echo "   code --install-extension gitlab-mcp-1.0.0.vsix"
echo ""
