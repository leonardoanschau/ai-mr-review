#!/bin/bash

# Script de build do projeto CRM MCP Service
# Uso: ./build.sh [clean|package|docker|compose]

set -e

echo "🚀 CRM MCP Service - Build Script"
echo "=================================="

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Função para verificar dependências
check_dependencies() {
    echo -e "${YELLOW}Verificando dependências...${NC}"
    
    if ! command -v java &> /dev/null; then
        echo -e "${RED}❌ Java não encontrado. Instale Java 21+${NC}"
        exit 1
    fi
    
    JAVA_VERSION=$(java -version 2>&1 | head -n 1 | cut -d'"' -f2 | cut -d'.' -f1)
    if [ "$JAVA_VERSION" -lt 21 ]; then
        echo -e "${RED}❌ Java 21+ necessário. Versão encontrada: $JAVA_VERSION${NC}"
        exit 1
    fi
    
    if ! command -v mvn &> /dev/null; then
        echo -e "${RED}❌ Maven não encontrado. Instale Maven 3.9+${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ Dependências OK${NC}"
}

# Função para clean
do_clean() {
    echo -e "${YELLOW}Limpando projeto...${NC}"
    mvn clean
    echo -e "${GREEN}✅ Clean completo${NC}"
}

# Função para build
do_package() {
    echo -e "${YELLOW}Compilando projeto...${NC}"
    mvn clean package -DskipTests
    echo -e "${GREEN}✅ Build completo${NC}"
    
    if [ -f target/*.jar ]; then
        JAR_SIZE=$(du -h target/*.jar | cut -f1)
        echo -e "${GREEN}📦 JAR criado: $JAR_SIZE${NC}"
    fi
}

# Função para build com testes
do_test() {
    echo -e "${YELLOW}Compilando e testando projeto...${NC}"
    mvn clean test
    mvn package
    echo -e "${GREEN}✅ Build e testes completos${NC}"
}

# Função para Docker build
do_docker() {
    echo -e "${YELLOW}Construindo imagem Docker...${NC}"
    
    # Primeiro faz o build do JAR
    do_package
    
    # Depois constrói a imagem
    docker build -t crm-mcp-service:latest .
    docker tag crm-mcp-service:latest crm-mcp-service:1.0.0
    
    echo -e "${GREEN}✅ Imagem Docker criada${NC}"
    docker images | grep crm-mcp-service
}

# Função para Docker Compose
do_compose() {
    echo -e "${YELLOW}Iniciando com Docker Compose...${NC}"
    
    # Verifica se existe .env
    if [ ! -f .env ]; then
        echo -e "${YELLOW}⚠️  Arquivo .env não encontrado. Copie .env.example para .env e configure${NC}"
        cp .env.example .env
        echo -e "${YELLOW}📝 Edite o arquivo .env com suas credenciais${NC}"
        exit 1
    fi
    
    # Build da imagem
    do_docker
    
    # Inicia com compose
    docker-compose up -d
    
    echo -e "${GREEN}✅ Serviço iniciado${NC}"
    echo -e "${YELLOW}Aguarde alguns segundos para o serviço inicializar...${NC}"
    sleep 5
    
    # Testa o health
    echo -e "${YELLOW}Testando health check...${NC}"
    curl -s http://localhost:8080/mcp/health | jq . || echo "Serviço ainda não está pronto"
    
    echo -e "${GREEN}✅ Para ver os logs: docker-compose logs -f${NC}"
}

# Função para executar localmente
do_run() {
    echo -e "${YELLOW}Executando localmente...${NC}"
    
    # Verifica se existe .env para carregar variáveis
    if [ -f .env ]; then
        echo -e "${YELLOW}Carregando variáveis de .env${NC}"
        export $(cat .env | grep -v '^#' | xargs)
    else
        echo -e "${RED}❌ Arquivo .env não encontrado. Crie um baseado em .env.example${NC}"
        exit 1
    fi
    
    if [ ! -f target/*.jar ]; then
        echo -e "${YELLOW}JAR não encontrado. Executando build...${NC}"
        do_package
    fi
    
    java -jar target/*.jar
}

# Função de ajuda
show_help() {
    echo "Uso: ./build.sh [comando]"
    echo ""
    echo "Comandos disponíveis:"
    echo "  clean       - Limpa o projeto"
    echo "  package     - Compila o projeto (sem testes)"
    echo "  test        - Compila e executa testes"
    echo "  docker      - Cria imagem Docker"
    echo "  compose     - Inicia com Docker Compose"
    echo "  run         - Executa localmente"
    echo "  help        - Mostra esta ajuda"
    echo ""
    echo "Sem argumentos: executa package"
}

# Main
check_dependencies

case "${1:-package}" in
    clean)
        do_clean
        ;;
    package)
        do_package
        ;;
    test)
        do_test
        ;;
    docker)
        do_docker
        ;;
    compose)
        do_compose
        ;;
    run)
        do_run
        ;;
    help)
        show_help
        ;;
    *)
        echo -e "${RED}❌ Comando desconhecido: $1${NC}"
        show_help
        exit 1
        ;;
esac

echo -e "${GREEN}✨ Concluído!${NC}"
