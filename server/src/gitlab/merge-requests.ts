/**
 * GitLab Merge Request Service
 * Handles MR operations and code review
 */

import { GitLabApiClient, GitLabMergeRequest, GitLabMergeRequestChanges } from './api.js';
import { logger } from '../utils/logger.js';

export interface MergeRequestIdentifier {
  projectId: number;
  mrIid: number;
}

export interface ReviewComment {
  filePath: string;
  line: number;
  comment: string;
  oldLine?: number;
}

export class MergeRequestService {
  constructor(private api: GitLabApiClient) {}

  /**
   * Extrai project_id e mr_iid de uma URL do GitLab
   * Ex: http://gitlab.com/grupo/projeto/-/merge_requests/123
   */
  async parseMergeRequestUrl(url: string): Promise<MergeRequestIdentifier | null> {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/');
      
      // Encontra merge_requests no path
      const mrIndex = pathParts.findIndex(part => part === 'merge_requests');
      if (mrIndex === -1 || mrIndex === pathParts.length - 1) {
        return null;
      }

      const mrIid = parseInt(pathParts[mrIndex + 1], 10);
      if (isNaN(mrIid)) {
        return null;
      }

      // Pega o path do projeto (tudo antes de -/merge_requests)
      const projectPath = pathParts.slice(1, mrIndex - 1).join('/');
      
      // Busca o projeto pelo path para obter o ID numérico
      logger.info(`Fetching project ID for path: ${projectPath}`);
      const project = await this.api.getProjectByPath(projectPath);
      
      logger.info(`Parsed MR URL: project=${project.name} (ID=${project.id}), mr_iid=${mrIid}`);
      
      return { projectId: project.id, mrIid };
    } catch (error) {
      logger.error('Failed to parse MR URL', { error });
      return null;
    }
  }

  /**
   * Obtém informações do Merge Request
   */
  async getMergeRequest(
    projectId: number,
    mrIid: number
  ): Promise<GitLabMergeRequest> {
    return await this.api.getMergeRequest(projectId, mrIid);
  }

  /**
   * Obtém as mudanças (diffs) do Merge Request
   */
  async getMergeRequestChanges(
    projectId: number,
    mrIid: number
  ): Promise<GitLabMergeRequestChanges> {
    return await this.api.getMergeRequestChanges(projectId, mrIid);
  }

  /**
   * Cria um comentário em uma linha específica do MR
   */
  async createLineComment(
    projectId: number,
    mrIid: number,
    mr: GitLabMergeRequestChanges,
    comment: ReviewComment
  ): Promise<void> {
    // Busca o arquivo nas mudanças
    const fileChange = mr.changes.find(
      change => change.new_path === comment.filePath || change.old_path === comment.filePath
    );

    if (!fileChange) {
      throw new Error(`Arquivo não encontrado no MR: ${comment.filePath}`);
    }

    // Valida se a linha está no diff
    const isLineInDiff = this.isLineInDiff(fileChange.diff, comment.line);
    
    if (!isLineInDiff) {
      throw new Error(
        `Linha ${comment.line} não está no diff de ${comment.filePath}. ` +
        `Comentários inline só funcionam em linhas adicionadas (+) ou removidas (-) no diff.`
      );
    }

    // Criar comentário com posição
    await this.api.createMergeRequestNote(projectId, mrIid, {
      body: comment.comment,
      position: {
        base_sha: mr.diff_refs?.base_sha || '',
        start_sha: mr.diff_refs?.start_sha || '',
        head_sha: mr.diff_refs?.head_sha || '',
        position_type: 'text',
        new_path: comment.filePath,
        new_line: comment.line,
        old_line: comment.oldLine,
      },
    });
  }

  /**
   * Valida se uma linha está presente no diff (linha adicionada ou removida)
   */
  private isLineInDiff(diff: string, targetLine: number): boolean {
    const lines = diff.split('\n');
    let currentNewLine = 0;

    for (const line of lines) {
      // Linhas que começam com @@ indicam o range
      if (line.startsWith('@@')) {
        // Parse: @@ -10,5 +12,8 @@
        const match = line.match(/\+(\d+)/);
        if (match) {
          currentNewLine = parseInt(match[1], 10) - 1;
        }
        continue;
      }

      // Linha adicionada ou contexto
      if (line.startsWith('+')) {
        currentNewLine++;
        if (currentNewLine === targetLine) {
          return true; // Linha está no diff (adicionada)
        }
      } else if (line.startsWith(' ')) {
        // Linha de contexto (não modificada)
        currentNewLine++;
      }
      // Linhas removidas (-) não incrementam currentNewLine
    }

    return false;
  }

  /**
   * Extrai as linhas válidas para comentários de um diff
   */
  getCommentableLines(diff: string): number[] {
    const lines = diff.split('\n');
    let currentNewLine = 0;
    const commentableLines: number[] = [];

    for (const line of lines) {
      if (line.startsWith('@@')) {
        const match = line.match(/\+(\d+)/);
        if (match) {
          currentNewLine = parseInt(match[1], 10) - 1;
        }
        continue;
      }

      if (line.startsWith('+')) {
        currentNewLine++;
        commentableLines.push(currentNewLine); // Linha adicionada pode ser comentada
      } else if (line.startsWith(' ')) {
        currentNewLine++;
      }
    }

    return commentableLines;
  }

  /**
   * Formata as mudanças do MR para análise
   */
  formatChangesForReview(changes: GitLabMergeRequestChanges): string {
    let output = `📝 **Merge Request !${changes.iid}: ${changes.title}**\n\n`;
    output += `🔗 URL: ${changes.web_url}\n`;
    output += `📊 Status: ${changes.state}\n`;
    output += `🌿 ${changes.source_branch} → ${changes.target_branch}\n`;
    output += `👤 Autor: ${changes.author.name} (@${changes.author.username})\n\n`;
    output += `📁 **Arquivos alterados: ${changes.changes.length}**\n\n`;
    output += `⚠️ **IMPORTANTE**: Analise APENAS as linhas marcadas com \`+\` (código NOVO). Ignore linhas com \`-\` (removidas) e linhas de contexto.\n\n`;

    changes.changes.forEach((change, index) => {
      const status = change.new_file
        ? '🆕 Novo'
        : change.deleted_file
          ? '🗑️ Deletado'
          : change.renamed_file
            ? '📝 Renomeado'
            : '✏️ Modificado';

      output += `${index + 1}. ${status}: \`${change.new_path}\`\n`;
      
      // Extrai e mostra APENAS as linhas adicionadas (com +)
      const addedLines = this.extractAddedLines(change.diff);
      const commentableLines = this.getCommentableLines(change.diff);
      
      if (commentableLines.length > 0) {
        const lineRanges = this.formatLineRanges(commentableLines);
        output += `   💬 **Linhas comentáveis**: ${lineRanges}\n`;
      }
      
      // Mostra APENAS as linhas adicionadas (+ no diff)
      if (addedLines.length > 0) {
        output += '\n**📝 Código NOVO (linhas com +):**\n';
        output += '```diff\n';
        addedLines.slice(0, 30).forEach(line => {
          output += `${line}\n`;
        });
        if (addedLines.length > 30) {
          output += `\n... (mais ${addedLines.length - 30} linhas adicionadas omitidas)`;
        }
        output += '\n```\n';
      }
      
      output += '\n';
    });

    return output;
  }

  /**
   * Extrai apenas as linhas adicionadas do diff (linhas com +)
   */
  private extractAddedLines(diff: string): string[] {
    const lines = diff.split('\n');
    const addedLines: string[] = [];
    let currentNewLine = 0;

    for (const line of lines) {
      // Pega o range inicial do diff
      if (line.startsWith('@@')) {
        const match = line.match(/\+(\d+)/);
        if (match) {
          currentNewLine = parseInt(match[1], 10) - 1;
        }
        addedLines.push(line); // Inclui o header do range
        continue;
      }

      // Apenas linhas adicionadas (com +)
      if (line.startsWith('+') && !line.startsWith('+++')) {
        currentNewLine++;
        addedLines.push(`L${currentNewLine}: ${line}`); // Adiciona número da linha
      } else if (line.startsWith(' ')) {
        currentNewLine++;
      }
    }

    return addedLines;
  }

  /**
   * Formata uma lista de linhas em ranges legíveis (ex: 10-15, 20, 25-30)
   */
  private formatLineRanges(lines: number[]): string {
    if (lines.length === 0) return 'nenhuma';
    if (lines.length <= 5) return lines.join(', ');

    // Se muitas linhas, mostrar ranges
    const ranges: string[] = [];
    let start = lines[0];
    let end = lines[0];

    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === end + 1) {
        end = lines[i];
      } else {
        ranges.push(start === end ? `${start}` : `${start}-${end}`);
        start = lines[i];
        end = lines[i];
      }
    }
    ranges.push(start === end ? `${start}` : `${start}-${end}`);

    return ranges.join(', ');
  }

  /**
   * Formata o resultado da revisão
   */
  formatReviewResult(
    mr: GitLabMergeRequest,
    commentsCreated: number,
    errors: number
  ): string {
    let output = `✅ **Revisão concluída para MR !${mr.iid}**\n\n`;
    output += `📝 ${commentsCreated} comentário(s) criado(s)\n`;
    if (errors > 0) {
      output += `⚠️ ${errors} erro(s) ao criar comentários\n`;
    }
    output += `\n🔗 Ver no GitLab: ${mr.web_url}\n`;
    return output;
  }
}
