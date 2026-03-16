/**
 * Task Parser Utility
 * Extrai tarefas de descrições de issues
 */

import { logger } from './logger.js';

export interface ParsedTask {
  title: string;
  description: string;
  index: number;
}

/**
 * Parse tarefas de uma descrição Markdown
 * Busca por checkboxes APENAS na seção "## ✅ Tarefas" ou "## Tarefas"
 * IGNORA checkboxes em outras seções como "Critérios de Aceite"
 * 
 * Formato esperado:
 * ## ✅ Tarefas
 * - [ ] Tarefa 1
 * - [x] Tarefa 2
 * - [ ] Tarefa 3
 */
export function parseTasksFromDescription(description: string): ParsedTask[] {
  const tasks: ParsedTask[] = [];
  
  // Regex para encontrar a seção de Tarefas (com ou sem emoji)
  const tasksSectionRegex = /^##\s*[✅]?\s*Tarefas\s*$/im;
  const tasksSectionMatch = description.match(tasksSectionRegex);
  
  if (!tasksSectionMatch) {
    logger.info('No "## Tarefas" section found in description');
    return tasks;
  }
  
  // Encontra o índice onde a seção de Tarefas começa
  const tasksStartIndex = tasksSectionMatch.index! + tasksSectionMatch[0].length;
  
  // Encontra o próximo heading de nível 2 (##) após a seção de Tarefas
  const remainingText = description.substring(tasksStartIndex);
  const nextSectionMatch = remainingText.match(/^##\s+/m);
  
  // Extrai apenas o conteúdo da seção de Tarefas
  const tasksSection = nextSectionMatch 
    ? remainingText.substring(0, nextSectionMatch.index)
    : remainingText;
  
  // Regex para capturar checkboxes com ou sem marcação
  const checkboxRegex = /^[\s]*-\s*\[([ x])\]\s+(.+)$/gim;
  
  let match: RegExpExecArray | null;
  let index = 0;
  
  while ((match = checkboxRegex.exec(tasksSection)) !== null) {
    const taskText = match[2].trim();
    
    // Ignora tarefas muito curtas
    if (taskText.length < 5) {
      continue;
    }
    
    tasks.push({
      title: taskText,
      description: `Tarefa derivada da issue pai.\n\n**Descrição:** ${taskText}`,
      index: index++,
    });
  }
  
  logger.info(`Parsed ${tasks.length} tasks from "## Tarefas" section (ignored checkboxes from other sections)`);
  return tasks;
}

/**
 * Gera tarefas sugeridas quando não há tarefas explícitas na descrição
 * Analisa o conteúdo e sugere decomposição padrão
 */
export function suggestTasksFromDescription(
  description: string,
  issueTitle: string
): ParsedTask[] {
  const tasks: ParsedTask[] = [];
  
  // Heurísticas simples para sugerir tarefas
  const hasBackend = /backend|api|endpoint|servi[cç]o|controller|repository/i.test(description);
  const hasFrontend = /frontend|interface|tela|componente|UI|UX/i.test(description);
  const hasDatabase = /banco|database|mongodb|sql|migra[cç][aã]o|collection|table/i.test(description);
  const hasTests = /teste|test|cobertura|coverage|unit[aá]rio/i.test(description);
  const hasDocumentation = /documenta[cç][aã]o|readme|swagger|openapi/i.test(description);
  
  let index = 0;
  
  if (hasBackend) {
    tasks.push({
      title: `Implementar backend - ${issueTitle}`,
      description: `Implementação do backend para: ${issueTitle}\n\nInclui:\n- Lógica de negócio\n- APIs/Endpoints\n- Serviços`,
      index: index++,
    });
  }
  
  if (hasFrontend) {
    tasks.push({
      title: `Implementar frontend - ${issueTitle}`,
      description: `Implementação do frontend para: ${issueTitle}\n\nInclui:\n- Componentes UI\n- Integração com API\n- Estilização`,
      index: index++,
    });
  }
  
  if (hasDatabase) {
    tasks.push({
      title: `Implementar mudanças no banco de dados - ${issueTitle}`,
      description: `Mudanças no banco de dados para: ${issueTitle}\n\nInclui:\n- Migrações\n- Índices\n- Collections/Tabelas`,
      index: index++,
    });
  }
  
  if (hasTests) {
    tasks.push({
      title: `Implementar testes - ${issueTitle}`,
      description: `Implementação de testes para: ${issueTitle}\n\nInclui:\n- Testes unitários\n- Testes de integração\n- Validação de cobertura`,
      index: index++,
    });
  }
  
  if (hasDocumentation) {
    tasks.push({
      title: `Atualizar documentação - ${issueTitle}`,
      description: `Atualização de documentação para: ${issueTitle}\n\nInclui:\n- README\n- Swagger/OpenAPI\n- Comentários de código`,
      index: index++,
    });
  }
  
  // Se não encontrou nada, sugere decomposição genérica
  if (tasks.length === 0) {
    tasks.push(
      {
        title: `Implementação - ${issueTitle}`,
        description: `Implementação principal de: ${issueTitle}`,
        index: 0,
      },
      {
        title: `Testes - ${issueTitle}`,
        description: `Testes para: ${issueTitle}`,
        index: 1,
      }
    );
  }
  
  logger.info(`Suggested ${tasks.length} tasks based on description content`);
  return tasks;
}
