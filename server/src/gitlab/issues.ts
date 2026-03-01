/**
 * Issue Service
 * Business logic for GitLab issue creation
 */

import { GitLabApiClient, GitLabIssue, GitLabProject } from './api.js';
import { logger } from '../utils/logger.js';

export interface CreateIssueOptions {
  projectId: number;
  title: string;
  description: string;
  assigneeId: number;
  labels: string[];
}

export interface IssueCreatedResult {
  issue: GitLabIssue;
  project: GitLabProject;
  assigneeUsername: string;
  labels: string[];
}

export class IssueService {
  private static readonly DEFAULT_LABELS = ['Grupo Panvel :: Analyze', 'User Story'];

  constructor(private api: GitLabApiClient) {}

  async createIssue(options: CreateIssueOptions): Promise<GitLabIssue> {
    logger.info(`Creating issue: ${options.title}`);

    const issue = await this.api.createIssue(options.projectId, {
      title: options.title,
      description: options.description,
      assignee_ids: [options.assigneeId],
      labels: options.labels,
    });

    return issue;
  }

  formatIssueResult(result: IssueCreatedResult): string {
    const lines = [
      '✅ **Issue criada com sucesso!**\n',
      `**Projeto:** ${result.project.name}`,
      `**Título:** ${result.issue.title}`,
      `**Issue #:** ${result.issue.iid}`,
      `**URL:** ${result.issue.web_url}`,
      `**Assignee:** ${result.assigneeUsername}`,
      `**Labels:** ${result.labels.join(', ')}`,
    ];

    return lines.join('\n');
  }

  static getDefaultLabels(): string[] {
    return [...IssueService.DEFAULT_LABELS];
  }
}
