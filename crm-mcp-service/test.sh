#!/bin/bash

# Script de teste rápido do CRM MCP Service
# Uso: ./test.sh [endpoint]

set -e

BASE_URL="${BASE_URL:-http://localhost:8080}"

echo "🧪 CRM MCP Service - Test Script"
echo "================================"
echo "URL: $BASE_URL"
echo ""

# Cores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Função para fazer request
mcp_request() {
    local method=$1
    local params=$2
    local id=$3
    
    local body="{\"jsonrpc\":\"2.0\",\"method\":\"$method\""
    
    if [ -n "$params" ]; then
        body="$body,\"params\":$params"
    fi
    
    body="$body,\"id\":$id}"
    
    echo -e "${YELLOW}Request: $method${NC}"
    echo "$body" | jq .
    echo ""
    
    response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "$body" \
        "$BASE_URL/mcp/v1/messages")
    
    echo -e "${GREEN}Response:${NC}"
    echo "$response" | jq .
    echo ""
    echo "---"
    echo ""
}

# Test 1: Health Check
test_health() {
    echo -e "${YELLOW}1. Testing Health Endpoint${NC}"
    curl -s "$BASE_URL/mcp/health" | jq .
    echo ""
    echo "---"
    echo ""
}

# Test 2: Initialize
test_initialize() {
    echo -e "${YELLOW}2. Testing Initialize${NC}"
    mcp_request "initialize" "" 1
}

# Test 3: List Tools
test_list_tools() {
    echo -e "${YELLOW}3. Testing List Tools${NC}"
    mcp_request "tools/list" "" 2
}

# Test 4: List Projects
test_list_projects() {
    echo -e "${YELLOW}4. Testing List GitLab Projects${NC}"
    params='{"name":"list_gitlab_projects","arguments":{}}'
    mcp_request "tools/call" "$params" 3
}

# Test 5: Generate Issue Content
test_generate_content() {
    echo -e "${YELLOW}5. Testing Generate Issue Content${NC}"
    params='{"name":"generate_issue_content","arguments":{"prompt":"Crie uma issue para implementar autenticação com JWT"}}'
    mcp_request "tools/call" "$params" 4
}

# Main
case "${1:-all}" in
    health)
        test_health
        ;;
    initialize)
        test_initialize
        ;;
    tools)
        test_list_tools
        ;;
    projects)
        test_list_projects
        ;;
    generate)
        test_generate_content
        ;;
    all)
        test_health
        test_initialize
        test_list_tools
        test_list_projects
        # test_generate_content  # Comentado pois usa OpenAI
        ;;
    *)
        echo -e "${RED}Unknown test: $1${NC}"
        echo "Available tests: health, initialize, tools, projects, generate, all"
        exit 1
        ;;
esac

echo -e "${GREEN}✅ Test completed${NC}"
