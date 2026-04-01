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
        '⚠️ WORKFLOW: 1) Chamar list_gitlab_projects primeiro, 2) Usuário escolhe projeto, ' +
        '3) ANUNCIAR ao usuário: "Vou criar esta issue seguindo o Padrão PILGER 📐" e exibir como ficará (título, projeto, labels, descrição), 4) AGUARDAR confirmação explícita, 5) Criar issue. ' +
        '🚫 REJEITA prefixo [DEV]: se o título começar com [DEV], retorne erro e redirecione para create_dev_tasks_from_issue. ' +
        'Aceita APENAS [US] (User Story), [TD] (Technical Debt) ou [BUG]. ' +
        '📌 Padrão PILGER: issues [US] devem usar project_name="user-stories" ' +
        '(ex: http://gitlab.dimed.com.br/grupopanvel/varejo/crm/services/user-stories/-/issues/N). ' +
        'Se o usuário informar outro projeto para uma [US], a issue será criada, mas um aviso “Desvio do Padrão PILGER” será retornado. ' +        '🗓️ MILESTONE + EPIC: Para issues [US] e [TD], se milestone_id ou epic_id não forem fornecidos, a tool retornará as listas disponíveis para seleção ANTES de criar. ' +
        'Chame novamente com milestone_id e epic_id escolhidos (ou 0 para criar sem). ' +        'Exemplo input: {"project_name": "user-stories", "title": "[US] Implementar feature X", "description": "## Descrição\\n..." }. ' +
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
              'Labels a aplicar na issue. Padrão se omitido: ["Grupo Panvel :: Analyze"]. ' +
              '🚫 NÃO infira labels além das explicitamente fornecidas pelo usuário.',
          },
          milestone_id: {
            type: 'number',
            description:
              'ID numérico do milestone a associar à issue. ' +
              'Se omitido em issues [US] ou [TD], a tool listará os milestones disponíveis. ' +
              'Use 0 para criar sem milestone após ver a lista.',
          },
          epic_id: {
            type: 'number',
            description:
              'ID global (não iid) do epic a associar à issue. ' +
              'Se omitido em issues [US] ou [TD], a tool listará os epics disponíveis. ' +
              'Use 0 para criar sem epic após ver a lista.',
          },
          parent_issue_url: {
            type: 'string',
            description:
              'URL completa da issue pai para criar link "blocks". ' +
              'Ex: http://gitlab.dimed.com.br/grupopanvel/.../issues/10. Opcional.',
          },
        },
        required: ['project_name', 'title', 'description'],
      },
    };
  }

  static getIssueTool(): McpTool {
    return {
      name: 'get_gitlab_issue',
      description:
        '🔍 Busca informações completas de uma issue do GitLab sem fazer alterações. ' +
        '⚠️ SEMPRE chamar esta tool ANTES de update_gitlab_issue ou create_dev_tasks_from_issue para confirmar a issue correta. ' +
        'Retorna: iid, título, descrição, assignees, labels, status, URL, data criação/atualização. ' +
        'Exemplo uso: get_gitlab_issue({"issue_url": "http://gitlab.dimed.com.br/.../issues/42"}). ' +
        'Esta é uma operação SEGURA - apenas leitura, sem risco de alterações.',
      inputSchema: {
        type: 'object',
        properties: {
          issue_url: {
            type: 'string',
            description:
              'URL completa da issue (ex: http://gitlab.dimed.com.br/grupopanvel/.../issues/42). Recomendado - alternativa a project_name + issue_iid.',
          },
          project_name: {
            type: 'string',
            description:
              'Nome do projeto (ex: "customer-job"). USE SE não fornecer issue_url. Requer issue_iid junto.',
          },
          issue_iid: {
            type: 'number',
            description:
              'IID da issue (número #X). USE SE não fornecer issue_url. Requer project_name junto.',
          },
        },
        required: [],
      },
    };
  }

  static updateIssueTool(): McpTool {
    return {
      name: 'update_gitlab_issue',
      description:
        '⚠️⚠️⚠️ **OPERAÇÃO DESTRUTIVA** ⚠️⚠️⚠️\n\n' +
        '✏️ Atualiza issue existente no GitLab (título, descrição, assignee, labels, status). ' +
        '**ANTES DE EXECUTAR**: 1) Chamar get_gitlab_issue para ver dados atuais, ' +
        '2) MOSTRAR os dados ao usuário, 3) PERGUNTAR "Confirma atualizar a issue #X - [Título]? (sim/não)", ' +
        '4) AGUARDAR resposta explícita do usuário, 5) Se "sim" → executar, se "não" → cancelar. ' +
        'Permite edição parcial: apenas campos fornecidos são atualizados, demais mantêm valores originais. ' +
        'Exemplo: update_gitlab_issue({"issue_url": "http://gitlab.dimed.com.br/.../issues/42", "title": "[US] Novo título"}). ',
      inputSchema: {
        type: 'object',
        properties: {
          issue_url: {
            type: 'string',
            description:
              'URL completa da issue (ex: http://gitlab.dimed.com.br/grupopanvel/.../issues/42). Recomendado - alternativa a project_name + issue_iid.',
          },
          project_name: {
            type: 'string',
            description:
              'Nome do projeto (ex: "customer-job"). USE SE não fornecer issue_url. Requer issue_iid junto.',
          },
          issue_iid: {
            type: 'number',
            description:
              'IID da issue (número #X). USE SE não fornecer issue_url. Requer project_name junto.',
          },
          title: {
            type: 'string',
            description:
              'Novo título (opcional). Deve manter prefixo [US]/[TD]/[BUG]/[DEV] conforme tipo da issue.',
          },
          description: {
            type: 'string',
            description:
              'Nova descrição em Markdown (opcional). Substitui descrição completa.',
          },
          assignee: {
            type: 'string',
            description:
              'Username GitLab do novo assignee (opcional). Use username (ex: "joaom"), não nome completo.',
          },
          labels: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Array de strings com novas labels (opcional). Substitui labels existentes. Ex: ["Bug", "Alta prioridade"].',
          },
          state_event: {
            type: 'string',
            description:
              'Alterar status (opcional): "close" para fechar, "reopen" para reabrir.',
            enum: ['close', 'reopen'],
          },
          milestone_id: {
            type: 'number',
            description:
              'ID numérico do milestone para associar à issue (opcional). Use 0 para remover o milestone.',
          },
          parent_issue_url: {
            type: 'string',
            description:
              'URL da issue pai que esta issue passa a bloquear (opcional). Cria vínculo "blocks" entre as issues.',
          },
        },
        required: [],
      },
    };
  }

  static getIssueLinksTool(): McpTool {
    return {
      name: 'get_issue_links',
      description:
        '🔗 Lista todas as issues vinculadas a uma issue (relates_to, blocks, is_blocked_by). ' +
        'Use para descobrir quais tasks [DEV] estão bloqueando uma US, ou quais issues dependem de outra. ' +
        'Requer issue_url OU (project_name + issue_iid).',
      inputSchema: {
        type: 'object',
        properties: {
          issue_url: {
            type: 'string',
            description:
              'URL completa da issue (ex: http://gitlab.dimed.com.br/grupopanvel/.../issues/42). Recomendado.',
          },
          project_name: {
            type: 'string',
            description: 'Nome do projeto (ex: "user-stories"). USE SE não fornecer issue_url.',
          },
          issue_iid: {
            type: 'number',
            description: 'IID da issue (número #X). USE SE não fornecer issue_url.',
          },
        },
        required: [],
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
        '⚠️⚠️⚠️ **OPERAÇÃO DESTRUTIVA** ⚠️⚠️⚠️\n\n' +
        '**WORKFLOW em 2 etapas:**\n' +
        '**Etapa 1 — Preview** (sem task_title): ' +
        'Busca a US pelo parent_issue_url, analisa o conteúdo COMPLETO (não só a seção "## Tarefas"), ' +
        'retorna análise estruturada para o LLM sugerir tarefas. Nenhuma issue é criada. ' +
        'O LLM DEVE apresentar as sugestões ao usuário e PERGUNTAR em qual projeto criar cada uma (NUNCA inferir). ' +
        '**Etapa 2 — Criar** (com task_title + default_project): ' +
        'Cria exatamente 1 issue [DEV] com o título informado e linka com a US pai usando “blocks”. ' +
        'REPETIR a Etapa 2 para cada tarefa aprovada pelo usuário. ' +
        '🚫 default_project É OBRIGATÓRIO em Etapa 2 e NUNCA deve ser inferido pela IA — sempre pergunte ao usuário. ' +
        '🚫 NÃO crie múltiplas tarefas em uma única chamada — uma por vez, sempre. ' +
        'Exemplo Etapa 1: create_dev_tasks_from_issue({parent_issue_url: "http://gitlab.../issues/1038"}). ' +
        'Exemplo Etapa 2: create_dev_tasks_from_issue({parent_issue_url: "http://gitlab.../issues/1038", default_project: "customer-service", task_title: "Implementar endpoint X"}).',
      inputSchema: {
        type: 'object',
        properties: {
          parent_issue_url: {
            type: 'string',
            description:
              'URL completa da issue pai (US/TD/BUG). Ex: http://gitlab.dimed.com.br/grupopanvel/.../issues/1038. OBRIGATÓRIO.',
          },
          default_project: {
            type: 'string',
            description:
              '⚠️ Nome do projeto onde a issue [DEV] será criada. ' +
              'Obrigatório na Etapa 2 (quando task_title é fornecido). Ignorado na Etapa 1 (preview). ' +
              'NUNCA inferir — sempre perguntar ao usuário. Use list_gitlab_projects() para ver opções.',
          },
          auto_suggest: {
            type: 'boolean',
            description:
              'Se true, sugere tarefas automaticamente quando não há checkboxes explícitos na descrição. Se false, retorna erro se não encontrar tarefas. Padrão: true.',
          },
          assignee: {
            type: 'string',
            description:
              'Username GitLab para assignee das issues [DEV] criadas. Se omitido, usa assignee padrão configurado.',
          },
          task_title: {
            type: 'string',
            description:
              'Título EXATO da tarefa a criar nesta chamada (case-insensitive). ' +
              'Use para criar UMA tarefa por vez. ' +
              'Se omitido, cria TODAS as tarefas encontradas — evite isso, prefira informar task_title.',
          },
          labels: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Labels a aplicar nas issues [DEV]. Padrão se omitido: ["Grupo Panvel :: Analyze"]. ' +
              '🚫 NÃO infira labels além das explicitamente fornecidas pelo usuário.',
          },
        },
        required: ['parent_issue_url'],
      },
    };
  }

  static getEpicsTool(): McpTool {
    return {
      name: 'get_gitlab_epics',
      description:
        '🏷️ Lista os epics abertos de um grupo GitLab. ' +
        'Use ANTES de create_gitlab_issue para obter o epic_id correto a associar à issue. ' +
        'Por padrão busca no grupo raiz do defaultGroup (ex: "grupopanvel"). ' +
        'Aceita busca por nome via parâmetro search.',
      inputSchema: {
        type: 'object',
        properties: {
          group_path: {
            type: 'string',
            description:
              'Caminho do grupo GitLab (ex: "grupopanvel"). Se omitido, usa o grupo raiz do defaultGroup.',
          },
          search: {
            type: 'string',
            description: 'Filtro de busca por nome do epic (ex: "Prime"). Opcional.',
          },
        },
        required: [],
      },
    };
  }

  static getAllTools(): McpTool[] {
    return [
      this.listProjectsTool(),
      this.createIssueTool(),
      this.getIssueTool(),
      this.updateIssueTool(),
      this.getIssueLinksTool(),
      this.getTemplateTool(),
      this.reviewMergeRequestTool(),
      this.postMergeRequestCommentsTool(),
      this.createDevTasksTool(),
      this.getEpicsTool(),
    ];
  }
}
