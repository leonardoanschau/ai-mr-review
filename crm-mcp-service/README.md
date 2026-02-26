# CRM MCP Service

Serviço MCP (Model Context Protocol) para integração com GitLab, permitindo criação de issues e gestão de projetos através do GitHub Copilot.

## 🚀 Funcionalidades

- **List GitLab Projects**: Lista todos os projetos do grupo CRM
- **Create GitLab Issue**: Cria issues no GitLab com assignee e labels
- **Generate Issue Content**: Gera conteúdo de issues usando IA (OpenAI GPT-4)

## 📋 Pré-requisitos

- Java 21+
- Maven 3.9+
- Docker (opcional, para containerização)
- GitLab API Token
- OpenAI API Key

## 🛠️ Configuração

### 1. Variáveis de Ambiente

Crie um arquivo `.env` ou configure as variáveis de ambiente:

```bash
# GitLab
export GITLAB_API_URL="http://gitlab.dimed.com.br/api/v4"
export GITLAB_TOKEN="seu-token-gitlab"
export GITLAB_DEFAULT_GROUP="grupopanvel/varejo/crm"
export GITLAB_DEFAULT_ASSIGNEE="seu-usuario"
export GITLAB_DEFAULT_BACKLOG_LABEL="Grupo Panvel :: Backlog"

# OpenAI
export OPENAI_API_KEY="sua-chave-openai"
export OPENAI_MODEL="gpt-4o"
```

### 2. Build do Projeto

```bash
# Compile e gere o JAR
mvn clean package

# Ou pule os testes se necessário
mvn clean package -DskipTests
```

### 3. Executar Localmente

```bash
# Com variáveis de ambiente configuradas
java -jar target/crm-mcp-service-1.0.0.jar

# Ou especifique as variáveis no comando
java -jar target/crm-mcp-service-1.0.0.jar \
  --gitlab.token=seu-token \
  --openai.api-key=sua-chave
```

### 4. Executar com Docker

```bash
# Build da imagem
docker build -t crm-mcp-service:latest .

# Executar container
docker run -d \
  -p 8080:8080 \
  -e GITLAB_TOKEN=seu-token \
  -e OPENAI_API_KEY=sua-chave \
  --name crm-mcp-service \
  crm-mcp-service:latest
```

### 5. Executar com Docker Compose

```bash
# Configure as variáveis no .env
cp .env.example .env

# Inicie o serviço
docker-compose up -d

# Veja os logs
docker-compose logs -f
```

## 📡 API Endpoints

### REST API

#### Health Check
```bash
GET http://localhost:8080/mcp/health
```

#### MCP Protocol
```bash
POST http://localhost:8080/mcp/v1/messages
Content-Type: application/json

# Initialize
{
  "jsonrpc": "2.0",
  "method": "initialize",
  "id": 1
}

# List Tools
{
  "jsonrpc": "2.0",
  "method": "tools/list",
  "id": 2
}

# Call Tool
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "list_gitlab_projects",
    "arguments": {}
  },
  "id": 3
}
```

### WebSocket

Conecte-se via WebSocket para comunicação em tempo real:

```javascript
ws://localhost:8080/mcp/ws
```

## 🔧 Configuração no GitHub Copilot

Para usar este serviço com o GitHub Copilot, configure o MCP no VS Code:

### Arquivo: `~/Library/Application Support/Code/User/mcp.json` (macOS)

```json
{
  "mcpServers": {
    "gitlab-issues": {
      "command": "curl",
      "args": [
        "-X", "POST",
        "-H", "Content-Type: application/json",
        "-d", "@-",
        "http://seu-servidor:8080/mcp/v1/messages"
      ]
    }
  }
}
```

Ou use um script wrapper:

```bash
#!/bin/bash
# mcp-gitlab-client.sh

SERVER_URL="${MCP_SERVER_URL:-http://localhost:8080/mcp/v1/messages}"

while IFS= read -r line; do
  curl -X POST \
    -H "Content-Type: application/json" \
    -d "$line" \
    "$SERVER_URL"
done
```

Configure no `mcp.json`:

```json
{
  "mcpServers": {
    "gitlab-issues": {
      "command": "/path/to/mcp-gitlab-client.sh",
      "env": {
        "MCP_SERVER_URL": "http://seu-servidor:8080/mcp/v1/messages"
      }
    }
  }
}
```

## 🧪 Testando o Serviço

### Teste 1: Health Check
```bash
curl http://localhost:8080/mcp/health
```

### Teste 2: Listar Projetos
```bash
curl -X POST http://localhost:8080/mcp/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "list_gitlab_projects",
      "arguments": {}
    },
    "id": 1
  }'
```

### Teste 3: Criar Issue
```bash
curl -X POST http://localhost:8080/mcp/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "create_gitlab_issue",
      "arguments": {
        "project_id": "2371",
        "title": "Teste de Issue",
        "description": "Issue criada via MCP Service"
      }
    },
    "id": 2
  }'
```

## 📊 Monitoramento

### Spring Boot Actuator

Endpoints de monitoramento disponíveis:

```bash
# Health
curl http://localhost:8080/actuator/health

# Metrics
curl http://localhost:8080/actuator/metrics

# Info
curl http://localhost:8080/actuator/info
```

### Logs

Os logs são configurados para nível INFO por padrão. Para ajustar:

```yaml
# application.yml
logging:
  level:
    com.panvel.crm.mcp: DEBUG
```

## 🔒 Segurança

⚠️ **Importante**: Este serviço deve ser implantado em uma rede interna/privada.

Recomendações:
- Use HTTPS em produção (configure TLS no application.yml)
- Implemente autenticação (API Key, OAuth2, etc.)
- Use secrets management (Vault, AWS Secrets Manager)
- Configure firewall para restringir acesso
- Mantenha os tokens em variáveis de ambiente, nunca no código

## 🚢 Deploy em Produção

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: crm-mcp-service
spec:
  replicas: 2
  template:
    spec:
      containers:
      - name: crm-mcp-service
        image: seu-registry/crm-mcp-service:latest
        ports:
        - containerPort: 8080
        env:
        - name: GITLAB_TOKEN
          valueFrom:
            secretKeyRef:
              name: gitlab-secrets
              key: token
        - name: OPENAI_API_KEY
          valueFrom:
            secretKeyRef:
              name: openai-secrets
              key: api-key
```

### VM/Servidor

```bash
# Crie um service systemd
sudo cat > /etc/systemd/system/crm-mcp-service.service << 'EOF'
[Unit]
Description=CRM MCP Service
After=network.target

[Service]
Type=simple
User=app
WorkingDirectory=/opt/crm-mcp-service
ExecStart=/usr/bin/java -jar /opt/crm-mcp-service/app.jar
Restart=always
Environment="GITLAB_TOKEN=..."
Environment="OPENAI_API_KEY=..."

[Install]
WantedBy=multi-user.target
EOF

# Inicie o serviço
sudo systemctl daemon-reload
sudo systemctl enable crm-mcp-service
sudo systemctl start crm-mcp-service
```

## 🤝 Contribuindo

1. Clone o repositório
2. Crie uma branch para sua feature (`git checkout -b feature/nova-funcionalidade`)
3. Commit suas mudanças (`git commit -m 'Adiciona nova funcionalidade'`)
4. Push para a branch (`git push origin feature/nova-funcionalidade`)
5. Abra um Pull Request

## 📝 Licença

Propriedade da Panvel - Uso Interno

## 📞 Suporte

Para questões e suporte, entre em contato com o time de CRM.

---

**Desenvolvido com ☕ pela equipe CRM Panvel**
