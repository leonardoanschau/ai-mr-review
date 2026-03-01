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

  static getAllTools(): McpTool[] {
    return [this.listProjectsTool(), this.createIssueTool(), this.getTemplateTool()];
  }
}
