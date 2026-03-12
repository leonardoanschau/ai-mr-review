/**
 * Business Context Extractor
 * Extrai contexto de negócio de issues e User Stories
 */

import { GitLabApiClient } from '../gitlab/api.js';
import { logger } from './logger.js';

export interface BusinessContext {
  hasContext: boolean;
  task?: {
    id: number;
    title: string;
    description: string;
    url: string;
    labels: string[];
  };
  userStory?: {
    id: number;
    title: string;
    description: string;
    url: string;
  };
}

export class BusinessContextExtractor {
  constructor(private api: GitLabApiClient) {}

  /**
   * Extrai contexto de negócio de um MR
   * 1. Busca issue vinculada ao MR
   * 2. Extrai referência à User Story da issue
   * 3. Busca conteúdo da User Story
   */
  async extractContext(projectId: number, mrIid: number): Promise<BusinessContext> {
    try {
      // Busca issues que serão fechadas pelo MR
      const closesIssues = await this.api.getMergeRequestClosesIssues(projectId, mrIid);

      if (closesIssues.length === 0) {
        logger.info(`No issues linked to MR !${mrIid}`);
        return { hasContext: false };
      }

      // Pega a primeira issue (normalmente MRs fecham 1 issue principal)
      const mainIssue = closesIssues[0];
      logger.info(`Found main issue: #${mainIssue.iid} - ${mainIssue.title}`);

      const context: BusinessContext = {
        hasContext: true,
        task: {
          id: mainIssue.iid,
          title: mainIssue.title,
          description: mainIssue.description,
          url: mainIssue.web_url,
          labels: mainIssue.labels || [],
        },
      };

      // Tenta extrair referência à User Story
      const usReference = this.extractUserStoryReference(mainIssue.description);
      
      if (usReference) {
        try {
          const userStory = await this.api.getIssue(projectId, usReference.issueIid);
          
          context.userStory = {
            id: userStory.iid,
            title: userStory.title,
            description: userStory.description,
            url: userStory.web_url,
          };

          logger.info(`Found User Story: #${userStory.iid} - ${userStory.title}`);
        } catch (error) {
          logger.error(`Failed to fetch User Story #${usReference.issueIid}`, { error });
        }
      }

      return context;
    } catch (error) {
      logger.error('Failed to extract business context', { error });
      return { hasContext: false };
    }
  }

  /**
   * Extrai referência à User Story da description da issue
   * Padrões suportados:
   * - "Related to #123"
   * - "User Story: #123"
   * - "US: #123"
   * - "História: #123"
   * - "[US#123]"
   * - Qualquer #número com label US/História/Story
   */
  private extractUserStoryReference(description: string): { issueIid: number } | null {
    if (!description) {
      return null;
    }

    // Padrões de referência
    const patterns = [
      /(?:Related to|Relates to|User Story|US|História|Story):\s*#(\d+)/i,
      /\[US#(\d+)\]/i,
      /#(\d+)/g, // Fallback: qualquer #número
    ];

    for (const pattern of patterns) {
      const match = description.match(pattern);
      if (match) {
        const issueIid = parseInt(match[1], 10);
        logger.debug(`Extracted US reference: #${issueIid} from pattern ${pattern}`);
        return { issueIid };
      }
    }

    return null;
  }

  /**
   * Formata contexto de negócio para apresentação
   */
  formatContext(context: BusinessContext): string {
    if (!context.hasContext) {
      return '';
    }

    let output = '\n\n' + '='.repeat(80) + '\n';
    output += '📋 **CONTEXTO DE NEGÓCIO**\n';
    output += '='.repeat(80) + '\n\n';

    // Task/Issue
    if (context.task) {
      output += `### 📌 Tarefa Vinculada: #${context.task.id}\n\n`;
      output += `**Título:** ${context.task.title}\n`;
      output += `**URL:** ${context.task.url}\n`;
      
      if (context.task.labels.length > 0) {
        output += `**Labels:** ${context.task.labels.map(l => `\`${l}\``).join(', ')}\n`;
      }
      
      output += `\n**Descrição:**\n`;
      output += '```\n';
      output += context.task.description || '_(sem descrição)_';
      output += '\n```\n\n';
    }

    // User Story
    if (context.userStory) {
      output += `### 📖 User Story: #${context.userStory.id}\n\n`;
      output += `**Título:** ${context.userStory.title}\n`;
      output += `**URL:** ${context.userStory.url}\n\n`;
      output += `**História:**\n`;
      output += '```\n';
      output += context.userStory.description || '_(sem descrição)_';
      output += '\n```\n\n';
    }

    output += '='.repeat(80) + '\n\n';
    output += '⚠️ **IMPORTANTE**: Use o contexto acima para entender o PROPÓSITO da mudança.\n';
    output += 'Verifique se o código implementa corretamente os requisitos da tarefa/US.\n\n';

    return output;
  }
}
