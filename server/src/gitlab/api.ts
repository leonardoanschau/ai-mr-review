/**
 * GitLab API Client
 * HTTP client for GitLab REST API operations
 */

import fetch, { Response } from 'node-fetch';
import { logger } from '../utils/logger.js';

export class GitLabApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: unknown
  ) {
    super(message);
    this.name = 'GitLabApiError';
  }
}

export interface GitLabProject {
  id: number;
  name: string;
  path: string;
  path_with_namespace: string;
  description: string;
  web_url: string;
}

export interface GitLabUser {
  id: number;
  username: string;
  name: string;
}

export interface GitLabIssue {
  id: number;
  iid: number;
  title: string;
  description: string;
  web_url: string;
  state: string;
  labels?: string[];
  references?: {
    short: string;
    relative: string;
    full: string;
  };
}

export interface GitLabMergeRequest {
  id: number;
  iid: number;
  title: string;
  description: string;
  web_url: string;
  state: string;
  source_branch: string;
  target_branch: string;
  author: GitLabUser;
}

export interface GitLabMergeRequestChange {
  old_path: string;
  new_path: string;
  diff: string;
  new_file: boolean;
  renamed_file: boolean;
  deleted_file: boolean;
}

export interface GitLabMergeRequestChanges extends GitLabMergeRequest {
  changes: GitLabMergeRequestChange[];
  diff_refs?: {
    base_sha: string;
    start_sha: string;
    head_sha: string;
  };
}

export interface CreateMergeRequestNoteParams {
  body: string;
  position?: {
    base_sha: string;
    start_sha: string;
    head_sha: string;
    position_type: 'text';
    old_path?: string;
    new_path: string;
    old_line?: number;
    new_line: number;
  };
}

export interface GitLabRepositoryFile {
  file_name: string;
  file_path: string;
  size: number;
  encoding: string;
  content: string;
  content_sha256: string;
  ref: string;
  blob_id: string;
  commit_id: string;
  last_commit_id: string;
}

interface CreateIssueParams {
  title: string;
  description: string;
  assignee_ids: number[];
  labels: string[];
  issue_links?: {
    target_project_id: number;
    target_issue_iid: number;
    link_type: 'relates_to' | 'blocks' | 'is_blocked_by';
  }[];
}

interface UpdateIssueParams {
  title?: string;
  description?: string;
  assignee_ids?: number[];
  labels?: string[];
  state_event?: 'close' | 'reopen';
}

export class GitLabApiClient {
  private static readonly REQUEST_TIMEOUT = 30000;
  private static readonly MAX_PROJECTS_PER_PAGE = 100;

  constructor(
    private apiUrl: string,
    private token: string
  ) {}

  private async makeRequest<T>(
    endpoint: string,
    options: {
      method?: string;
      params?: Record<string, string>;
      body?: unknown;
    } = {}
  ): Promise<T> {
    const { method = 'GET', params, body } = options;

    // Build URL with query params
    const url = new URL(`${this.apiUrl}${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }

    logger.debug(`${method} ${url.toString()}`);

    try {
      const response = await fetch(url.toString(), {
        method,
        headers: {
          'PRIVATE-TOKEN': this.token,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(GitLabApiClient.REQUEST_TIMEOUT),
      });

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof GitLabApiError) {
        throw error;
      }
      throw new GitLabApiError(
        `GitLab API request failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async handleErrorResponse(response: Response): Promise<never> {
    let errorMessage = `GitLab API error: ${response.status} ${response.statusText}`;
    
    try {
      const errorData = await response.json();
      if (errorData && typeof errorData === 'object' && 'message' in errorData) {
        errorMessage = `GitLab API error: ${errorData.message}`;
      }
    } catch {
      // Ignore JSON parse errors
    }

    throw new GitLabApiError(errorMessage, response.status);
  }

  async getUserByUsername(username: string): Promise<GitLabUser> {
    logger.info(`Fetching user: ${username}`);
    
    const users = await this.makeRequest<GitLabUser[]>('/users', {
      params: { username },
    });

    if (!users || users.length === 0) {
      throw new GitLabApiError(`User not found: ${username}`);
    }

    const user = users[0];
    logger.info(`Found user: ${user.username} (ID: ${user.id})`);
    return user;
  }

  async getProjectByPath(projectPath: string): Promise<GitLabProject> {
    logger.info(`Fetching project by path: ${projectPath}`);
    
    // URL encode o path do projeto
    const encodedPath = encodeURIComponent(projectPath);
    
    const project = await this.makeRequest<GitLabProject>(`/projects/${encodedPath}`);
    
    logger.info(`Found project: ${project.name} (ID: ${project.id})`);
    return project;
  }

  async getGroupProjects(groupPath: string): Promise<GitLabProject[]> {
    logger.info(`Fetching projects from group: ${groupPath}`);
    
    const encodedGroup = encodeURIComponent(groupPath);
    const projects = await this.makeRequest<GitLabProject[]>(
      `/groups/${encodedGroup}/projects`,
      {
        params: {
          per_page: String(GitLabApiClient.MAX_PROJECTS_PER_PAGE),
          include_subgroups: 'true',
        },
      }
    );

    if (!projects || projects.length === 0) {
      throw new GitLabApiError(`No projects found in group: ${groupPath}`);
    }

    // Sort by path
    const sortedProjects = projects.sort((a, b) =>
      a.path_with_namespace.localeCompare(b.path_with_namespace)
    );

    logger.info(`Found ${sortedProjects.length} projects in group '${groupPath}'`);
    return sortedProjects;
  }

  async createIssue(
    projectId: number,
    params: CreateIssueParams
  ): Promise<GitLabIssue> {
    logger.info(`Creating issue in project ${projectId}: ${params.title}`);
    
    const issue = await this.makeRequest<GitLabIssue>(
      `/projects/${projectId}/issues`,
      {
        method: 'POST',
        body: params,
      }
    );

    logger.info(`Issue created: #${issue.iid} - ${issue.web_url}`);
    return issue;
  }

  /**
   * Update an existing issue
   */
  async updateIssue(
    projectId: number,
    issueIid: number,
    params: UpdateIssueParams
  ): Promise<GitLabIssue> {
    logger.info(`Updating issue #${issueIid} in project ${projectId}`);
    
    const issue = await this.makeRequest<GitLabIssue>(
      `/projects/${projectId}/issues/${issueIid}`,
      {
        method: 'PUT',
        body: params,
      }
    );

    logger.info(`Issue updated: #${issue.iid} - ${issue.title}`);
    return issue;
  }

  /**
   * Parse issue URL and return project ID and issue IID
   * Example URL: http://gitlab.dimed.com.br/grupopanvel/varejo/crm/services/user-stories/-/issues/1038
   */
  parseIssueUrl(url: string): { projectPath: string; issueIid: number } {
    const regex = /^https?:\/\/[^\/]+\/(.+?)\/-\/issues\/(\d+)$/;
    const match = url.match(regex);
    
    if (!match) {
      throw new GitLabApiError(`Invalid issue URL format: ${url}`);
    }

    return {
      projectPath: match[1],
      issueIid: parseInt(match[2], 10),
    };
  }

  /**
   * Get issue by URL
   */
  async getIssueByUrl(url: string): Promise<{ project: GitLabProject; issue: GitLabIssue }> {
    logger.info(`Fetching issue from URL: ${url}`);
    
    const { projectPath, issueIid } = this.parseIssueUrl(url);
    const project = await this.getProjectByPath(projectPath);
    const issue = await this.getIssue(project.id, issueIid);

    return { project, issue };
  }

  /**
   * Create issue link (relates_to, blocks, is_blocked_by)
   */
  async createIssueLink(
    projectId: number,
    issueIid: number,
    targetProjectId: number,
    targetIssueIid: number,
    linkType: 'relates_to' | 'blocks' | 'is_blocked_by' = 'relates_to'
  ): Promise<void> {
    logger.info(`Creating ${linkType} link from #${issueIid} to project ${targetProjectId} issue #${targetIssueIid}`);
    
    await this.makeRequest(
      `/projects/${projectId}/issues/${issueIid}/links`,
      {
        method: 'POST',
        body: {
          target_project_id: targetProjectId,
          target_issue_iid: targetIssueIid,
          link_type: linkType,
        },
      }
    );

    logger.info(`Issue link created successfully`);
  }

  async getMergeRequest(
    projectId: number,
    mrIid: number
  ): Promise<GitLabMergeRequest> {
    logger.info(`Fetching MR !${mrIid} from project ${projectId}`);
    
    const mr = await this.makeRequest<GitLabMergeRequest>(
      `/projects/${projectId}/merge_requests/${mrIid}`
    );

    logger.info(`Found MR: !${mr.iid} - ${mr.title}`);
    return mr;
  }

  async getMergeRequestChanges(
    projectId: number,
    mrIid: number
  ): Promise<GitLabMergeRequestChanges> {
    logger.info(`Fetching changes for MR !${mrIid} from project ${projectId}`);
    
    const changes = await this.makeRequest<GitLabMergeRequestChanges>(
      `/projects/${projectId}/merge_requests/${mrIid}/changes`
    );

    logger.info(`Found ${changes.changes.length} changed files in MR !${mrIid}`);
    return changes;
  }

  async createMergeRequestNote(
    projectId: number,
    mrIid: number,
    params: CreateMergeRequestNoteParams
  ): Promise<void> {
    logger.info(`Creating note on MR !${mrIid} in project ${projectId}`);
    
    await this.makeRequest(
      `/projects/${projectId}/merge_requests/${mrIid}/discussions`,
      {
        method: 'POST',
        body: params,
      }
    );

    logger.info(`Note created on MR !${mrIid}`);
  }

  /**
   * Busca issues que serão fechadas pelo MR
   * GitLab detecta automaticamente issues referenciadas com "Closes #123" ou "Fixes #123"
   */
  async getMergeRequestClosesIssues(
    projectId: number,
    mrIid: number
  ): Promise<GitLabIssue[]> {
    logger.info(`Fetching issues closed by MR !${mrIid} in project ${projectId}`);
    
    try {
      const issues = await this.makeRequest<GitLabIssue[]>(
        `/projects/${projectId}/merge_requests/${mrIid}/closes_issues`
      );

      logger.info(`Found ${issues.length} issues to be closed by MR !${mrIid}`);
      return issues;
    } catch (error) {
      logger.error(`Failed to fetch closes_issues for MR !${mrIid}`, { error });
      return [];
    }
  }

  /**
   * Busca uma issue específica por IID
   */
  async getIssue(
    projectId: number,
    issueIid: number
  ): Promise<GitLabIssue> {
    logger.info(`Fetching issue #${issueIid} from project ${projectId}`);
    
    const issue = await this.makeRequest<GitLabIssue>(
      `/projects/${projectId}/issues/${issueIid}`
    );

    logger.info(`Found issue: #${issue.iid} - ${issue.title}`);
    return issue;
  }

  /**
   * Busca conteúdo completo de um arquivo do repositório
   * @param projectId ID do projeto
   * @param filePath Caminho do arquivo no repositório
   * @param ref Branch, tag ou commit SHA (default: branch principal)
   */
  async getRepositoryFile(
    projectId: number,
    filePath: string,
    ref: string
  ): Promise<GitLabRepositoryFile> {
    logger.info(`Fetching file: ${filePath} from ref ${ref} in project ${projectId}`);
    
    // URL encode o caminho do arquivo
    const encodedPath = encodeURIComponent(filePath);
    
    const file = await this.makeRequest<GitLabRepositoryFile>(
      `/projects/${projectId}/repository/files/${encodedPath}`,
      {
        params: { ref },
      }
    );

    logger.info(`Fetched file: ${file.file_name} (${file.size} bytes, encoding: ${file.encoding})`);
    return file;
  }

  /**
   * Decodifica o conteúdo do arquivo retornado pela API
   * GitLab retorna content em base64 por padrão
   */
  decodeFileContent(file: GitLabRepositoryFile): string {
    if (file.encoding === 'base64') {
      return Buffer.from(file.content, 'base64').toString('utf-8');
    }
    return file.content;
  }
}
