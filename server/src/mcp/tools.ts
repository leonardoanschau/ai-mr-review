/**
 * MCP Tools Definitions
 * Defines available tools for Model Context Protocol
 */

import { McpTool } from './protocol.js';

export class McpToolsDefinition {
  static listProjectsTool(): McpTool {
    return {
      name: 'list_gitlab_projects',
      description:
        '📋 Lista todos os projetos GitLab do grupo CRM (incluindo subgrupos recursivamente). ' +
        '⚠️ OBRIGATÓRIO: Chamar ANTES de create_gitlab_issue para usuário escolher o projeto. ' +
        'Retorna: Array com {id, name, path_with_namespace} de cada projeto. ' +
        'Exemplo output: [{"id": 1234, "name": "customer-job", "path_with_namespace": "grupopanvel/varejo/crm/services/customer/customer-job"}]',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    };
  }

  static createIssueTool(): McpTool {
    return {
      name: 'create_gitlab_issue',
      description:
        '✍️ Cria issue no GitLab. ' +
        '⚠️ WORKFLOW: 1) Chamar list_gitlab_projects primeiro, 2) Usuário escolhe projeto, 3) Criar issue. ' +
        'Título DEVE ter prefixo [US], [TD] ou [BUG]. ' +
        'Exemplo input: {"project_name": "customer-job", "title": "[US] Implementar feature X", "description": "## Descrição\\n..." }. ' +
        'Retorna: {"iid": 42, "web_url": "http://gitlab.dimed.com.br/.../issues/42"}',
      inputSchema: {
        type: 'object',
        properties: {
          project_name: {
            type: 'string',
            description:
              "Nome EXATO do projeto da lista (ex: 'customer-job', 'shelf-price-check-bff'). Case-sensitive.",
          },
          title: {
            type: 'string',
            description:
              'Título COM prefixo obrigatório: [US] para User Story, [TD] para Technical Debt, [BUG] para Bug. Ex: "[US] Implementar endpoint de consulta"',
          },
          description: {
            type: 'string',
            description:
              'Descrição em Markdown seguindo template (use get_gitlab_issue_template para ver formato). Deve incluir seções: Descrição, Critérios de Aceite, DoD.',
          },
          assignee: {
            type: 'string',
            description:
              'Username GitLab (não nome completo). Ex: "joaom", não "Joao Guilherme". Opcional.',
          },
          labels: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Array de strings. Padrão se omitido: ["Grupo Panvel :: Analyze", "User Story"]. Ex: ["Bug", "Alta prioridade"]',
          },
        },
        required: ['project_name', 'title', 'description'],
      },
    };
  }

  static getTemplateTool(): McpTool {
    return {
      name: 'get_gitlab_issue_template',
      description:
        '📝 Retorna template padrão de issues em Markdown. ' +
        'Inclui seções: Descrição, Critérios de Aceite, DoD (Definition of Done), Observações. ' +
        'Use ANTES de create_gitlab_issue para mostrar formato esperado ao usuário. ' +
        'Sem parâmetros de entrada. Output: String Markdown pronta para customizar.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    };
  }

  static reviewMergeRequestTool(): McpTool {
    return {
      name: 'review_gitlab_merge_request',
      description:
        '🔍 Analisa Merge Request retornando arquivo texto (10-50KB) com: ' +
        '1) Metadados (título, autor, branch), ' +
        '2) Checklist completo (19 regras), ' +
        '3) Arquivos alterados com APENAS linhas ADICIONADAS (+). ' +
        '⚠️ IMPORTANTE: Linhas marcadas com 💬 são "comentáveis" (aceitas por post_merge_request_comments). ' +
        '⚠️ NÃO posta comentários - apenas retorna análise. ' +
        'Exemplo input: {"mr_url": "http://gitlab.dimed.com.br/.../merge_requests/3", "review_focus": "all"}',
      inputSchema: {
        type: 'object',
        properties: {
          mr_url: {
            type: 'string',
            description:
              'URL completa do MR (ex: http://gitlab.dimed.com.br/grupopanvel/varejo/crm/services/customer/customer-job/-/merge_requests/3). Recomendado.',
          },
          project_id: {
            type: 'number',
            description:
              'ID numérico do projeto GitLab. Use SE não fornecer mr_url. Alternativa ao mr_url.',
          },
          mr_iid: {
            type: 'number',
            description:
              'IID (número !X) do MR no projeto. Use SE não fornecer mr_url. Requer project_id junto.',
          },
          review_focus: {
            type: 'string',
            description:
              'Filtro opcional: "security" (só segurança), "performance" (só performance), "best_practices" (boas práticas), "bugs" (bugs), "all" (todas as 19 regras). Padrão: "all".',
            enum: ['security', 'performance', 'best_practices', 'bugs', 'all'],
          },
        },
        required: [],
      },
    };
  }

  static postMergeRequestCommentsTool(): McpTool {
    return {
      name: 'post_merge_request_comments',
      description:
        '💬 Posta comentários inline em linhas específicas de um MR. ' +
        'Use DEPOIS de review_gitlab_merge_request. ' +
        '⚠️ LIMITAÇÃO CRÍTICA: Apenas linhas com 💬 (linhas ADICIONADAS no diff) aceitam comentários. Linhas de contexto retornam erro "Linha X não está no diff". ' +
        'new_line = número da linha no arquivo NOVO (depois das mudanças). ' +
        'Retorna: {success_count, failed_count, detalhes}. ' +
        'Exemplo input: {"mr_url": "...", "comments": [{"file_path": "src/Service.java", "new_line": 42, "body": "🔴 **CRITICAL**\\n\\nProblema..."}]}',
      inputSchema: {
        type: 'object',
        properties: {
          mr_url: {
            type: 'string',
            description:
              'URL completa do MR (ex: http://gitlab.dimed.com.br/grupopanvel/.../merge_requests/3). Recomendado.',
          },
          project_id: {
            type: 'number',
            description:
              'ID numérico do projeto GitLab. Use SE não fornecer mr_url.',
          },
          mr_iid: {
            type: 'number',
            description:
              'IID (número !X) do MR. Use SE não fornecer mr_url. Requer project_id.',
          },
          comments: {
            type: 'array',
            description:
              'Array de comentários. Cada item: {file_path, new_line, body, severity?}. ⚠️ new_line DEVE ser linha ADICIONADA (com 💬 no review).',
            items: {
              type: 'object',
              properties: {
                file_path: {
                  type: 'string',
                  description:
                    'Caminho COMPLETO do arquivo (ex: implementation/src/main/java/br/com/dimed/Service.java). Must match exatamente o path do diff.',
                },
                new_line: {
                  type: 'number',
                  description:
                    'Número da linha no arquivo NOVO (após as mudanças). DEVE ser linha ADICIONADA (+) no diff. Ex: 19, 42, 80. Não usar old_line.',
                },
                body: {
                  type: 'string',
                  description:
                    'Texto Markdown. Formato recomendado: "🔴 **CRITICAL**\\n\\n**Problema**: ...\\n\\n**Solução**: ...\\n\\n```suggestion\\ncódigo corrigido\\n```". Use emojis: 🔴 CRITICAL | 🟠 HIGH | 🟡 MEDIUM | ⚪ LOW.',
                },
                severity: {
                  type: 'string',
                  description:
                    'Opcional. "CRITICAL", "HIGH", "MEDIUM", ou "LOW". Apenas para metadados, não afeta GitLab.',
                },
              },
              required: ['file_path', 'new_line', 'body'],
            },
          },
        },
        required: ['comments'],
      },
    };
  }

  static createDevTasksTool(): McpTool {
    return {
      name: 'create_dev_tasks_from_issue',
      description:
        '🔨 Cria automaticamente issues [DEV] derivadas de uma US/TD/BUG. ' +
        'Extrai tarefas da seção "## ✅ Tarefas" ou sugere decomposição baseada no conteúdo. ' +
        'Para cada tarefa, permite escolher o projeto alvo e cria issue [DEV] vinculada à issue pai via "relates_to". ' +
        'Exemplo uso: Após criar US #1038, executar create_dev_tasks_from_issue({parent_issue_url: "http://gitlab.../issues/1038", auto_suggest: true}). ' +
        'Workflow: 1) Parser tarefas, 2) Para cada tarefa: listar projetos e perguntar qual, 3) Criar issues [DEV] linkadas.',
      inputSchema: {
        type: 'object',
        properties: {
          parent_issue_url: {
            type: 'string',
            description:
              'URL completa da issue pai (US/TD/BUG). Ex: http://gitlab.dimed.com.br/grupopanvel/.../issues/1038. OBRIGATÓRIO.',
          },
          auto_suggest: {
            type: 'boolean',
            description:
              'Se true, sugere tarefas automaticamente quando não há checkboxes explícitos na descrição. Se false, retorna erro se não encontrar tarefas. Padrão: true.',
          },
          default_project: {
            type: 'string',
            description:
              'Nome do projeto padrão para todas as tarefas (opcional). Se omitido, pergunta para cada tarefa individualmente. Ex: "customer-service".',
          },
          assignee: {
            type: 'string',
            description:
              'Username GitLab para assignee das issues [DEV] criadas. Se omitido, usa assignee padrão configurado.',
          },
        },
        required: ['parent_issue_url'],
      },
    };
  }

  static getAllTools(): McpTool[] {
    return [
      this.listProjectsTool(),
      this.createIssueTool(),
      this.getTemplateTool(),
      this.reviewMergeRequestTool(),
      this.postMergeRequestCommentsTool(),
      this.createDevTasksTool(),
    ];
  }
}
