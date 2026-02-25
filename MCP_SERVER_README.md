# GitLab Issue Creator - MCP Server

Servidor MCP (Model Context Protocol) para criar issues no GitLab com conteúdo gerado automaticamente por IA.

## 🎯 Funcionalidades

- **Criação automatizada de issues**: Forneça apenas o contexto, a IA gera título e descrição estruturados
- **Busca inteligente de projetos**: Suporta busca em subgrupos do GitLab
- **Customização completa**: Labels, assignees e configurações via variáveis de ambiente
- **Integração nativa com Copilot**: Funciona 100% via MCP, sem interação manual

## 🔧 Configuração

### 1. Instalar dependências

```bash
cd /Users/leonardoanschau/Documents/Pessoal/ai-mr-review
pip install requests
```

### 2. Configurar variáveis de ambiente

Adicione no seu `.zshrc` ou `.bashrc`:

```bash
export GITLAB_TOKEN="seu-token-aqui"
export OPENAI_API_KEY="sua-chave-openai-aqui"
```

### 3. Configurar MCP no Copilot

Edite o arquivo de configuração do Copilot:

**macOS**: `~/Library/Application Support/Code/User/globalStorage/github.copilot-chat/config.json`

Adicione o conteúdo de `mcp-config.json`:

```json
{
  "mcpServers": {
    "gitlab-issue-creator": {
      "command": "python3",
      "args": [
        "/Users/leonardoanschau/Documents/Pessoal/ai-mr-review/gitlab_issue_mcp_server.py"
      ],
      "env": {
        "GITLAB_TOKEN": "${GITLAB_TOKEN}",
        "OPENAI_API_KEY": "${OPENAI_API_KEY}",
        "GITLAB_API_URL": "http://gitlab.dimed.com.br/api/v4",
        "GITLAB_DEFAULT_GROUP": "grupopanvel/varejo/crm",
        "GITLAB_DEFAULT_ASSIGNEE": "lanschau"
      }
    }
  }
}
```

### 4. Reiniciar VS Code

Feche e abra o VS Code para carregar o novo MCP server.

## 📋 Uso via Copilot

### Criar issue simples

```
@workspace crie uma issue no projeto user-stories sobre:

Implementar autenticação OAuth2 no serviço de login
```

### Criar issue com título customizado

```
@workspace crie uma issue no projeto customer-service:

IMPORTANTE: O título deve começar com o prefixo "[TD] - "

hoje o método authenticate no authorization-service está fazendo a autenticacao passando dados sensíveis via queryParams. 

Devemos remover essa possibilidade e fazer via body usando x-www-form-urlencoded.
```

### Listar projetos disponíveis

```
@workspace liste os projetos GitLab disponíveis no CRM
```

### Gerar conteúdo sem criar issue

```
@workspace gere o conteúdo de uma issue sobre:

Migrar banco de dados PostgreSQL para versão 15
```

## 🛠️ Tools Disponíveis

### `list_gitlab_projects`

Lista todos os projetos do grupo CRM (incluindo subgrupos).

**Parâmetros**: Nenhum

**Retorno**: Lista de projetos com nome, path e ID

### `create_gitlab_issue`

Cria nova issue no GitLab com conteúdo gerado por IA.

**Parâmetros**:
- `project_name` (obrigatório): Nome do projeto (ex: "user-stories")
- `context` (obrigatório): Contexto que será usado pela IA
- `assignee` (opcional): Username do responsável (padrão: "lanschau")
- `labels` (opcional): Array de labels (padrão: ["Grupo Panvel :: Analyze", "User Story"])

**Retorno**: URL da issue criada + metadados

### `generate_issue_content`

Gera apenas título e descrição sem criar a issue.

**Parâmetros**:
- `context` (obrigatório): Contexto descrevendo a issue

**Retorno**: Título e descrição gerados pela IA

## 🔐 Configurações Padrão

As seguintes variáveis podem ser customizadas via environment variables:

- `GITLAB_API_URL`: URL da API GitLab (padrão: http://gitlab.dimed.com.br/api/v4)
- `GITLAB_DEFAULT_GROUP`: Grupo padrão (padrão: grupopanvel/varejo/crm)
- `GITLAB_DEFAULT_ASSIGNEE`: Assignee padrão (padrão: lanschau)

## 📦 Distribuição para Outros Usuários

Para compartilhar com outros desenvolvedores:

1. **Copiar arquivo**: `gitlab_issue_mcp_server.py`
2. **Instalar dependências**: `pip install requests`
3. **Configurar tokens**: GITLAB_TOKEN e OPENAI_API_KEY
4. **Adicionar ao MCP config**: Seguir seção de configuração acima

## 🧪 Testar MCP Server

Você pode testar o servidor manualmente enviando JSON via stdin:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | python3 gitlab_issue_mcp_server.py
```

## 📝 Exemplo de Issue Criada

**Contexto enviado:**
```
Implementar cache Redis para queries de produtos.
Atualmente estamos fazendo queries direto no banco a cada requisição.
```

**Resultado:**
```
📌 Título: Implementar cache Redis para queries de produtos

📄 Descrição:
## Contexto
Atualmente o sistema realiza queries diretas no banco de dados a cada requisição 
de produtos, gerando carga desnecessária no banco.

## Objetivo
Implementar camada de cache usando Redis para otimizar performance das queries 
de produtos.

## Tarefas
- [ ] Configurar Redis no ambiente
- [ ] Implementar cache layer
- [ ] Definir TTL apropriado
- [ ] Testar comportamento com cache hit/miss
- [ ] Monitorar impacto de performance
```

## 🚨 Troubleshooting

### Server não inicia no Copilot

1. Verifique logs do Copilot: `Output > GitHub Copilot`
2. Confirme que GITLAB_TOKEN e OPENAI_API_KEY estão configurados
3. Teste execução manual: `python3 gitlab_issue_mcp_server.py`

### Projeto não encontrado

1. Liste projetos: "liste os projetos GitLab"
2. Use nome exato ou partial match
3. Verifique permissões do token no GitLab

### IA não está gerando bom conteúdo

- Forneça mais contexto detalhado
- Seja específico sobre requisitos técnicos
- Use bullet points para organizar informações

## 📃 Licença

Uso interno Grupo Panvel.
