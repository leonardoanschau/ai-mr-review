/**
 * Project Service
 * Business logic for GitLab project operations
 */

import { GitLabApiClient, GitLabProject } from './api.js';
import { logger } from '../utils/logger.js';

export class ProjectNotFoundError extends Error {
  constructor(
    message: string,
    public availableProjects: GitLabProject[]
  ) {
    super(message);
    this.name = 'ProjectNotFoundError';
  }
}

export class ProjectService {
  private static readonly MAX_MATCHES_TO_DISPLAY = 5;
  private static readonly MAX_PROJECTS_TO_DISPLAY = 10;

  constructor(private api: GitLabApiClient) {}

  private findExactMatch(
    projectName: string,
    projects: GitLabProject[]
  ): GitLabProject | null {
    const lowerName = projectName.toLowerCase();
    return (
      projects.find(
        (p) =>
          p.name.toLowerCase() === lowerName ||
          p.path.toLowerCase() === lowerName
      ) || null
    );
  }

  private findPartialMatches(
    projectName: string,
    projects: GitLabProject[]
  ): GitLabProject[] {
    const lowerName = projectName.toLowerCase();
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(lowerName) ||
        p.path.toLowerCase().includes(lowerName)
    );
  }

  private formatProjectList(projects: GitLabProject[], limit: number): string {
    return projects
      .slice(0, limit)
      .map((p) => p.name)
      .join(', ');
  }

  async findProjectByName(
    projectName: string,
    groupPath: string
  ): Promise<GitLabProject> {
    logger.info(`Searching for project: ${projectName}`);

    const projects = await this.api.getGroupProjects(groupPath);

    // Try exact match first
    const exactMatch = this.findExactMatch(projectName, projects);
    if (exactMatch) {
      logger.info(`Exact match found: ${exactMatch.name} (ID: ${exactMatch.id})`);
      return exactMatch;
    }

    // Try partial matches
    const partialMatches = this.findPartialMatches(projectName, projects);

    if (partialMatches.length === 1) {
      logger.info(`Single partial match found: ${partialMatches[0].name}`);
      return partialMatches[0];
    }

    if (partialMatches.length > 1) {
      const matchList = this.formatProjectList(
        partialMatches,
        ProjectService.MAX_MATCHES_TO_DISPLAY
      );
      throw new ProjectNotFoundError(
        `Multiple projects match '${projectName}': ${matchList}`,
        partialMatches
      );
    }

    // No matches
    const availableList = this.formatProjectList(
      projects,
      ProjectService.MAX_PROJECTS_TO_DISPLAY
    );
    throw new ProjectNotFoundError(
      `Project '${projectName}' not found. Available: ${availableList}`,
      projects
    );
  }

  async listProjects(groupPath: string): Promise<GitLabProject[]> {
    return await this.api.getGroupProjects(groupPath);
  }

  formatProjectInfo(project: GitLabProject, index: number): string {
    const description =
      project.description && project.description.length > 100
        ? project.description.substring(0, 100) + '...'
        : project.description || '(sem descrição)';

    return `${index}. **${project.name}**\n   Path: ${project.path_with_namespace}\n   Descrição: ${description}\n`;
  }
}
