# 🚀 Varejo CRM MCP for VS Code

**Versão 1.0.0** | MIT License

Ferramentas de produtividade para o time Varejo CRM do Grupo Panvel. Crie issues no GitLab de forma inteligente usando GitHub Copilot!

## ✨ Funcionalidades

- 🎯 **Criação de Issues GitLab** - Use linguagem natural com Copilot
- 📋 **Templates Completos** - User Stories, Bugs e Débito Técnico
- 🔍 **Busca de Projetos** - Lista todos os projetos do grupo CRM recursivamente
- 📡 **Contratos de API** - Templates incluem seções de Request/Response
- 🤖 **Integração com Copilot** - IA gera conteúdo automaticamente
- 🔐 **Seguro** - Tokens armazenados de forma criptografada

## 🎬 Começando

### 1️⃣ Instalação

**Opção A: VS Code Marketplace** (em breve)
```
Extensions → Buscar "Varejo CRM MCP" → Install
```

**Opção B: VSIX Manual**
```bash
# Baixe o .vsix do GitLab Releases
code --install-extension varejo-crm-mcp-1.0.0.vsix
```

### 2️⃣ Configuração (Primeira Vez)

Após instalar, a extensão abrirá um wizard automaticamente. Configure:

1. **GitLab URL**: `http://gitlab.dimed.com.br/api/v4`
2. **GitLab Token**: Seu personal access token ([como obter](#-obter-gitlab-token))
3. **Grupo Padrão**: `grupopanvel/varejo/crm`
4. **Assignee Padrão**: Seu username GitLab

✅ **Pronto!** A extensão está configurada e o servidor MCP rodando.

### 3️⃣ Uso com GitHub Copilot

Abra o **Copilot Chat** (`Ctrl+Shift+I`) e use linguagem natural:

```
@workspace crie uma US no projeto Acompanhamento sobre implementar cache Redis
```

```
@workspace liste os projetos GitLab do CRM
```

```
@workspace mostre o template de issues do GitLab
```

**A IA vai:**
1. Listar os projetos disponíveis
2. Você escolhe qual projeto
3. IA gera título e descrição completos
4. Cria a issue automaticamente

## 📋 Template de Issues

Todas as issues criadas seguem nosso template padrão com 9 seções:

- 🎯 **Objetivo** - O que será feito e para quê
- 📌 **Contexto** - Situação atual e necessidade
- 📡 **Contratos de API** - Request/Response (se aplicável)
- 🔗 **Dependências** - Serviços, bibliotecas, pré-requisitos
- ✅ **Tarefas** - Checklist técnico
- ⚡ **Impactos e Compatibilidade** - Breaking changes, migrações
- ⚠️ **Observações** - Riscos e pontos de atenção
- 📊 **Métricas de Sucesso** - SLAs, monitoramento
- ✔️ **Critérios de Aceite** - Como validar

> **Nota:** A IA avalia o contexto e inclui apenas seções relevantes. Nem toda US precisa de todas as seções.

## 🔐 Obter GitLab Token

1. Acesse: http://gitlab.dimed.com.br/-/user_settings/personal_access_tokens
2. Clique em **"Add new token"**
3. Configure:
   - **Name**: `VS Code MCP`
   - **Scopes**: Marque `api`, `read_user`, `write_repository`
   - **Expiration**: 1 ano (recomendado)
4. Clique em **"Create personal access token"**
5. **Copie o token** (só aparece uma vez!)
6. Cole no wizard da extensão

## ⚙️ Configuração Manual

Se precisar reconfigurar:

**Command Palette** (`Cmd+Shift+P` / `Ctrl+Shift+P`):
```
Varejo CRM: Configurar GitLab
```

**Ou edite manualmente:**
```json
// settings.json
{
  "varejocrm.gitlab.url": "http://gitlab.dimed.com.br/api/v4",
  "varejocrm.gitlab.defaultGroup": "grupopanvel/varejo/crm",
  "varejocrm.gitlab.defaultAssignee": "seu-username"
}
```

Token via Command Palette: `Varejo CRM: Configurar GitLab`

## 🛠️ Comandos Disponíveis

| Comando | Descrição |
|---------|-----------|
| `Varejo CRM: Configurar GitLab` | Abre wizard de configuração |
| `Varejo CRM: Criar Issue no GitLab` | Dicas de uso com Copilot |
| `Varejo CRM: Listar Projetos GitLab` | Dicas de busca de projetos |
| `Varejo CRM: Mostrar Template de Issue` | Exibe template completo |

## 🐛 Troubleshooting

### ❌ Server não inicia

1. Verifique o **Output Channel**: `View → Output → Varejo CRM MCP Server`
2. Confirme que Python está instalado: `python3 --version`
3. Reconfigure: `Varejo CRM: Configurar GitLab`

### ❌ Copilot não reconhece as tools

1. Reinicie o VS Code
2. Verifique se o servidor está rodando (status bar: ✅ CRM MCP)
3. Verifique os logs no Output Channel

### ❌ Projeto não encontrado

Use o comando exato da lista:
```
@workspace liste os projetos GitLab
```

Copie o nome exato do projeto da lista retornada.

## 📦 Build Manual (Desenvolvedores)

```bash
# Clone o repositório
git clone https://gitlab.dimed.com.br/grupopanvel/varejo/crm/varejo-crm-mcp
cd varejo-crm-mcp

# Instale dependências
npm install
pip install -r requirements.txt

# Compile TypeScript
npm run compile

# Gere o .vsix
npm run package

# Instale localmente
code --install-extension varejo-crm-mcp-1.0.0.vsix
```

## 📝 Changelog

Veja CHANGELOG.md para histórico de versões.

## 🤝 Contribuindo

Este projeto é mantido pelo time Varejo CRM.

## 📄 Licença

MIT License

## 👥 Time

Desenvolvido com ❤️ pelo time **Varejo CRM** do Grupo Panvel.
