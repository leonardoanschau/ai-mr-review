/**
 * MCP Tool Handlers
 * Implements the actual tool execution logic
 */

import { McpToolResult } from './protocol.js';
import { ProjectService } from '../gitlab/projects.js';
import { IssueService } from '../gitlab/issues.js';
import { MergeRequestService } from '../gitlab/merge-requests.js';
import { GitLabApiClient } from '../gitlab/api.js';
import { IssueTemplate } from '../templates/issue-template.js';
import { CodeReviewChecklist } from '../templates/code-review-checklist.js';
import { ConfigManager } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import { BusinessContextExtractor } from '../utils/business-context.js';
import { parseTasksFromDescription, analyzeIssueForTaskSuggestion } from '../utils/task-parser.js';

interface CreateIssueArgs {
  project_name: string;
  title: string;
  description: string;
  assignee?: string;
  labels?: string[];
  milestone_id?: number;
  epic_id?: number;
  parent_issue_url?: string;
}

interface GetIssueArgs {
  issue_url?: string;
  project_name?: string;
  issue_iid?: number;
}

interface UpdateIssueArgs {
  issue_url?: string;
  project_name?: string;
  issue_iid?: number;
  title?: string;
  description?: string;
  assignee?: string;
  labels?: string[];
  state_event?: 'close' | 'reopen';
  milestone_id?: number;
  parent_issue_url?: string;
}

interface ReviewMergeRequestArgs {
  mr_url?: string;
  project_id?: number;
  mr_iid?: number;
  review_focus?: 'security' | 'performance' | 'best_practices' | 'bugs' | 'all';
}

interface PostMergeRequestCommentsArgs {
  mr_url?: string;
  project_id?: number;
  mr_iid?: number;
  comments: Array<{
    file_path: string;
    new_line: number;
    body: string;
  }>;
}

interface CreateDevTasksArgs {
  parent_issue_url: string;
  default_project?: string;  // required in create mode (when task_title is set), ignored in preview mode
  task_title?: string;
  auto_suggest?: boolean;
  assignee?: string;
  labels?: string[];
}

interface GetIssueLinksArgs {
  issue_url?: string;
  project_name?: string;
  issue_iid?: number;
}

interface GetEpicsArgs {
  group_path?: string; // opcional; usa o grupo pai do defaultGroup se omitido
  search?: string;
}

export class McpToolHandlers {
  private projectService: ProjectService;
  private issueService: IssueService;
  private mrService: MergeRequestService;
  private businessContext: BusinessContextExtractor;

  constructor(private api: GitLabApiClient) {
    this.projectService = new ProjectService(api);
    this.issueService = new IssueService(api);
    this.mrService = new MergeRequestService(api);
    this.businessContext = new BusinessContextExtractor(api);
  }

  private createSuccessResult(text: string): McpToolResult {
    return {
      content: [{ type: 'text', text }],
      isError: false,
    };
  }

  private createErrorResult(message: string): McpToolResult {
    return {
      content: [{ type: 'text', text: `❌ Erro: ${message}` }],
      isError: true,
    };
  }

  async handleListProjects(): Promise<McpToolResult> {
    try {
      const config = ConfigManager.getConfig();
      const groupName = config.defaultGroup;

      if (!groupName) {
        return this.createErrorResult(
          'GITLAB_DEFAULT_GROUP não configurado nas variáveis de ambiente'
        );
      }

      const projects = await this.projectService.listProjects(groupName);

      const projectsList = projects
        .map((project, index) =>
          this.projectService.formatProjectInfo(project, index + 1)
        )
        .join('\n');

      const result = `📋 **Projetos no grupo "${groupName}"** (${projects.length} encontrados):\n\n${projectsList}`;

      return this.createSuccessResult(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Error listing projects', { error: message });
      return this.createErrorResult(message);
    }
  }

  async handleCreateIssue(args: CreateIssueArgs): Promise<McpToolResult> {
    try {
      // Reject [DEV] prefix — redirect to create_dev_tasks_from_issue
      if (/^\[DEV\]/i.test(args.title.trim())) {
        return this.createErrorResult(
          'Issues com prefixo [DEV] não podem ser criadas por esta tool. ' +
          'Use create_dev_tasks_from_issue para criar tarefas [DEV] derivadas de uma US/TD/BUG.'
        );
      }

      const config = ConfigManager.getConfig();
      const groupPath = config.defaultGroup;

      if (!groupPath) {
        return this.createErrorResult(
          'GITLAB_DEFAULT_GROUP não configurado nas variáveis de ambiente'
        );
      }

      // Find project
      const project = await this.projectService.findProjectByName(
        args.project_name,
        groupPath
      );

      // Get assignee
      const assigneeUsername = args.assignee || config.defaultAssignee;
      if (!assigneeUsername) {
        return this.createErrorResult(
          'Assignee não especificado e GITLAB_DEFAULT_ASSIGNEE não configurado'
        );
      }

      const user = await this.api.getUserByUsername(assigneeUsername);

      // ── LABELS: base + tipo automático (nunca inferidos além desses) ──────
      const labels = args.labels ? [...args.labels] : IssueService.getDefaultLabels();
      if (/^\[US\]/i.test(args.title.trim())) {
        labels.push('User Story');
      } else if (/^\[TD\]/i.test(args.title.trim())) {
        labels.push('Technical Debit');
      }
      // [BUG] → sem label adicional

      // ── MILESTONE PRE-CHECK ──────────────────────────────────────────────
      // Para [US] e [TD], se milestone_id não foi fornecido, listar opções.
      // milestone_id === 0 significa "criar sem milestone" (skip explícito).
      const isUsOrTd = /^\[(US|TD)\]/i.test(args.title.trim());
      if (isUsOrTd && args.milestone_id === undefined) {
        let milestones: import('../gitlab/api.js').GitLabMilestone[] = [];
        try {
          milestones = await this.api.listGroupMilestones(groupPath);
        } catch {
          try {
            milestones = await this.api.listProjectMilestones(project.id);
          } catch {
            milestones = [];
          }
        }

        if (milestones.length > 0) {
          const list = milestones
            .map((m, i) => `${i + 1}. **ID ${m.id}** — ${m.title}${m.due_date ? ` (até ${m.due_date})` : ''}`)
            .join('\n');

          const result =
            `🗓️ **Seleção de Milestone**\n\n` +
            `Selecione o milestone para a issue **${args.title}**:\n\n` +
            `${list}\n\n` +
            `**0** — Criar sem milestone\n\n` +
            `---\n\n` +
            `Chame novamente \`create_gitlab_issue\` com \`milestone_id\` preenchido (ou \`0\` para nenhum).\n` +
            `> ℹ️ Para associar um Epic, use a tool \`get_gitlab_epics\` para listar os disponíveis e informe \`epic_id\`.`;

          return this.createSuccessResult(result);
        }
        // Se não houver milestones disponíveis, prosseguir sem milestone
      }

      // ── MILESTONE + EPIC IDS ──────────────────────────────────────────────────
      const milestoneId = (args.milestone_id && args.milestone_id > 0) ? args.milestone_id : undefined;
      const epicId = (args.epic_id && args.epic_id > 0) ? args.epic_id : undefined;

      // Create issue
      const issue = await this.issueService.createIssue({
        projectId: project.id,
        title: args.title,
        description: args.description,
        assigneeId: user.id,
        labels,
        milestoneId,
        epicId,
      });

      // ── PARENT LINK ───────────────────────────────────────────────────────
      if (args.parent_issue_url) {
        try {
          const { project: parentProject, issue: parentIssue } = await this.api.getIssueByUrl(args.parent_issue_url);
          await this.api.createIssueLink(
            project.id,
            issue.iid,
            parentProject.id,
            parentIssue.iid,
            'blocks'
          );
        } catch (linkError) {
          logger.error('Failed to create parent issue link', { error: linkError });
        }
      }

      // Format result
      let result = this.issueService.formatIssueResult({
        issue,
        project,
        assigneeUsername: user.username,
        labels,
      });

      if (milestoneId) {
        result += `\n**Milestone ID:** ${milestoneId}`;
      }

      // Padrão PILGER: aviso suave se [US] não for criada no projeto correto
      if (/^\[US\]/i.test(args.title.trim()) && args.project_name !== IssueService.PILGER_US_PROJECT) {
        result += `\n\n---\n\n⚠️ **Aviso — Desvio do Padrão PILGER**\n` +
          `Issues \`[US]\` devem ser criadas no projeto \`${IssueService.PILGER_US_PROJECT}\`. ` +
          `Esta issue foi criada em \`${args.project_name}\`.\n` +
          `Se este não era o projeto correto, mova a issue manualmente no GitLab.`;
      }

      return this.createSuccessResult(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Error creating issue', { error: message });
      return this.createErrorResult(message);
    }
  }

  async handleGetIssue(args: GetIssueArgs): Promise<McpToolResult> {
    try {
      const config = ConfigManager.getConfig();
      const groupPath = config.defaultGroup;

      if (!groupPath) {
        return this.createErrorResult(
          'GITLAB_DEFAULT_GROUP não configurado nas variáveis de ambiente'
        );
      }

      let issue: any;
      let project: any;

      // Parse URL if provided, otherwise use project_name + issue_iid
      if (args.issue_url) {
        const result = await this.api.getIssueByUrl(args.issue_url);
        issue = result.issue;
        project = result.project;
      } else if (args.project_name && args.issue_iid) {
        project = await this.projectService.findProjectByName(
          args.project_name,
          groupPath
        );
        issue = await this.api.getIssue(project.id, args.issue_iid);
      } else {
        return this.createErrorResult(
          'Forneça issue_url OU (project_name + issue_iid)'
        );
      }

      // Format assignees
      const assignees = issue.assignees?.map((a: any) => a.username).join(', ') || 'Nenhum';

      // Format dates
      const createdAt = new Date(issue.created_at).toLocaleString('pt-BR');
      const updatedAt = new Date(issue.updated_at).toLocaleString('pt-BR');

      // Format milestone and epic (if present)
      const milestoneInfo = issue.milestone
        ? `\n**Milestone:** ${issue.milestone.title} (id: ${issue.milestone.id}) — ${issue.milestone.web_url}`
        : '';
      const epicUrl = issue.epic?.url ?? issue.epic?.web_url;
      const epicInfo = issue.epic
        ? `\n**Parent/Epic:** ${issue.epic.title} (iid: ${issue.epic.iid}) — ${epicUrl ?? 'sem URL'}`
        : '';

      // Format result
      const result = `📋 **Issue Encontrada**

**IID:** #${issue.iid}
**Título:** ${issue.title}
**Status:** ${issue.state}
**Projeto:** ${project.path_with_namespace}
**Labels:** ${issue.labels?.join(', ') || 'Nenhuma'}
**Assignees:** ${assignees}
**Criada em:** ${createdAt}
**Atualizada em:** ${updatedAt}${milestoneInfo}${epicInfo}
**URL:** ${issue.web_url}

---

**Descrição:**

${issue.description || '*Sem descrição*'}`;

      return this.createSuccessResult(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Error getting issue', { error: message });
      return this.createErrorResult(message);
    }
  }

  async handleUpdateIssue(args: UpdateIssueArgs): Promise<McpToolResult> {
    try {
      const config = ConfigManager.getConfig();
      const groupPath = config.defaultGroup;

      if (!groupPath) {
        return this.createErrorResult(
          'GITLAB_DEFAULT_GROUP não configurado nas variáveis de ambiente'
        );
      }

      let projectId: number;
      let issueIid: number;
      let currentIssue: any;

      // Parse URL if provided, otherwise use project_name + issue_iid
      if (args.issue_url) {
        const { project, issue } = await this.api.getIssueByUrl(args.issue_url);
        projectId = project.id;
        issueIid = issue.iid;
        currentIssue = issue;
      } else if (args.project_name && args.issue_iid) {
        const project = await this.projectService.findProjectByName(
          args.project_name,
          groupPath
        );
        projectId = project.id;
        issueIid = args.issue_iid;
        currentIssue = await this.api.getIssue(projectId, issueIid);
      } else {
        return this.createErrorResult(
          'Forneça issue_url OU (project_name + issue_iid)'
        );
      }

      // Show confirmation with issue info
      logger.info(`[CONFIRMAÇÃO] Atualizando Issue #${currentIssue.iid} - ${currentIssue.title}`);

      // Build update params (only include fields that were provided)
      const updateParams: any = {};

      if (args.title !== undefined) {
        updateParams.title = args.title;
      }

      if (args.description !== undefined) {
        updateParams.description = args.description;
      }

      if (args.assignee !== undefined) {
        const user = await this.api.getUserByUsername(args.assignee);
        updateParams.assignee_ids = [user.id];
      }

      if (args.labels !== undefined) {
        updateParams.labels = args.labels.join(',');
      }

      if (args.state_event !== undefined) {
        updateParams.state_event = args.state_event;
      }

      if (args.milestone_id !== undefined) {
        // 0 = remove milestone (GitLab API accepts null to clear)
        updateParams.milestone_id = args.milestone_id === 0 ? null : args.milestone_id;
      }

      // Check if at least one field is being updated
      if (Object.keys(updateParams).length === 0 && !args.parent_issue_url) {
        return this.createErrorResult(
          'Nenhum campo para atualizar. Forneça pelo menos: title, description, assignee, labels, state_event, milestone_id ou parent_issue_url.'
        );
      }

      // Update issue (skip API call if only parent link is being set)
      let updatedIssue = currentIssue;
      if (Object.keys(updateParams).length > 0) {
        updatedIssue = await this.api.updateIssue(projectId, issueIid, updateParams);
      }

      // Set parent link
      if (args.parent_issue_url) {
        const { project: parentProject, issue: parentIssue } = await this.api.getIssueByUrl(args.parent_issue_url);
        await this.api.createIssueLink(
          projectId,
          issueIid,
          parentProject.id,
          parentIssue.iid,
          'blocks'
        );
      }

      // Format result
      const result = `📋 **[CONFIRMAÇÃO] Issue identificada:**
**#${currentIssue.iid}** - ${currentIssue.title}
**URL:** ${currentIssue.web_url}

---

✅ **Issue Atualizada com Sucesso**

**IID:** #${updatedIssue.iid}
**Título:** ${updatedIssue.title}
**Status:** ${updatedIssue.state}
**Labels:** ${updatedIssue.labels?.join(', ') || 'Nenhuma'}
**URL:** ${updatedIssue.web_url}

**Campos atualizados:** ${[
        ...Object.keys(updateParams),
        ...(args.parent_issue_url ? ['parent_issue_url'] : []),
      ].join(', ')}`;

      return this.createSuccessResult(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Error updating issue', { error: message });
      return this.createErrorResult(message);
    }
  }

  async handleGetIssueLinks(args: GetIssueLinksArgs): Promise<McpToolResult> {
    try {
      const config = ConfigManager.getConfig();
      const groupPath = config.defaultGroup;

      if (!groupPath) {
        return this.createErrorResult(
          'GITLAB_DEFAULT_GROUP não configurado nas variáveis de ambiente'
        );
      }

      let projectId: number;
      let issueIid: number;
      let issueTitle: string;
      let issueUrl: string;

      if (args.issue_url) {
        const { project, issue } = await this.api.getIssueByUrl(args.issue_url);
        projectId = project.id;
        issueIid = issue.iid;
        issueTitle = issue.title;
        issueUrl = issue.web_url;
      } else if (args.project_name && args.issue_iid) {
        const project = await this.projectService.findProjectByName(
          args.project_name,
          groupPath
        );
        projectId = project.id;
        issueIid = args.issue_iid;
        issueTitle = `#${issueIid}`;
        issueUrl = '';
        const issue = await this.api.getIssue(projectId, issueIid);
        issueTitle = issue.title;
        issueUrl = issue.web_url;
      } else {
        return this.createErrorResult(
          'Forneça issue_url OU (project_name + issue_iid)'
        );
      }

      const links = await this.api.getIssueLinks(projectId, issueIid);

      if (links.length === 0) {
        return this.createSuccessResult(
          `🔗 **Issue #${issueIid} — ${issueTitle}**\n\nNenhuma issue vinculada.`
        );
      }

      const linkTypeLabel: Record<string, string> = {
        relates_to: '🔄 Relacionada',
        blocks: '🚧 Bloqueia',
        is_blocked_by: '⏳ Bloqueada por',
      };

      const linksList = links
        .map(l => {
          const typeLabel = linkTypeLabel[l.link_type] ?? l.link_type;
          const stateIcon = l.state === 'closed' ? '✅' : '🟡';
          return `${stateIcon} **[#${l.iid}] ${l.title}**\n   ${typeLabel} | ${l.state} | ${l.web_url}`;
        })
        .join('\n\n');

      const result = `🔗 **Issues Vinculadas a #${issueIid} — ${issueTitle}**\n**URL:** ${issueUrl}\n\n---\n\n${linksList}\n\n**Total:** ${links.length} vínculo(s)`;

      return this.createSuccessResult(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Error getting issue links', { error: message });
      return this.createErrorResult(message);
    }
  }

  handleGetTemplate(): McpToolResult {
    try {
      const template = IssueTemplate.getFullTemplate();
      const result = `📝 **Template Padrão de Issue:**\n\n${template}`;
      return this.createSuccessResult(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Error getting template', { error: message });
      return this.createErrorResult(message);
    }
  }

  async handleReviewMergeRequest(args: ReviewMergeRequestArgs): Promise<McpToolResult> {
    try {
      let projectId: number;
      let mrIid: number;

      // Parse URL se fornecido
      if (args.mr_url) {
        const parsed = await this.mrService.parseMergeRequestUrl(args.mr_url);
        if (!parsed) {
          return this.createErrorResult(
            'URL do MR inválida. Use formato: http://gitlab.com/grupo/projeto/-/merge_requests/123'
          );
        }
        projectId = parsed.projectId;
        mrIid = parsed.mrIid;
      } else if (args.project_id && args.mr_iid) {
        projectId = args.project_id;
        mrIid = args.mr_iid;
      } else {
        return this.createErrorResult(
          'Forneça mr_url OU (project_id + mr_iid)'
        );
      }

      // Busca o MR e as mudanças
      const mr = await this.mrService.getMergeRequest(projectId, mrIid);
      const changes = await this.mrService.getMergeRequestChanges(projectId, mrIid);

      // 🎯 NOVO: Extrai contexto de negócio (issue + User Story)
      logger.info(`Extracting business context for MR !${mrIid}`);
      const businessContext = await this.businessContext.extractContext(projectId, mrIid);
      const contextFormatted = this.businessContext.formatContext(businessContext);

      // Gera o checklist baseado no foco
      const focusCategory = CodeReviewChecklist.mapFocusToCategory(args.review_focus);
      const checklist = CodeReviewChecklist.generateChecklistPrompt(focusCategory || args.review_focus);

      // Formata as mudanças para a IA analisar (agora busca arquivo completo)
      const changesFormatted = await this.mrService.formatChangesForReview(projectId, changes);

      // Retorna: contexto de negócio + checklist + mudanças
      let result = '';
      
      // Adiciona contexto de negócio no início se disponível
      if (businessContext.hasContext) {
        result += contextFormatted;
      }
      
      result += `${checklist}\n\n${'='.repeat(80)}\n\n${changesFormatted}\n\n⚙️ **Próximo passo:**\nA IA está analisando o código seguindo o checklist acima.\n\n`;
      
      if (businessContext.hasContext) {
        result += `📋 **Contexto de negócio:** Disponível (Tarefa #${businessContext.task?.id}`;
        if (businessContext.userStory) {
          result += ` + US #${businessContext.userStory.id}`;
        }
        result += ')\n';
      } else {
        result += `📋 **Contexto de negócio:** Não encontrado\n`;
      }
      
      result += `💡 **Foco da revisão:** ${args.review_focus || 'all'}\n`;
      result += `👤 **Autor:** ${mr.author.name}\n`;
      result += `🔗 **URL:** ${mr.web_url}`;

      return this.createSuccessResult(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Error reviewing merge request', { error: message });
      return this.createErrorResult(message);
    }
  }

  async handlePostMergeRequestComments(args: PostMergeRequestCommentsArgs): Promise<McpToolResult> {
    try {
      let projectId: number;
      let mrIid: number;

      // Parse URL se fornecido
      if (args.mr_url) {
        const parsed = await this.mrService.parseMergeRequestUrl(args.mr_url);
        if (!parsed) {
          return this.createErrorResult(
            'URL do MR inválida. Use formato: http://gitlab.com/grupo/projeto/-/merge_requests/123'
          );
        }
        projectId = parsed.projectId;
        mrIid = parsed.mrIid;
      } else if (args.project_id && args.mr_iid) {
        projectId = args.project_id;
        mrIid = args.mr_iid;
      } else {
        return this.createErrorResult(
          'Forneça mr_url OU (project_id + mr_iid)'
        );
      }

      // Valida que há comentários para postar
      if (!args.comments || args.comments.length === 0) {
        return this.createErrorResult('Nenhum comentário fornecido. Forneça pelo menos 1 comentário.');
      }

      logger.info(`Postando ${args.comments.length} comentários no MR !${mrIid} do projeto ${projectId}`);

      // Busca o MR para obter os diff_refs (necessário para postar comentários em linhas)
      const mrChanges = await this.mrService.getMergeRequestChanges(projectId, mrIid);

      if (!mrChanges.diff_refs) {
        return this.createErrorResult(
          'MR não possui diff_refs. Não é possível postar comentários em linhas específicas.'
        );
      }

      // Posta cada comentário
      const results: Array<{ success: boolean; file: string; line: number; error?: string }> = [];

      for (const comment of args.comments) {
        try {
          await this.mrService.createLineComment(
            projectId,
            mrIid,
            mrChanges,
            {
              filePath: comment.file_path,
              line: comment.new_line,
              comment: comment.body,
            }
          );

          results.push({
            success: true,
            file: comment.file_path,
            line: comment.new_line,
          });

          logger.info(`✅ Comentário postado: ${comment.file_path}:${comment.new_line}`);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          results.push({
            success: false,
            file: comment.file_path,
            line: comment.new_line,
            error: errorMsg,
          });

          logger.error(`❌ Erro ao postar comentário: ${comment.file_path}:${comment.new_line}`, { error: errorMsg });
        }
      }

      // Gera resumo
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      let resultText = `✅ **${successful} de ${args.comments.length} comentários postados com sucesso!**\n\n`;

      if (successful > 0) {
        resultText += `📝 **Comentários postados:**\n`;
        results
          .filter(r => r.success)
          .forEach(r => {
            resultText += `- ✅ ${r.file}:${r.line}\n`;
          });
        resultText += '\n';
      }

      if (failed > 0) {
        resultText += `❌ **Falhas (${failed}):**\n`;
        results
          .filter(r => !r.success)
          .forEach(r => {
            resultText += `- ❌ ${r.file}:${r.line} - ${r.error}\n`;
          });
      }

      resultText += `\n🔗 Veja os comentários em: ${mrChanges.web_url}`;

      return this.createSuccessResult(resultText);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Error posting merge request comments', { error: message });
      return this.createErrorResult(message);
    }
  }

  async handleCreateDevTasks(args: CreateDevTasksArgs): Promise<McpToolResult> {
    try {
      const config = ConfigManager.getConfig();

      // 1. Buscar issue pai
      logger.info(`Fetching parent issue: ${args.parent_issue_url}`);
      const { project: parentProject, issue: parentIssue } = await this.api.getIssueByUrl(
        args.parent_issue_url
      );

      logger.info(`Issue Pai: #${parentIssue.iid} - ${parentIssue.title}`);

      // ── PREVIEW MODE ──────────────────────────────────────────────────────
      // task_title não fornecido → analisa US completa, retorna contexto para
      // o LLM sugerir tarefas. Nenhuma issue é criada.
      if (!args.task_title) {
        logger.info('Preview mode: analyzing issue for task suggestion');
        const analysis = analyzeIssueForTaskSuggestion(
          parentIssue.description || '',
          parentIssue.title
        );

        const milestoneInfo = parentIssue.milestone
          ? `\n**Milestone:** ${parentIssue.milestone.title} (id: ${parentIssue.milestone.id})`
          : '';
        const epicInfo = parentIssue.epic
          ? `\n**Epic:** ${parentIssue.epic.title} (id: ${parentIssue.epic.id})`
          : '';
        const inheritNote = (parentIssue.milestone || parentIssue.epic)
          ? `\n\n> ℹ️ Milestone${parentIssue.epic ? ' e Epic' : ''} serão herdados automaticamente nas tasks DEV criadas.`
          : '';

        const previewResult =
          `📋 **Issue Pai:** #${parentIssue.iid} — ${parentIssue.title}\n` +
          `🔗 ${parentIssue.web_url}` +
          milestoneInfo +
          epicInfo +
          inheritNote +
          `\n\n---\n\n` +
          analysis;

        return this.createSuccessResult(previewResult);
      }

      // ── CREATE MODE ───────────────────────────────────────────────────────
      // default_project é obrigatório em create mode
      if (!args.default_project) {
        return this.createErrorResult(
          'default_project é obrigatório quando task_title é fornecido. ' +
          'Informe o nome do projeto onde a issue [DEV] deve ser criada.'
        );
      }

      // Resolve a tarefa: tenta encontrar em checkboxes da descrição; se não
      // encontrar, aceita o task_title diretamente (sugestão do LLM via preview)
      const allParsedTasks = parseTasksFromDescription(parentIssue.description || '');
      const targetTitle = args.task_title.trim().toLowerCase();
      const matchedTask = allParsedTasks.find(t => t.title.trim().toLowerCase() === targetTitle);
      const taskToCreate = matchedTask ?? {
        title: args.task_title.trim(),
        description: `Tarefa derivada da issue pai.\n\n**Descrição:** ${args.task_title.trim()}`,
        index: 0,
      };

      logger.info(`Creating [DEV] task: ${taskToCreate.title}`);

      // Resolve projeto (obrigatório — nunca inferido)
      const targetProject = await this.projectService.findProjectByName(
        args.default_project,
        config.defaultGroup
      );

      // Resolve assignee
      const assigneeUsername = args.assignee || config.defaultAssignee;
      if (!assigneeUsername) {
        return this.createErrorResult(
          'Assignee não especificado e GITLAB_DEFAULT_ASSIGNEE não configurado'
        );
      }
      const user = await this.api.getUserByUsername(assigneeUsername);

      // Labels: usa o que o usuário forneceu ou o padrão compartilhado — nunca infere
      const labels = args.labels || IssueService.getDefaultLabels();

      // Criar issue [DEV] — strip [DEV] prefix from task_title if provided to avoid duplication
      // Inherit milestone and epic from parent US automatically
      const cleanTitle = taskToCreate.title.replace(/^\[DEV\]\s*/i, '').trim();
      const devIssue = await this.issueService.createIssue({
        projectId: targetProject.id,
        title: `[DEV] ${cleanTitle}`,
        description:
          `**Issue Pai:** ${parentIssue.title} (#${parentIssue.iid})\n` +
          `**URL:** ${parentIssue.web_url}\n\n---\n\n${taskToCreate.description}`,
        assigneeId: user.id,
        labels,
        milestoneId: parentIssue.milestone?.id,
        epicId: parentIssue.epic?.id,
      });

      // Criar link: [DEV] blocks [US] — a US aparece como "blocked by" as DEVs
      await this.api.createIssueLink(
        targetProject.id,
        devIssue.iid,
        parentProject.id,
        parentIssue.iid,
        'blocks'
      );

      logger.info(`Created [DEV] issue #${devIssue.iid} for task: ${cleanTitle}`);

      const milestoneCreatedInfo = parentIssue.milestone ? `\n**Milestone:** ${parentIssue.milestone.title}` : '';
      const epicCreatedInfo = parentIssue.epic ? `\n**Epic:** ${parentIssue.epic.title}` : '';

      const resultText =
        `📋 **Issue Pai:** #${parentIssue.iid} — ${parentIssue.title}\n` +
        `🔗 ${parentIssue.web_url}\n\n` +
        `---\n\n` +
        `✅ **Issue [DEV] criada com sucesso!**\n\n` +
        `**Título:** [DEV] ${cleanTitle}\n` +
        `**Issue:** #${devIssue.iid}\n` +
        `**Projeto:** ${targetProject.name}\n` +
        `**URL:** ${devIssue.web_url}\n` +
        `**Labels:** ${labels.join(', ')}` +
        milestoneCreatedInfo +
        epicCreatedInfo +
        `\n**Linked:** [DEV] #${devIssue.iid} blocks [US] #${parentIssue.iid}`;

      return this.createSuccessResult(resultText);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Error creating dev tasks', { error: message });
      return this.createErrorResult(message);
    }
  }

  async handleToolCall(toolName: string, args: unknown): Promise<McpToolResult> {
    logger.info(`Handling tool call: ${toolName}`);

    switch (toolName) {
      case 'list_gitlab_projects':
        return await this.handleListProjects();

      case 'create_gitlab_issue':
        return await this.handleCreateIssue(args as CreateIssueArgs);

      case 'get_gitlab_issue':
        return await this.handleGetIssue(args as GetIssueArgs);

      case 'update_gitlab_issue':
        return await this.handleUpdateIssue(args as UpdateIssueArgs);

      case 'get_gitlab_issue_template':
        return this.handleGetTemplate();

      case 'review_gitlab_merge_request':
        return await this.handleReviewMergeRequest(args as ReviewMergeRequestArgs);

      case 'post_merge_request_comments':
        return await this.handlePostMergeRequestComments(args as PostMergeRequestCommentsArgs);

      case 'create_dev_tasks_from_issue':
        return await this.handleCreateDevTasks(args as CreateDevTasksArgs);

      case 'get_issue_links':
        return await this.handleGetIssueLinks(args as GetIssueLinksArgs);

      case 'get_gitlab_epics':
        return await this.handleGetEpics(args as GetEpicsArgs);

      default:
        return this.createErrorResult(`Unknown tool: ${toolName}`);
    }
  }

  async handleGetEpics(args: GetEpicsArgs): Promise<McpToolResult> {
    try {
      const config = ConfigManager.getConfig();
      // Epics vivem no grupo raiz (ex: 'grupopanvel'), não no subgrupo
      const defaultGroupRoot = config.defaultGroup.split('/')[0];
      const groupPath = args.group_path || defaultGroupRoot;

      const epics = await this.api.listGroupEpics(groupPath, args.search);

      if (epics.length === 0) {
        return this.createSuccessResult(
          `🏷️ Nenhum epic aberto encontrado no grupo **${groupPath}**${args.search ? ` (busca: "${args.search}")` : ''}.`
        );
      }

      const list = epics
        .map((e, i) => `${i + 1}. **ID ${e.id}** (iid: ${e.iid}) — ${e.title}`)
        .join('\n');

      const result =
        `🏷️ **Epics abertos em \`${groupPath}\`**${args.search ? ` (busca: "${args.search}")` : ''} (${epics.length} encontrados):\n\n` +
        `${list}\n\n` +
        `---\n\n` +
        `> Use o **ID** (coluna \`id\`) como valor de \`epic_id\` ao chamar \`create_gitlab_issue\`.`;

      return this.createSuccessResult(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Error fetching epics', { error: message });
      return this.createErrorResult(message);
    }
  }
}
