# AI MR Review & GitLab Issue Creator

Automação para GitLab com OpenAI: revisão de código e criação de issues.

## Ferramentas

### 1. MR Review (`main.py`)
Analisa Merge Requests e comenta sugestões de melhoria diretamente no GitLab. Foca em bugs, segurança, performance e violações de SOLID.

```bash
python main.py
# Informe project_id e mr_iid quando solicitado
```

### 2. Issue Creator (`gitlab_issue_mcp_server.py`)
Servidor MCP que cria issues no GitLab. A IA gera título e descrição **visual e objetiva** com emojis e formatação chamativa. Detecta automaticamente o tipo e adiciona prefixo:
- `[US] -` para User Stories
- `[TD] -` para Débitos Técnicos  
- `[BUG] -` para Bugs

**Uso via Copilot:**
```
@workspace crie uma user story no projeto user-stories sobre implementar cache Redis
```

**Tools disponíveis:**
- `list_gitlab_projects` - Lista projetos do grupo
- `create_gitlab_issue` - Cria issue com contexto (auto-detecta tipo)
- `generate_issue_content` - Gera apenas conteúdo sem criar

## Setup

### 1. Dependências
```bash
pip install -r requirements.txt
```

### 2. Variáveis de Ambiente
```bash
export GITLAB_TOKEN="glpat-xxxxx"      # Token com scope 'api'
export OPENAI_API_KEY="sk-proj-xxxxx"
```

### 3. Configurar MCP (Issue Creator)

Edite `~/Library/Application Support/Code/User/mcp.json`:

```json
{
  "servers": {
    "gitlab-issue-creator": {
      "command": "/caminho/.venv/bin/python",
      "args": ["/caminho/gitlab_issue_mcp_server.py"],
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

Reinicie o VS Code.

## Configuração Avançada

### MR Review - Variáveis Opcionais
```bash
export MR_REVIEW_MODE="balanced"              # strict, balanced, lenient
export MR_REVIEW_OPENAI_TIMEOUT_SECONDS="120"
export MR_REVIEW_MAX_FILE_CONTEXT_CHARS="80000"
export MR_REVIEW_DEBUG="1"                     # Ativa logs detalhados
```

### Issue Creator - Variáveis Opcionais
```bash
export GITLAB_API_URL="http://gitlab.dimed.com.br/api/v4"
export GITLAB_DEFAULT_GROUP="grupopanvel/varejo/crm"
export GITLAB_DEFAULT_ASSIGNEE="lanschau"
```

## Tokens

**GitLab:** http://gitlab.dimed.com.br/-/user_settings/personal_access_tokens (scope: `api`)

**OpenAI:** https://platform.openai.com/api-keys

## Troubleshooting

**MCP não aparece no Copilot:**
```bash
# Teste manual
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | \
.venv/bin/python gitlab_issue_mcp_server.py
```

**Projeto não encontrado:**
```
@workspace liste os projetos GitLab
```

## Arquivos

- `main.py` - MR Review
- `gitlab_issue_mcp_server.py` - MCP Server
- `requirements.txt` - Dependências
- [MCP_SERVER_README.md](MCP_SERVER_README.md) - Documentação completa MCP
- [SETUP_OUTROS_USUARIOS.md](SETUP_OUTROS_USUARIOS.md) - Guia de distribuição
