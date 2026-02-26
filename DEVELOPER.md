# 📦 Estrutura da Extensão - Guia do Desenvolvedor

Este documento descreve a arquitetura da extensão e como publicá-la.

## 📁 Estrutura do Projeto

```
varejo-crm-mcp/
├── 📄 package.json              # Manifesto da extensão VS Code
├── 📄 tsconfig.json             # Configuração TypeScript
├── 📄 .vscodeignore             # O que não incluir no .vsix
├── 📄 .gitignore                # O que não commitar
├── 📄 .gitlab-ci.yml            # CI/CD automático
│
├── 📚 README.md                 # Documentação principal
├── 📚 CHANGELOG.md              # Histórico de versões
├── 📚 QUICKSTART.md             # Guia rápido 5min
├── 📚 LICENSE                   # Licença MIT
│
├── 📂 src/                      # Código TypeScript da extensão
│   ├── extension.ts             # Entry point (activate/deactivate)
│   ├── configuration.ts         # Gerencia configs e Secret Storage
│   └── mcp-manager.ts           # Gerencia processo Python do MCP
│
├── 📂 out/                      # JavaScript compilado (ignorado no git)
│
├── 📂 scripts/                  # Scripts de automação
│   ├── build.sh                 # Build completo (.vsix)
│   └── install.sh               # Instalação automática
│
└── 🐍 crm_mcp_server.py         # Servidor MCP (Python)
```

---

## 🏗️ Arquitetura da Extensão

### 1. **Extension Entry Point** (`src/extension.ts`)

```typescript
activate()  → Chamado quando extensão inicia
  ↓
  ├─ Verifica se está configurado (ConfigurationManager)
  │   ├─ Não? → Mostra wizard de configuração
  │   └─ Sim? → Inicia MCP Server
  │
  └─ Registra comandos:
      ├─ varejocrm.configure
      ├─ varejocrm.createIssue
      ├─ varejocrm.listProjects
      └─ varejocrm.showTemplate

deactivate() → Chamado quando extensão desativa
  └─ Para MCP Server
```

### 2. **Configuration Manager** (`src/configuration.ts`)

```typescript
ConfigurationManager
  ├─ isConfigured()              → Verifica se tem token
  ├─ getToken()                  → Busca token do Secret Storage
  ├─ setToken()                  → Salva token (criptografado)
  ├─ getConfiguration()          → Retorna config completa
  ├─ showConfigurationWizard()   → Wizard de setup inicial
  └─ createMCPConfigFile()       → Gera config temp pro Python
```

**Segurança:**
- Token armazenado no **Secret Storage API** do VS Code (criptografado)
- Outras configs em `settings.json` (podem ser versionadas)
- Nenhuma credencial no código

### 3. **MCP Manager** (`src/mcp-manager.ts`)

```typescript
MCPManager
  ├─ start()        → Inicia processo Python (child_process.spawn)
  │   ├─ Valida configuração
  │   ├─ Prepara env vars (GITLAB_TOKEN, etc)
  │   ├─ Spawna processo: python3 crm_mcp_server.py
  │   ├─ Monitora stdout/stderr
  │   └─ Cria status bar item
  │
  ├─ stop()         → Mata processo Python
  └─ isRunning()    → Verifica status
```

**Comunicação:**
- VS Code ←→ Python via **stdin/stdout** (JSON-RPC)
- Logs Python → VS Code Output Channel
- Processo Python como **child process**

### 4. **Python MCP Server** (`crm_mcp_server.py`)

```python
main() loop:
  ↓
  ├─ Lê stdin (JSON-RPC messages)
  ├─ Processa: initialize, tools/list, tools/call
  ├─ Chama GitLab API
  └─ Responde no stdout (JSON-RPC)

Tools:
  ├─ list_gitlab_projects    → GET /groups/{id}/projects
  ├─ create_gitlab_issue     → POST /projects/{id}/issues
  └─ get_gitlab_issue_template → Retorna template local
```

---

## 🚀 Como Publicar

### **Opção 1: Marketplace Público** (requer conta)

```bash
# 1. Crie conta publisher
# https://marketplace.visualstudio.com/manage/createpublisher

# 2. Obtenha Personal Access Token
# https://dev.azure.com/panvel/_usersSettings/tokens

# 3. Login
vsce login panvel

# 4. Publique
vsce publish
```

### **Opção 2: GitLab Releases** ⭐ Recomendado

```bash
# 1. Build
./scripts/build.sh

# 2. Tag & Push
git tag v1.0.0
git push origin v1.0.0

# 3. CI/CD cria release automaticamente
# http://gitlab.dimed.com.br/.../releases/v1.0.0

# 4. Time instala
./scripts/install.sh 1.0.0
```

### **Opção 3: GitLab Package Registry**

```bash
# Descomente no .gitlab-ci.yml:
# publish:package

# Push tag
git tag v1.0.0
git push origin v1.0.0

# CI/CD publica automaticamente
```

---

## 🔄 Fluxo de Desenvolvimento

### 1. **Desenvolvimento Local**

```bash
# Clone
git clone https://gitlab.dimed.com.br/.../varejo-crm-mcp
cd varejo-crm-mcp

# Instale dependências
npm install
pip install -r requirements.txt

# Compile TypeScript
npm run compile

# Watch mode (auto-recompila)
npm run watch

# Teste
# F5 no VS Code → Abre Extension Development Host
```

### 2. **Build & Test**

```bash
# Build completo
./scripts/build.sh

# Instale localmente
code --install-extension varejo-crm-mcp-1.0.0.vsix

# Teste
# Reinicie VS Code
# Configure credenciais
# Use Copilot
```

### 3. **Release**

```bash
# 1. Atualize CHANGELOG.md
# 2. Atualize version em package.json
# 3. Commit
git add .
git commit -m "chore: release v1.0.1"

# 4. Tag
git tag v1.0.1
git push origin main
git push origin v1.0.1

# 5. CI/CD faz o resto
```

---

## 🎯 Próximas Features

### Em Roadmap:

- [ ] **Auto-updater**: Extensão se atualiza automaticamente
- [ ] **Templates Customizáveis**: Usuário pode criar templates próprios
- [ ] **Multi-GitLab**: Suporte a múltiplas instâncias GitLab
- [ ] **Métricas**: Dashboard com estatísticas de uso
- [ ] **CLI Tool**: Criar issues via terminal
- [ ] **Webhooks**: Notificações de issues criadas
- [ ] **Jira Integration**: Criar issues no Jira também

### Como Adicionar Nova Tool:

```python
# 1. Adicione função em crm_mcp_server.py

def _create_minha_tool() -> dict:
    return {
        "name": "minha_tool",
        "description": "Descrição...",
        "inputSchema": {...}
    }

def handle_minha_tool(arguments: dict) -> dict:
    # Lógica aqui
    return _create_success_response("Resultado")

# 2. Registre em handle_list_tools()
# 3. Adicione handler em handle_call_tool()
# 4. Teste!
```

---

## 📊 Métricas

### Build:
- **TypeScript**: ~200 linhas
- **Python**: ~640 linhas
- **Total**: ~840 linhas
- **Build time**: ~10s
- **VSIX size**: ~50KB (sem node_modules)

### Performance:
- **Startup**: <500ms
- **Issue creation**: ~2s
- **Project listing**: ~1s
- **Memory**: ~20MB (processo Python)

---

## 🐛 Debug

### Extension Host:

```bash
# F5 no VS Code
# Breakpoints funcionam no TypeScript
```

### MCP Server (Python):

```bash
# Teste manual
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | \
python3 crm_mcp_server.py

# Logs
# View → Output → Varejo CRM MCP Server
```

### CI/CD Pipeline:

```bash
# Ver logs
# GitLab → CI/CD → Pipelines → [pipeline]

# Testar localmente
docker run -it --rm -v $PWD:/workspace -w /workspace \
  node:20-alpine sh

npm install && npm run compile && npm run package
```

---

## 📚 Referências

- [VS Code Extension API](https://code.visualstudio.com/api)
- [MCP Protocol Spec](https://modelcontextprotocol.io/docs)
- [GitLab API](https://docs.gitlab.com/ee/api/)
- [Secret Storage API](https://code.visualstudio.com/api/references/vscode-api#SecretStorage)
- [VSCE Publishing](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)

---

**Dúvidas?** Abra uma issue ou pergunte no canal do time! 🚀
