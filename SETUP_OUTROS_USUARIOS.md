# GitLab Issue Creator MCP - Exemplo de Configuração

## Para outras pessoas configurarem:

### 1. Copiar arquivos necessários:
- `gitlab_issue_mcp_server.py` (servidor MCP)
- `requirements.txt` (dependências Python)

### 2. Instalar dependências:
```bash
pip install -r requirements.txt
```

### 3. Criar tokens:

#### GitLab Token:
1. Acesse: http://gitlab.dimed.com.br/-/user_settings/personal_access_tokens
2. Crie token com scopes: `api`, `read_api`, `write_repository`
3. Copie o token gerado

#### OpenAI API Key:
1. Acesse: https://platform.openai.com/api-keys
2. Crie nova API key
3. Copie a chave

### 4. Configurar environment variables:

**macOS/Linux** - adicionar no `~/.zshrc` ou `~/.bashrc`:
```bash
export GITLAB_TOKEN="glpat-seu-token-aqui"
export OPENAI_API_KEY="sk-proj-sua-chave-aqui"
```

**Windows** - Configurar variáveis de sistema:
```cmd
setx GITLAB_TOKEN "glpat-seu-token-aqui"
setx OPENAI_API_KEY "sk-proj-sua-chave-aqui"
```

### 5. Configurar MCP no VS Code:

**Localização do arquivo de config:**
- **macOS**: `~/Library/Application Support/Code/User/globalStorage/github.copilot-chat/config.json`
- **Windows**: `%APPDATA%\Code\User\globalStorage\github.copilot-chat\config.json`
- **Linux**: `~/.config/Code/User/globalStorage/github.copilot-chat/config.json`

**Conteúdo a adicionar:**
```json
{
  "mcpServers": {
    "gitlab-issue-creator": {
      "command": "python3",
      "args": [
        "/caminho/completo/para/gitlab_issue_mcp_server.py"
      ],
      "env": {
        "GITLAB_TOKEN": "${GITLAB_TOKEN}",
        "OPENAI_API_KEY": "${OPENAI_API_KEY}",
        "GITLAB_API_URL": "http://gitlab.dimed.com.br/api/v4",
        "GITLAB_DEFAULT_GROUP": "grupopanvel/varejo/crm",
        "GITLAB_DEFAULT_ASSIGNEE": "seu-username-gitlab"
      }
    }
  }
}
```

**⚠️ IMPORTANTE:**
- Substitua `/caminho/completo/para/` pelo caminho real onde você baixou o arquivo
- Substitua `seu-username-gitlab` pelo seu usuário do GitLab

### 6. Reiniciar VS Code:
Feche completamente e reabra o VS Code para carregar o MCP server.

### 7. Testar:
No Copilot Chat, digite:
```
@workspace liste os projetos GitLab disponíveis
```

Se funcionar, você verá a lista de projetos do CRM!

---

## Troubleshooting:

### "Server não está respondendo"
1. Verifique logs: VS Code > Output > GitHub Copilot
2. Teste manualmente: `python3 gitlab_issue_mcp_server.py`
3. Confirme tokens: `echo $GITLAB_TOKEN` e `echo $OPENAI_API_KEY`

### "Projeto não encontrado"
1. Liste projetos disponíveis primeiro
2. Use nome exato ou partial match
3. Verifique permissões do seu token no GitLab

### "OpenAI API error"
1. Verifique se tem créditos na conta OpenAI
2. Confirme que a API key está válida
3. Teste: `curl https://api.openai.com/v1/models -H "Authorization: Bearer $OPENAI_API_KEY"`

---

## Customização:

### Alterar labels padrão:
No arquivo `gitlab_issue_mcp_server.py`, linha ~185:
```python
labels = arguments.get("labels", ["Seu Label 1", "Seu Label 2"])
```

### Alterar modelo de IA:
Linha ~51:
```python
"model": "gpt-4.1",  # pode usar: gpt-4o, gpt-4-turbo, etc
```

### Alterar grupo/board padrão:
No `mcp-config.json`:
```json
"GITLAB_DEFAULT_GROUP": "seu/grupo/aqui",
"GITLAB_DEFAULT_ASSIGNEE": "seu-usuario"
```
