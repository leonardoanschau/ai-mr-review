# Changelog

Todas as mudanças notáveis do projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Semantic Versioning](https://semver.org/lang/pt-BR/).

## [1.0.0] - 2026-02-26

### ✨ Adicionado
- Integração com GitLab via MCP Server
- Criação de issues no GitLab com templates pré-configurados
- Listagem de projetos do grupo CRM (recursivo)
- Template padrão para User Stories com 9 seções:
  - Objetivo
  - Contexto
  - Contratos de API (Request/Response)
  - Dependências
  - Tarefas
  - Impactos e Compatibilidade
  - Observações
  - Métricas de Sucesso
  - Critérios de Aceite
- Wizard de configuração na primeira execução
- Armazenamento seguro de tokens no VS Code Secret Storage
- Integração com GitHub Copilot para geração de conteúdo
- Output channel para logs do servidor MCP
- Status bar indicator quando servidor está ativo

### 🔐 Segurança
- Tokens GitLab armazenados de forma criptografada
- Nenhuma credencial exposta no código
- Variáveis sensíveis não versionadas

### 📚 Documentação
- README completo com instruções de instalação
- Guia de configuração do GitLab token
- Exemplos de uso com Copilot

### 🛠️ Comandos
- `Varejo CRM: Configurar GitLab` - Abre wizard de configuração
- `Varejo CRM: Criar Issue no GitLab` - Dicas de uso com Copilot
- `Varejo CRM: Listar Projetos GitLab` - Dicas de uso com Copilot
- `Varejo CRM: Mostrar Template de Issue` - Dicas de uso com Copilot
