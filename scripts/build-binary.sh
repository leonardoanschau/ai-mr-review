#!/bin/bash
set -e

echo "🏗️  Building GitLab MCP Server Binary..."

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Detect OS
OS="unknown"
if [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macos"
    BINARY_NAME="gitlab-mcp-anschauti-tools-server"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="linux"
    BINARY_NAME="gitlab-mcp-anschauti-tools-server"
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]]; then
    OS="windows"
    BINARY_NAME="gitlab-mcp-anschauti-tools-server.exe"
fi

echo -e "${BLUE}📦 Detected OS: $OS${NC}"

# Create bin directory
mkdir -p bin

# Activate virtual environment if exists, or create one
if [ -d ".venv" ]; then
    echo -e "${BLUE}📦 Using existing virtual environment...${NC}"
    source .venv/bin/activate
else
    echo -e "${BLUE}📦 Creating virtual environment...${NC}"
    python3 -m venv .venv
    source .venv/bin/activate
fi

# Install dependencies
echo -e "${BLUE}📥 Installing dependencies...${NC}"
pip install pyinstaller requests

# Build with PyInstaller
echo -e "${BLUE}🔨 Compiling Python to executable...${NC}"
pyinstaller \
    --onefile \
    --name gitlab-mcp-anschauti-tools-server \
    --clean \
    --noconfirm \
    --hidden-import=requests \
    --hidden-import=urllib3 \
    --hidden-import=certifi \
    --hidden-import=charset_normalizer \
    --hidden-import=idna \
    gitlab_mcp_anschauti_server.py

# Move binary to bin directory
echo -e "${BLUE}📦 Moving binary to bin/...${NC}"
if [[ -f "dist/$BINARY_NAME" ]]; then
    mv "dist/$BINARY_NAME" "bin/$BINARY_NAME"
    chmod +x "bin/$BINARY_NAME"
    echo -e "${GREEN}✅ Binary created: bin/$BINARY_NAME${NC}"
    ls -lh "bin/$BINARY_NAME"
else
    echo "❌ Error: Binary not found in dist/"
    exit 1
fi

# Cleanup
echo -e "${BLUE}🧹 Cleaning up...${NC}"
rm -rf build dist *.spec

echo -e "${GREEN}✅ Build complete!${NC}"
echo ""
echo "Binary location: bin/$BINARY_NAME"
echo "Size: $(du -h bin/$BINARY_NAME | cut -f1)"
