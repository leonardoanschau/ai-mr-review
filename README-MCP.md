# GitLab Issues MCP - Model Context Protocol Server

Este projeto fornece um servidor MCP (Model Context Protocol) que permite ao GitHub Copilot criar issues no GitLab diretamente do VS Code usando IA para gerar título e descrição.

## 🚀 Features

- **Criar issues com IA**: Descreva o contexto em linguagem natural e a IA gera título e descrição estruturados
- **Listar projetos**: Veja todos os projetos disponíveis em um grupo GitLab
- **Preview de conteúdo**: Gere preview do título/descrição antes de criar a issue
- **Suporte a múltiplos projetos**: Escolha em qual projeto criar a issue
- **Configurável**: Labels, assignees e grupos customizáveis

## 📋 Pré-requisitos

- Python 3.10+
- VS Code com GitHub Copilot
- Tokens de acesso:
  - GitLab Personal Access Token com permissões `api`
  - OpenAI API Key

## 🔧 Instalação

### 1. Instalar dependências

```bash
# Criar e ativar ambiente virtual (recomendado)
python -m venv .venv
source .venv/bin/activate  # No Windows: .venv\Scripts\activate

# Instalar dependências
pip install -r requirements.txt
```

### 2. Configurar variáveis de ambiente

Crie um arquivo `.env` ou configure as variáveis de ambiente:

```bash
export GITLAB_TOKEN="seu-gitlab-token-aqui"
export OPENAI_API_KEY="sua-openai-key-aqui"

# Opcionais (já têm defaults)
export GITLAB_API_URL="http://gitlab.dimed.com.br/api/v4"
export GITLAB_DEFAULT_GROUP="grupopanvel/varejo/crm"
export GITLAB_BACKLOG_LABEL="Grupo Panvel :: Backlog"
export GITLAB_DEFAULT_ASSIGNEE="lanschau"
```

### 3. Configurar VS Code

O projeto já vem com [.vscode/settings.json](.vscode/settings.json) configurado.

Se você quiser habilitar o MCP **globalmente** no VS Code (em todos os workspaces), adicione no seu `settings.json` do usuário (`Cmd/Ctrl + Shift + P` → "Preferences: Open User Settings (JSON)"):

```json
{
  "github.copilot.chat.mcp.servers": {
    "gitlab-issues": {
      "command": "python",
      "args": [
        "/caminho/absoluto/para/gitlab_issues_mcp.py"
      ],
      "env": {
        "GITLAB_TOKEN": "${env:GITLAB_TOKEN}",
        "OPENAI_API_KEY": "${env:OPENAI_API_KEY}",
        "GITLAB_API_URL": "http://gitlab.dimed.com.br/api/v4",
        "GITLAB_DEFAULT_GROUP": "grupopanvel/varejo/crm",
        "GITLAB_BACKLOG_LABEL": "Grupo Panvel :: Backlog",
        "GITLAB_DEFAULT_ASSIGNEE": "lanschau"
      }
    }
  }
}
```

### 4. Reiniciar VS Code

Após configurar, reinicie o VS Code para carregar o MCP server.

## 💡 Como usar

### No Copilot Chat do VS Code

Uma vez configurado, você pode usar o Copilot para criar issues:

**Exemplo 1: Criar issue diretamente**

```
@workspace /gitlab-issues Cria uma issue para implementar autenticação OAuth2 no customer-service. 
Deve incluir login com Google e Facebook, refresh tokens e middleware de autorização.
```

**Exemplo 2: Listar projetos primeiro**

```
@workspace Liste os projetos disponíveis no GitLab
```

**Exemplo 3: Preview antes de criar**

```
@workspace Gera um preview de issue para: refatorar a camada de serviço do módulo de pagamentos
```

## 🛠️ Ferramentas disponíveis

O MCP server expõe 3 ferramentas:

### `create_gitlab_issue`

Cria uma issue no GitLab com título e descrição gerados por IA.

**Parâmetros:**
- `context` (obrigatório): Contexto da issue em texto livre
- `project_name` (opcional): Nome do projeto (ex: 'customer-service')
- `group` (opcional): Caminho do grupo
- `assignee` (opcional): Username do assignee
- `labels` (opcional): Array de labels

### `list_gitlab_projects`

Lista todos os projetos de um grupo.

**Parâmetros:**
- `group` (opcional): Caminho do grupo

### `generate_issue_content`

Gera apenas título e descrição sem criar a issue.

**Parâmetros:**
- `context` (obrigatório): Contexto da issue

## 🧪 Testar manualmente

Você pode testar o servidor MCP diretamente:

```bash
# Rodar o servidor (ele usa stdio)
python gitlab_issues_mcp.py
```

Ou usar o script original standalone:

```bash
python create_issue.py
```

## 📝 Estrutura do Projeto

```
ai-mr-review/
├── gitlab_issues_mcp.py    # Servidor MCP
├── create_issue.py          # Script standalone (CLI)
├── main.py                  # Script de review de MRs
├── requirements.txt         # Dependências Python
├── .vscode/
│   └── settings.json       # Configuração do MCP no VS Code
└── README-MCP.md           # Esta documentação
```

## 🔒 Segurança

- **Nunca commite tokens**: Use variáveis de ambiente
- **Tokens com escopo mínimo**: No GitLab, use apenas as permissões necessárias (`api` para criar issues)
- **Revise antes de criar**: Use preview quando necessário

## 🐛 Troubleshooting

### MCP server não aparece no Copilot

1. Verifique que o VS Code está atualizado
2. Confirme que GitHub Copilot está ativo
3. Reinicie o VS Code
4. Verifique os logs: `Cmd/Ctrl + Shift + P` → "Developer: Show Logs" → "GitHub Copilot Chat"

### Erro de autenticação

Verifique que as variáveis de ambiente estão configuradas:

```bash
echo $GITLAB_TOKEN
echo $OPENAI_API_KEY
```

### Python não encontrado

Certifique-se que o Python está no PATH ou use o caminho absoluto:

```json
"command": "/usr/local/bin/python3"
```

## 📚 Referências

- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)
- [GitHub Copilot MCP Support](https://code.visualstudio.com/docs/copilot/copilot-extensibility-overview)
- [GitLab API Documentation](https://docs.gitlab.com/ee/api/)

## 📄 Licença

MIT

## 👤 Autor

Leonardo Anschau (@lanschau)
