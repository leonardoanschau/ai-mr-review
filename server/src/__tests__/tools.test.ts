/**
 * tools.test.ts
 * Unit tests for McpToolsDefinition schemas and descriptions
 */

import { describe, it, expect } from 'vitest';
import { McpToolsDefinition } from '../mcp/tools.js';

// ---------------------------------------------------------------------------
// createIssueTool
// ---------------------------------------------------------------------------

describe('McpToolsDefinition.createIssueTool', () => {
  const tool = McpToolsDefinition.createIssueTool();

  it('has name "create_gitlab_issue"', () => {
    expect(tool.name).toBe('create_gitlab_issue');
  });

  it('requires project_name, title, and description', () => {
    expect(tool.inputSchema.required).toContain('project_name');
    expect(tool.inputSchema.required).toContain('title');
    expect(tool.inputSchema.required).toContain('description');
  });

  it('description rejects [DEV] prefix and redirects to create_dev_tasks_from_issue', () => {
    expect(tool.description).toContain('[DEV]');
    expect(tool.description).toContain('create_dev_tasks_from_issue');
  });

  it('description only allows [US], [TD], [BUG] prefixes', () => {
    expect(tool.description).toContain('[US]');
    expect(tool.description).toContain('[TD]');
    expect(tool.description).toContain('[BUG]');
  });

  it('labels field description warns against inferring extra labels', () => {
    const labelsField = tool.inputSchema.properties['labels'] as { description: string };
    expect(labelsField.description).toMatch(/N.O infira|não infira/i);
  });

  it('labels field description mentions default ["Grupo Panvel :: Analyze"]', () => {
    const labelsField = tool.inputSchema.properties['labels'] as { description: string };
    expect(labelsField.description).toContain('Grupo Panvel :: Analyze');
  });

  it('labels field description does NOT mention "User Story" as default', () => {
    const labelsField = tool.inputSchema.properties['labels'] as { description: string };
    expect(labelsField.description).not.toContain('User Story');
  });

  it('description instructs to show preview and wait for confirmation before executing', () => {
    expect(tool.description).toMatch(/confirma|aguard/i);
  });
});

// ---------------------------------------------------------------------------
// createDevTasksTool
// ---------------------------------------------------------------------------

describe('McpToolsDefinition.createDevTasksTool', () => {
  const tool = McpToolsDefinition.createDevTasksTool();

  it('has name "create_dev_tasks_from_issue"', () => {
    expect(tool.name).toBe('create_dev_tasks_from_issue');
  });

  it('requires only parent_issue_url (default_project is no longer required)', () => {
    expect(tool.inputSchema.required).toContain('parent_issue_url');
    expect(tool.inputSchema.required).not.toContain('default_project');
  });

  it('does NOT require task_title (it is optional)', () => {
    expect(tool.inputSchema.required).not.toContain('task_title');
  });

  it('has task_title property in schema', () => {
    expect(tool.inputSchema.properties).toHaveProperty('task_title');
  });

  it('has labels property in schema', () => {
    expect(tool.inputSchema.properties).toHaveProperty('labels');
  });

  it('labels field description warns against inferring extra labels', () => {
    const labelsField = tool.inputSchema.properties['labels'] as { description: string };
    expect(labelsField.description).toMatch(/N.O infira|não infira/i);
  });

  it('labels field description mentions default ["Grupo Panvel :: Analyze"]', () => {
    const labelsField = tool.inputSchema.properties['labels'] as { description: string };
    expect(labelsField.description).toContain('Grupo Panvel :: Analyze');
  });

  it('labels field description does NOT mention "Development" as default', () => {
    const labelsField = tool.inputSchema.properties['labels'] as { description: string };
    expect(labelsField.description).not.toContain('Development');
  });

  it('description instructs to create ONE task at a time', () => {
    expect(tool.description).toMatch(/uma.*vez|one.*at.*a.*time|por vez/i);
  });

  it('description says NEVER infer the project', () => {
    expect(tool.description).toMatch(/nunca inferir|NUNCA.*projeto|never.*infer/i);
  });

  it('description mentions "blocks" as link type', () => {
    expect(tool.description).toContain('blocks');
  });

  it('description instructs to show preview and wait for user approval', () => {
    expect(tool.description).toMatch(/aprovada|PERGUNTAR|preview|Etapa 1/i);
  });

  it('description does NOT still say "creates multiple issues at once" (old behavior)', () => {
    expect(tool.description).not.toContain('CRIA MÚLTIPLAS ISSUES');
  });

  it('default_project description marks it as required/mandatory', () => {
    const field = tool.inputSchema.properties['default_project'] as { description: string };
    expect(field.description).toMatch(/OBRIGAT|required|mandatory/i);
  });
});

// ---------------------------------------------------------------------------
// getAllTools
// ---------------------------------------------------------------------------

describe('McpToolsDefinition.getAllTools', () => {
  it('returns 9 tools', () => {
    expect(McpToolsDefinition.getAllTools()).toHaveLength(9);
  });

  it('contains create_gitlab_issue and create_dev_tasks_from_issue', () => {
    const names = McpToolsDefinition.getAllTools().map(t => t.name);
    expect(names).toContain('create_gitlab_issue');
    expect(names).toContain('create_dev_tasks_from_issue');
  });

  it('all tools have name, description, and inputSchema', () => {
    for (const tool of McpToolsDefinition.getAllTools()) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeTruthy();
    }
  });
});
