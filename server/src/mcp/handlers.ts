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

interface CreateIssueArgs {
  project_name: string;
  title: string;
  description: string;
  assignee?: string;
  labels?: string[];
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

      // Get labels
      const labels = args.labels || IssueService.getDefaultLabels();

      // Create issue
      const issue = await this.issueService.createIssue({
        projectId: project.id,
        title: args.title,
        description: args.description,
        assigneeId: user.id,
        labels,
      });

      // Format result
      const result = this.issueService.formatIssueResult({
        issue,
        project,
        assigneeUsername: user.username,
        labels,
      });

      return this.createSuccessResult(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Error creating issue', { error: message });
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

  async handleToolCall(toolName: string, args: unknown): Promise<McpToolResult> {
    logger.info(`Handling tool call: ${toolName}`);

    switch (toolName) {
      case 'list_gitlab_projects':
        return await this.handleListProjects();

      case 'create_gitlab_issue':
        return await this.handleCreateIssue(args as CreateIssueArgs);

      case 'get_gitlab_issue_template':
        return this.handleGetTemplate();

      case 'review_gitlab_merge_request':
        return await this.handleReviewMergeRequest(args as ReviewMergeRequestArgs);

      case 'post_merge_request_comments':
        return await this.handlePostMergeRequestComments(args as PostMergeRequestCommentsArgs);

      default:
        return this.createErrorResult(`Unknown tool: ${toolName}`);
    }
  }
}
