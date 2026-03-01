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
}

interface CreateIssueParams {
  title: string;
  description: string;
  assignee_ids: number[];
  labels: string[];
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
}
