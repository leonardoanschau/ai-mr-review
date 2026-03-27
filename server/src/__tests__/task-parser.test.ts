/**
 * task-parser.test.ts
 * Unit tests for parseTasksFromDescription and suggestTasksFromDescription
 */

import { describe, it, expect } from 'vitest';
import { parseTasksFromDescription, suggestTasksFromDescription, analyzeIssueForTaskSuggestion } from '../utils/task-parser.js';

// ---------------------------------------------------------------------------
// parseTasksFromDescription
// ---------------------------------------------------------------------------

describe('parseTasksFromDescription', () => {
  it('returns empty array when description has no "## Tarefas" section', () => {
    const desc = `
## Descrição
Implementar feature X.

## Critérios de Aceite
- [ ] Deve funcionar
- [ ] Deve ter testes
`;
    expect(parseTasksFromDescription(desc)).toHaveLength(0);
  });

  it('parses checkboxes from "## Tarefas" section', () => {
    const desc = `
## Tarefas
- [ ] Implementar endpoint
- [ ] Escrever testes
- [x] Revisar código
`;
    const tasks = parseTasksFromDescription(desc);
    expect(tasks).toHaveLength(3);
    expect(tasks[0].title).toBe('Implementar endpoint');
    expect(tasks[1].title).toBe('Escrever testes');
    expect(tasks[2].title).toBe('Revisar código');
  });

  it('parses checkboxes from "## ✅ Tarefas" section (with emoji)', () => {
    const desc = `
## ✅ Tarefas
- [ ] Tarefa com emoji na seção
`;
    const tasks = parseTasksFromDescription(desc);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('Tarefa com emoji na seção');
  });

  it('ignores checkboxes in sections other than "## Tarefas"', () => {
    const desc = `
## Critérios de Aceite
- [ ] Este checkbox NÃO deve ser incluído
- [ ] Este também não

## Tarefas
- [ ] Este SIM deve ser incluído

## Definition of Done
- [ ] Este NÃO deve ser incluído
`;
    const tasks = parseTasksFromDescription(desc);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('Este SIM deve ser incluído');
  });

  it('stops parsing at the next ## heading after the Tarefas section', () => {
    const desc = `
## Tarefas
- [ ] Tarefa 1
- [ ] Tarefa 2

## Outra seção
- [ ] Não deve aparecer
`;
    const tasks = parseTasksFromDescription(desc);
    expect(tasks).toHaveLength(2);
  });

  it('assigns correct index to each task', () => {
    const desc = `
## Tarefas
- [ ] Task A
- [ ] Task B
- [ ] Task C
`;
    const tasks = parseTasksFromDescription(desc);
    expect(tasks[0].index).toBe(0);
    expect(tasks[1].index).toBe(1);
    expect(tasks[2].index).toBe(2);
  });

  it('ignores checkboxes with title shorter than 5 characters', () => {
    const desc2 = `
## Tarefas
- [ ] Hi
- [ ] Esta tarefa tem um título suficientemente longo
`;
    const tasks = parseTasksFromDescription(desc2);
    // "Hi" has 2 chars < 5, should be skipped
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('Esta tarefa tem um título suficientemente longo');
  });

  it('returns empty array when Tarefas section exists but has no checkboxes', () => {
    const desc = `
## Tarefas
Este seção existe mas não tem checkboxes.
Só texto mesmo.
`;
    expect(parseTasksFromDescription(desc)).toHaveLength(0);
  });

  it('each task has a description field', () => {
    const desc = `
## Tarefas
- [ ] Implementar algo
`;
    const tasks = parseTasksFromDescription(desc);
    expect(tasks[0]).toHaveProperty('description');
    expect(typeof tasks[0].description).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// suggestTasksFromDescription
// ---------------------------------------------------------------------------

describe('suggestTasksFromDescription', () => {
  it('suggests backend task when description mentions "api"', () => {
    const tasks = suggestTasksFromDescription('Implementar api endpoint', 'Feature X');
    const hasBackend = tasks.some(t => t.title.toLowerCase().includes('backend'));
    expect(hasBackend).toBe(true);
  });

  it('suggests frontend task when description mentions "interface"', () => {
    const tasks = suggestTasksFromDescription('Criar interface para o usuário', 'Feature X');
    const hasFrontend = tasks.some(t => t.title.toLowerCase().includes('frontend'));
    expect(hasFrontend).toBe(true);
  });

  it('suggests generic tasks when description has no known keywords', () => {
    const tasks = suggestTasksFromDescription('Fazer algo genérico', 'Feature Y');
    expect(tasks.length).toBeGreaterThan(0);
  });

  it('returns tasks with title, description, and index properties', () => {
    const tasks = suggestTasksFromDescription('Fazer algo genérico', 'Feature Y');
    for (const task of tasks) {
      expect(task).toHaveProperty('title');
      expect(task).toHaveProperty('description');
      expect(task).toHaveProperty('index');
    }
  });
});

// ---------------------------------------------------------------------------
// analyzeIssueForTaskSuggestion
// ---------------------------------------------------------------------------

describe('analyzeIssueForTaskSuggestion', () => {
  it('returns a non-empty string for any description', () => {
    const result = analyzeIssueForTaskSuggestion('Alguma descrição', 'Título da Issue');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('includes the issue title in the output', () => {
    const result = analyzeIssueForTaskSuggestion('Descrição qualquer', 'Minha US Importante');
    expect(result).toContain('Minha US Importante');
  });

  it('returns non-empty output even when description is empty', () => {
    const result = analyzeIssueForTaskSuggestion('', 'Título');
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain('Título');
  });

  it('includes content from ALL ## sections, not just ## Tarefas', () => {
    const desc = `
## Descrição
Texto da descrição.

## Tarefas
- [ ] Tarefa 1

## Critérios de Aceite
Critérios aqui.
`;
    const result = analyzeIssueForTaskSuggestion(desc, 'US X');
    expect(result).toContain('Descrição');
    expect(result).toContain('Tarefas');
    expect(result).toContain('Critérios de Aceite');
  });

  it('collects checkboxes from any section (not only ## Tarefas)', () => {
    const desc = `
## Critérios de Aceite
- [ ] Critério A
- [ ] Critério B

## Observações
- [ ] Ponto extra
`;
    const result = analyzeIssueForTaskSuggestion(desc, 'US Y');
    expect(result).toContain('Critério A');
    expect(result).toContain('Critério B');
    expect(result).toContain('Ponto extra');
  });

  it('includes instruction to call create_dev_tasks_from_issue', () => {
    const result = analyzeIssueForTaskSuggestion('Qualquer descrição', 'Título');
    expect(result).toContain('create_dev_tasks_from_issue');
  });

  it('includes section content when description has no ## headings', () => {
    const desc = 'Apenas texto simples sem seções markdown.';
    const result = analyzeIssueForTaskSuggestion(desc, 'Título');
    expect(result).toContain('Apenas texto simples sem seções markdown.');
  });

  it('handles description with only checkboxes and no headings', () => {
    const desc = '- [ ] Item A\n- [ ] Item B';
    const result = analyzeIssueForTaskSuggestion(desc, 'Título');
    expect(result).toContain('Item A');
    expect(result).toContain('Item B');
  });
});
