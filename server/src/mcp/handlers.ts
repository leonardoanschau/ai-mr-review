/**
 * MCP Tool Handlers
 * Implements the actual tool execution logic
 */

import { McpToolResult } from './protocol.js';
import { ProjectService } from '../gitlab/projects.js';
import { IssueService } from '../gitlab/issues.js';
import { GitLabApiClient } from '../gitlab/api.js';
import { IssueTemplate } from '../templates/issue-template.js';
import { ConfigManager } from '../utils/config.js';
import { logger } from '../utils/logger.js';

interface CreateIssueArgs {
  project_name: string;
  title: string;
  description: string;
  assignee?: string;
  labels?: string[];
}

export class McpToolHandlers {
  private projectService: ProjectService;
  private issueService: IssueService;

  constructor(private api: GitLabApiClient) {
    this.projectService = new ProjectService(api);
    this.issueService = new IssueService(api);
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

  async handleToolCall(toolName: string, args: unknown): Promise<McpToolResult> {
    logger.info(`Handling tool call: ${toolName}`);

    switch (toolName) {
      case 'list_gitlab_projects':
        return await this.handleListProjects();

      case 'create_gitlab_issue':
        return await this.handleCreateIssue(args as CreateIssueArgs);

      case 'get_gitlab_issue_template':
        return this.handleGetTemplate();

      default:
        return this.createErrorResult(`Unknown tool: ${toolName}`);
    }
  }
}
