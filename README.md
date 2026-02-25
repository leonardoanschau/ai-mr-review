# AI MR Review & GitLab Issue Creator 🤖

Ferramentas de automação para GitLab com integração OpenAI.

## 🎯 Ferramentas Disponíveis

### 1. **MR Review** (`main.py`)
Revisão automatizada de Merge Requests do GitLab usando IA.

**Funcionalidades:**
- Análise automatizada de código em MRs
- Comentários diretos no GitLab
- Foco em Clean Code, DDD e boas práticas
- Sugestões de melhorias específicas por linha

**Uso:**
```bash
python main.py
```

### 2. **GitLab Issue Creator** (`gitlab_issue_mcp_server.py`) ⭐ NOVO
Servidor MCP para criar issues no GitLab com conteúdo gerado por IA.

**Funcionalidades:**
- ✨ Cria issues com título e descrição gerados automaticamente pela IA
- 🔍 Busca inteligente de projetos (incluindo subgrupos)
- 🏷️ Suporta labels e assignees customizados
- 🤖 Integração nativa com GitHub Copilot via MCP

**📖 Documentação completa:** [MCP_SERVER_README.md](MCP_SERVER_README.md)

**⚙️ Setup para outros usuários:** [SETUP_OUTROS_USUARIOS.md](SETUP_OUTROS_USUARIOS.md)

---

## 🚀 Quick Start - Issue Creator (MCP)

### 1. Instalar Dependências

```bash
pip install -r requirements.txt
```

### 2. Configurar Variáveis de Ambiente

```bash
export GITLAB_TOKEN="glpat-xxxxx"           # Token GitLab com scope 'api'
export OPENAI_API_KEY="sk-proj-xxxxx"      # API Key OpenAI
```

### 3. Configurar MCP no VS Code

Edite: `~/Library/Application Support/Code/User/mcp.json`

Adicione:
```json
{
  "servers": {
    "gitlab-issue-creator": {
      "command": "/caminho/completo/.venv/bin/python",
      "args": ["/caminho/completo/gitlab_issue_mcp_server.py"],
      "env": {
        "GITLAB_TOKEN": "${env:GITLAB_TOKEN}",
        "OPENAI_API_KEY": "${env:OPENAI_API_KEY}",
        "GITLAB_API_URL": "http://gitlab.dimed.com.br/api/v4",
        "GITLAB_DEFAULT_GROUP": "grupopanvel/varejo/crm",
        "GITLAB_DEFAULT_ASSIGNEE": "seu-username"
      },
      "type": "stdio"
    }
  }
}
```

### 4. Reiniciar VS Code

### 5. Usar no Copilot Chat! 🎉

```
@workspace crie uma issue no projeto user-stories sobre implementar autenticação OAuth2
```

---

## 📦 Estrutura do Projeto

```
ai-mr-review/
├── main.py                          # MR Review CLI
├── gitlab_issue_mcp_server.py       # MCP Server para criar issues
├── requirements.txt                 # Dependências Python
├── README.md                        # Este arquivo
├── MCP_SERVER_README.md            # Documentação completa do MCP
├── SETUP_OUTROS_USUARIOS.md        # Guia de setup para distribuição
├── mcp-config.json                 # Exemplo de configuração MCP
└── test_mcp_server.sh              # Script de testes do MCP
```

---

## 🛠️ Tools MCP Disponíveis

### 1. `list_gitlab_projects`
Lista todos os projetos do grupo CRM (incluindo subgrupos).

**Uso no Copilot:**
```
@workspace liste os projetos GitLab disponíveis
```

### 2. `create_gitlab_issue`
Cria issue no GitLab com conteúdo gerado por IA.

**Parâmetros:**
- `project_name` (obrigatório): Nome do projeto
- `context` (obrigatório): Contexto da issue
- `assignee` (opcional): Username do responsável
- `labels` (opcional): Array de labels

**Uso no Copilot:**
```
@workspace crie uma issue no projeto user-stories sobre:

IMPORTANTE: O título deve começar com "[TD] - "

Implementar cache Redis para queries de produtos.
```

### 3. `generate_issue_content`
Gera apenas título e descrição sem criar a issue.

**Uso no Copilot:**
```
@workspace gere o conteúdo de uma issue sobre migração PostgreSQL 15
```

---

## ⚡ Exemplos de Uso

### MR Review

```bash
# Revisar uma MR específica
python main.py

# Seguir os prompts:
# - Project ID: 123
# - MR IID: 45
```

### Issue Creator via MCP

```
@workspace crie uma issue no projeto customer-service:

Implementar validação de CPF com dígito verificador no cadastro. 
Deve validar formato e calcular dígitos verificadores.
Adicionar testes unitários.
```

**Resultado:**
- ✅ Issue criada automaticamente
- 📌 Título gerado pela IA
- 📄 Descrição estruturada em Markdown
- 🏷️ Labels aplicadas
- 👤 Assignee configurado

---

## 🔐 Configurações

### Variáveis de Ambiente Necessárias

```bash
# Obrigatórias
export GITLAB_TOKEN="glpat-xxxxx"
export OPENAI_API_KEY="sk-proj-xxxxx"

# Opcionais (com defaults)
export GITLAB_API_URL="http://gitlab.dimed.com.br/api/v4"
export GITLAB_DEFAULT_GROUP="grupopanvel/varejo/crm"
export GITLAB_DEFAULT_ASSIGNEE="lanschau"
export MR_REVIEW_OPENAI_TIMEOUT_SECONDS="90"
```

### Como Obter Tokens

**GitLab Token:**
1. Acesse: http://gitlab.dimed.com.br/-/user_settings/personal_access_tokens
2. Crie token com scope: `api`
3. Copie o token gerado

**OpenAI API Key:**
1. Acesse: https://platform.openai.com/api-keys
2. Crie nova API key
3. Copie a chave

---

## 📚 Documentação Adicional

- **[MCP_SERVER_README.md](MCP_SERVER_README.md)** - Documentação completa do MCP Server
- **[SETUP_OUTROS_USUARIOS.md](SETUP_OUTROS_USUARIOS.md)** - Guia para distribuir para outros devs
- **[mcp-config.json](mcp-config.json)** - Exemplo de configuração MCP

---

## 🚨 Troubleshooting

### MCP Server não aparece no Copilot

1. Verifique logs: VS Code > Output > GitHub Copilot
2. Confirme que tokens estão configurados: `echo $GITLAB_TOKEN`
3. Teste execução manual:
   ```bash
   echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | \
   .venv/bin/python gitlab_issue_mcp_server.py
   ```

### Projeto não encontrado

1. Liste projetos disponíveis:
   ```
   @workspace liste os projetos GitLab
   ```
2. Use nome exato ou parcial
3. Verifique permissões do token

### IA não está gerando bom conteúdo

- Forneça mais contexto detalhado
- Seja específico sobre requisitos técnicos
- Use bullet points para organizar informações
- Mencione prefixos desejados no contexto

---

## 🤝 Compartilhar com Outros Devs

Para compartilhar o Issue Creator:

1. **Enviar arquivos:**
   - `gitlab_issue_mcp_server.py`
   - `requirements.txt`
   - `SETUP_OUTROS_USUARIOS.md`

2. **Instruir a:**
   - Instalar dependências
   - Configurar tokens
   - Adicionar ao mcp.json do VS Code
   - Reiniciar VS Code

Ver guia completo em: [SETUP_OUTROS_USUARIOS.md](SETUP_OUTROS_USUARIOS.md)

---

## 📝 Tecnologias

- **Python 3.8+**
- **GitLab API** - Integração com GitLab
- **OpenAI API** - GPT-4.1 para geração de conteúdo
- **MCP (Model Context Protocol)** - Integração com Copilot
- **unidiff** - Parsing de diffs
- **requests** - HTTP client

---

## 📄 Licença

Uso interno Grupo Panvel.

---

## 🎉 Features

- [x] MR Review automatizado
- [x] Issue Creator via MCP
- [x] Busca em subgrupos GitLab
- [x] Geração de conteúdo com IA
- [x] Integração nativa com Copilot
- [x] Customização de labels e assignees
- [ ] Suporte a múltiplos idiomas
- [ ] Templates customizáveis
- [ ] Webhooks GitLab

---

**Desenvolvido por Leonardo Anschau** 🚀
