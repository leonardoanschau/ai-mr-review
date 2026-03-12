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
        '⚠️ OBRIGATÓRIO CHAMAR PRIMEIRO ⚠️ Lista todos os projetos GitLab do grupo CRM (incluindo subgrupos recursivamente). SEMPRE use esta tool ANTES de criar uma issue para o usuário escolher o projeto correto.',
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
        "Cria uma nova issue no GitLab com título e descrição fornecidos. ⚠️ IMPORTANTE: NUNCA use esta tool sem antes chamar 'list_gitlab_projects' e pedir para o usuário escolher o projeto. O GitHub Copilot deve gerar o título e descrição antes de chamar esta tool.",
      inputSchema: {
        type: 'object',
        properties: {
          project_name: {
            type: 'string',
            description:
              "Nome EXATO do projeto escolhido pelo usuário da lista (ex: 'Acompanhamento', 'Atividades'). OBRIGATÓRIO.",
          },
          title: {
            type: 'string',
            description:
              'Título completo da issue incluindo prefixo [US], [TD] ou [BUG] se aplicável. OBRIGATÓRIO.',
          },
          description: {
            type: 'string',
            description:
              'Descrição completa da issue em Markdown seguindo o template padrão. OBRIGATÓRIO.',
          },
          assignee: {
            type: 'string',
            description:
              'Username do responsável (opcional, usa assignee padrão configurado se omitido)',
          },
          labels: {
            type: 'array',
            items: { type: 'string' },
            description:
              "Labels da issue (opcional, padrão: ['Grupo Panvel :: Analyze', 'User Story'])",
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
        'Retorna o template padrão completo para issues do GitLab. Use para orientar a criação de descrições. O Copilot deve preencher o template com o contexto fornecido pelo usuário.',
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
        'Analisa um Merge Request do GitLab retornando APENAS as linhas ADICIONADAS (com +) e checklist de code review. A IA deve focar SOMENTE no código NOVO, ignorando código removido ou de contexto. Esta tool NÃO posta comentários - apenas retorna a análise. Use post_merge_request_comments para postar os comentários.',
      inputSchema: {
        type: 'object',
        properties: {
          mr_url: {
            type: 'string',
            description:
              'URL completa do Merge Request (ex: http://gitlab.com/grupo/projeto/-/merge_requests/123)',
          },
          project_id: {
            type: 'number',
            description:
              'ID do projeto GitLab (use se não fornecer mr_url)',
          },
          mr_iid: {
            type: 'number',
            description:
              'IID (número) do Merge Request no projeto (use se não fornecer mr_url)',
          },
          review_focus: {
            type: 'string',
            description:
              'Foco da revisão: "security" (segurança), "performance" (performance), "best_practices" (boas práticas), "bugs" (bugs potenciais), ou "all" (tudo). Padrão: "all"',
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
        'Posta comentários de code review em linhas específicas de um Merge Request do GitLab. Use após analisar o MR com review_gitlab_merge_request. Cada comentário será postado na linha exata do arquivo especificado.',
      inputSchema: {
        type: 'object',
        properties: {
          mr_url: {
            type: 'string',
            description:
              'URL completa do Merge Request (ex: http://gitlab.com/grupo/projeto/-/merge_requests/123)',
          },
          project_id: {
            type: 'number',
            description:
              'ID do projeto GitLab (use se não fornecer mr_url)',
          },
          mr_iid: {
            type: 'number',
            description:
              'IID (número) do Merge Request no projeto (use se não fornecer mr_url)',
          },
          comments: {
            type: 'array',
            description:
              'Lista de comentários a serem postados. Cada comentário deve conter: file_path, new_line, e body (texto do comentário)',
            items: {
              type: 'object',
              properties: {
                file_path: {
                  type: 'string',
                  description:
                    'Caminho completo do arquivo (ex: src/main/java/com/example/Service.java)',
                },
                new_line: {
                  type: 'number',
                  description:
                    'Número da linha no arquivo NOVO/modificado onde o comentário será postado',
                },
                body: {
                  type: 'string',
                  description:
                    'Texto do comentário em Markdown. Use formato:\n\n**⚠️ Problema**: Descrição do problema encontrado\n\n**✅ Solução**: Sugestão de como corrigir\n\n**Severidade**: CRITICAL/HIGH/MEDIUM/LOW',
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

  static getAllTools(): McpTool[] {
    return [
      this.listProjectsTool(),
      this.createIssueTool(),
      this.getTemplateTool(),
      this.reviewMergeRequestTool(),
      this.postMergeRequestCommentsTool(),
    ];
  }
}
