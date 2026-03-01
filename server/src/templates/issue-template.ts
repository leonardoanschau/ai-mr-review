/**
 * GitLab Issue Template
 * Generates standardized issue descriptions
 */

interface TemplateSection {
  title: string;
  emoji: string;
  content: string;
}

export class IssueTemplate {
  private static buildSection(section: TemplateSection): string {
    return `## ${section.emoji} ${section.title}\n\n${section.content}\n\n`;
  }

  private static getObjectiveSection(): string {
    return this.buildSection({
      title: 'Objetivo',
      emoji: '🎯',
      content: '[Descrever claramente O QUE será feito e PARA QUÊ em 2-3 linhas]',
    });
  }

  private static getContextSection(): string {
    return this.buildSection({
      title: 'Contexto',
      emoji: '📌',
      content: '[Descrever a situação atual, problema ou necessidade em 2-3 linhas]',
    });
  }

  private static getApiContractsSection(): string {
    const requestExample = '```json\n{\n  // Estrutura do request, se aplicável\n}\n```';
    const responseExample = '```json\n{\n  // Estrutura do response, se aplicável\n}\n```';
    const content = `### Request\n${requestExample}\n\n### Response\n${responseExample}`;
    
    return this.buildSection({
      title: 'Contratos de API',
      emoji: '📡',
      content,
    });
  }

  private static getDependenciesSection(): string {
    return this.buildSection({
      title: 'Dependências',
      emoji: '🔗',
      content:
        '[Se aplicável: Listar serviços externos, outras USs/tasks pré-requisito, bibliotecas, acessos necessários]',
    });
  }

  private static getTasksSection(): string {
    const tasks = [
      '- [ ] [Tarefa técnica específica 1]',
      '- [ ] [Tarefa técnica específica 2]',
      '- [ ] [Tarefa técnica específica 3]',
    ].join('\n');

    return this.buildSection({
      title: 'Tarefas',
      emoji: '✅',
      content: tasks,
    });
  }

  private static getImpactsSection(): string {
    return this.buildSection({
      title: 'Impactos e Compatibilidade',
      emoji: '⚡',
      content:
        '[Se aplicável: Breaking changes, migrações, impactos em outros sistemas, documentações a atualizar]',
    });
  }

  private static getObservationsSection(): string {
    return this.buildSection({
      title: 'Observações',
      emoji: '⚠️',
      content: '[Pontos de atenção, riscos, dependências ou considerações importantes]',
    });
  }

  private static getMetricsSection(): string {
    return this.buildSection({
      title: 'Métricas de Sucesso',
      emoji: '📊',
      content: '[Se aplicável: SLAs/SLOs, logs/monitoramento, alertas, como medir sucesso]',
    });
  }

  private static getAcceptanceCriteriaSection(): string {
    const criteria = [
      '- [ ] [Critério verificável 1]',
      '- [ ] [Critério verificável 2]',
      '- [ ] [Critério verificável 3]',
    ].join('\n');

    return this.buildSection({
      title: 'Critérios de Aceite',
      emoji: '✔️',
      content: criteria,
    });
  }

  static getFullTemplate(): string {
    return (
      this.getObjectiveSection() +
      this.getContextSection() +
      this.getApiContractsSection() +
      this.getDependenciesSection() +
      this.getTasksSection() +
      this.getImpactsSection() +
      this.getObservationsSection() +
      this.getMetricsSection() +
      this.getAcceptanceCriteriaSection()
    ).trim();
  }
}
