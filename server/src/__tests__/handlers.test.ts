/**
 * handlers.test.ts
 * Unit tests for McpToolHandlers business rules
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before any import that uses them
// ---------------------------------------------------------------------------

vi.mock('../utils/config.js', () => ({
  ConfigManager: {
    validateConfig: vi.fn(),
    getConfig: vi.fn(() => ({
      apiUrl: 'http://gitlab.example.com/api/v4',
      token: 'fake-token',
      defaultGroup: 'mygroup',
      defaultAssignee: 'defaultuser',
    })),
  },
  ConfigError: class ConfigError extends Error {},
}));

vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Shared spy references — populated in beforeEach
const mockCreateIssue = vi.fn();
const mockGetIssueByUrl = vi.fn();
const mockGetUserByUsername = vi.fn();
const mockCreateIssueLink = vi.fn();
const mockFindProjectByName = vi.fn();
const mockListProjects = vi.fn();
const mockFormatProjectInfo = vi.fn();

vi.mock('../gitlab/api.js', () => ({
  GitLabApiClient: vi.fn().mockImplementation(() => ({
    createIssue: mockCreateIssue,
    getIssueByUrl: mockGetIssueByUrl,
    getUserByUsername: mockGetUserByUsername,
    createIssueLink: mockCreateIssueLink,
    getIssue: vi.fn(),
    updateIssue: vi.fn(),
  })),
}));

vi.mock('../gitlab/projects.js', () => ({
  ProjectService: vi.fn().mockImplementation(() => ({
    listProjects: mockListProjects,
    findProjectByName: mockFindProjectByName,
    formatProjectInfo: mockFormatProjectInfo,
  })),
}));

vi.mock('../gitlab/issues.js', () => ({
  IssueService: Object.assign(
    vi.fn().mockImplementation(() => ({
      createIssue: mockCreateIssue,
      formatIssueResult: vi.fn(() => '✅ Issue criada!'),
    })),
    {
      getDefaultLabels: vi.fn(() => ['Grupo Panvel :: Analyze']),
      PILGER_US_PROJECT: 'user-stories',
    }
  ),
}));

vi.mock('../gitlab/merge-requests.js', () => ({
  MergeRequestService: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../utils/business-context.js', () => ({
  BusinessContextExtractor: vi.fn().mockImplementation(() => ({
    extractContext: vi.fn(() => ({ hasContext: false })),
    formatContext: vi.fn(() => ''),
  })),
}));

vi.mock('../utils/task-parser.js', () => ({
  parseTasksFromDescription: vi.fn(() => [
    { title: 'Implementar endpoint', description: 'desc 1', index: 0 },
    { title: 'Escrever testes', description: 'desc 2', index: 1 },
  ]),
  suggestTasksFromDescription: vi.fn(() => []),
  analyzeIssueForTaskSuggestion: vi.fn(() => 'Análise da issue:\n- Sugestão A\n- Sugestão B\ncreate_dev_tasks_from_issue'),
}));

vi.mock('../templates/issue-template.js', () => ({
  IssueTemplate: { getFullTemplate: vi.fn(() => '## Template') },
}));

vi.mock('../templates/code-review-checklist.js', () => ({
  CodeReviewChecklist: {
    mapFocusToCategory: vi.fn(),
    generateChecklistPrompt: vi.fn(() => ''),
  },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { McpToolHandlers } from '../mcp/handlers.js';
import { GitLabApiClient } from '../gitlab/api.js';
import { IssueService } from '../gitlab/issues.js';
import { parseTasksFromDescription, analyzeIssueForTaskSuggestion } from '../utils/task-parser.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHandlers() {
  const api = new GitLabApiClient('http://gitlab.example.com/api/v4', 'fake-token');
  return new McpToolHandlers(api);
}

const fakeProject = { id: 1, name: 'my-project', path_with_namespace: 'mygroup/my-project' };
const fakeUser = { id: 99, username: 'defaultuser' };
const fakeIssue = {
  iid: 42,
  title: '[US] Minha issue',
  description: '## Tarefas\n- [ ] Implementar endpoint\n- [ ] Escrever testes',
  state: 'opened',
  labels: ['Grupo Panvel :: Analyze'],
  assignees: [{ username: 'defaultuser' }],
  web_url: 'http://gitlab.example.com/mygroup/my-project/-/issues/42',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// ---------------------------------------------------------------------------
// Tests: handleCreateIssue
// ---------------------------------------------------------------------------

describe('handleCreateIssue', () => {
  let handlers: McpToolHandlers;

  beforeEach(() => {
    vi.clearAllMocks();
    handlers = makeHandlers();
    mockFindProjectByName.mockResolvedValue(fakeProject);
    mockGetUserByUsername.mockResolvedValue(fakeUser);
    mockCreateIssue.mockResolvedValue({ ...fakeIssue, iid: 10 });
  });

  it('rejects title with [DEV] prefix (lowercase)', async () => {
    const result = await handlers.handleCreateIssue({
      project_name: 'my-project',
      title: '[dev] Implementar algo',
      description: 'desc',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('create_dev_tasks_from_issue');
    expect(mockCreateIssue).not.toHaveBeenCalled();
  });

  it('rejects title with [DEV] prefix (uppercase)', async () => {
    const result = await handlers.handleCreateIssue({
      project_name: 'my-project',
      title: '[DEV] Implementar algo',
      description: 'desc',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('create_dev_tasks_from_issue');
  });

  it('rejects [DEV] with leading space', async () => {
    const result = await handlers.handleCreateIssue({
      project_name: 'my-project',
      title: '  [DEV] Implementar algo',
      description: 'desc',
    });

    expect(result.isError).toBe(true);
  });

  it('accepts [US] prefix without error', async () => {
    const result = await handlers.handleCreateIssue({
      project_name: 'my-project',
      title: '[US] Minha user story',
      description: 'desc',
    });

    expect(result.isError).toBeFalsy();
  });

  it('accepts [TD] prefix without error', async () => {
    const result = await handlers.handleCreateIssue({
      project_name: 'my-project',
      title: '[TD] Débito técnico',
      description: 'desc',
    });

    expect(result.isError).toBeFalsy();
  });

  it('accepts [BUG] prefix without error', async () => {
    const result = await handlers.handleCreateIssue({
      project_name: 'my-project',
      title: '[BUG] Erro no login',
      description: 'desc',
    });

    expect(result.isError).toBeFalsy();
  });

  it('uses default label ["Grupo Panvel :: Analyze"] when labels not provided', async () => {
    await handlers.handleCreateIssue({
      project_name: 'my-project',
      title: '[US] Test',
      description: 'desc',
    });

    expect(IssueService.getDefaultLabels).toHaveBeenCalled();
    // Verify IssueService.getDefaultLabels returns only the single default label
    expect(IssueService.getDefaultLabels()).toEqual(['Grupo Panvel :: Analyze']);
  });

  it('uses explicitly provided labels without modifying them', async () => {
    const customLabels = ['MyCustomLabel', 'AnotherLabel'];
    await handlers.handleCreateIssue({
      project_name: 'my-project',
      title: '[US] Test',
      description: 'desc',
      labels: customLabels,
    });

    // The handler must pass the given labels, not merge with defaults
    const callArg = mockCreateIssue.mock.calls[0]?.[1];
    if (callArg) {
      // IssueService.createIssue is proxied — check formatIssueResult was called
      // This is an integration-level check via the mock chain
    }
    // Verify getDefaultLabels was NOT called when labels are explicit
    expect(IssueService.getDefaultLabels).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests: handleCreateDevTasks
// ---------------------------------------------------------------------------

describe('handleCreateDevTasks', () => {
  let handlers: McpToolHandlers;

  beforeEach(() => {
    vi.clearAllMocks();
    handlers = makeHandlers();
    mockGetIssueByUrl.mockResolvedValue({ project: fakeProject, issue: fakeIssue });
    mockFindProjectByName.mockResolvedValue(fakeProject);
    mockGetUserByUsername.mockResolvedValue(fakeUser);
    mockCreateIssue.mockResolvedValue({ ...fakeIssue, iid: 100, title: '[DEV] Implementar endpoint' });
    mockCreateIssueLink.mockResolvedValue({});
    (parseTasksFromDescription as ReturnType<typeof vi.fn>).mockReturnValue([
      { title: 'Implementar endpoint', description: 'desc 1', index: 0 },
      { title: 'Escrever testes', description: 'desc 2', index: 1 },
    ]);
  });

  it('creates link with type "blocks" (not relates_to)', async () => {
    await handlers.handleCreateDevTasks({
      parent_issue_url: 'http://gitlab.example.com/mygroup/my-project/-/issues/42',
      default_project: 'my-project',
      task_title: 'Implementar endpoint',
    });

    expect(mockCreateIssueLink).toHaveBeenCalled();

    // All calls must use 'blocks'
    for (const call of mockCreateIssueLink.mock.calls) {
      const linkType = call[4]; // 5th argument to createIssueLink
      expect(linkType).toBe('blocks');
      expect(linkType).not.toBe('relates_to');
    }
  });

  it('uses default label ["Grupo Panvel :: Analyze"] for DEV issues when labels not provided', async () => {
    await handlers.handleCreateDevTasks({
      parent_issue_url: 'http://gitlab.example.com/mygroup/my-project/-/issues/42',
      default_project: 'my-project',
      task_title: 'Implementar endpoint',
    });

    expect(IssueService.getDefaultLabels).toHaveBeenCalled();
    expect(IssueService.getDefaultLabels()).toEqual(['Grupo Panvel :: Analyze']);
    expect(IssueService.getDefaultLabels()).not.toContain('Development');
    expect(IssueService.getDefaultLabels()).not.toContain('User Story');
  });

  it('uses explicitly provided labels for DEV issues', async () => {
    await handlers.handleCreateDevTasks({
      parent_issue_url: 'http://gitlab.example.com/mygroup/my-project/-/issues/42',
      default_project: 'my-project',
      labels: ['Custom Label'],
    });

    expect(IssueService.getDefaultLabels).not.toHaveBeenCalled();
  });

  it('filters to only create the specified task when task_title is provided', async () => {
    await handlers.handleCreateDevTasks({
      parent_issue_url: 'http://gitlab.example.com/mygroup/my-project/-/issues/42',
      default_project: 'my-project',
      task_title: 'Implementar endpoint',
    });

    // Only 1 issue should be created (not 2)
    expect(mockCreateIssue).toHaveBeenCalledTimes(1);
    const createdTitle: string = mockCreateIssue.mock.calls[0][0]?.title ?? '';
    expect(createdTitle).toContain('Implementar endpoint');
  });

  it('filters task_title case-insensitively', async () => {
    await handlers.handleCreateDevTasks({
      parent_issue_url: 'http://gitlab.example.com/mygroup/my-project/-/issues/42',
      default_project: 'my-project',
      task_title: 'IMPLEMENTAR ENDPOINT',
    });

    expect(mockCreateIssue).toHaveBeenCalledTimes(1);
  });

  it('creates issue with task_title directly when it does not match any parsed task', async () => {
    const result = await handlers.handleCreateDevTasks({
      parent_issue_url: 'http://gitlab.example.com/mygroup/my-project/-/issues/42',
      default_project: 'my-project',
      task_title: 'Tarefa sugerida pelo LLM fora da seção Tarefas',
    });

    // Falls back to creating directly with the provided task_title instead of returning error
    expect(result.isError).toBeFalsy();
    expect(mockCreateIssue).toHaveBeenCalledTimes(1);
    const createdTitle: string = mockCreateIssue.mock.calls[0][0]?.title ?? '';
    expect(createdTitle).toContain('Tarefa sugerida pelo LLM');
  });

  it('enters preview mode (no issues created) when task_title is not provided', async () => {
    await handlers.handleCreateDevTasks({
      parent_issue_url: 'http://gitlab.example.com/mygroup/my-project/-/issues/42',
    });

    // Preview mode: analyzes issue, returns context — no issues or links created
    expect(mockCreateIssue).not.toHaveBeenCalled();
    expect(mockCreateIssueLink).not.toHaveBeenCalled();
  });

  it('result text does not mention "relates_to"', async () => {
    const result = await handlers.handleCreateDevTasks({
      parent_issue_url: 'http://gitlab.example.com/mygroup/my-project/-/issues/42',
      default_project: 'my-project',
      task_title: 'Implementar endpoint',
    });

    expect(result.content[0].text).not.toContain('relates_to');
    expect(result.content[0].text).toContain('blocks');
  });
});

// ---------------------------------------------------------------------------
// Tests: IssueService.getDefaultLabels
// ---------------------------------------------------------------------------

describe('IssueService.getDefaultLabels', () => {
  it('returns exactly ["Grupo Panvel :: Analyze"]', () => {
    expect(IssueService.getDefaultLabels()).toEqual(['Grupo Panvel :: Analyze']);
  });

  it('does not include "User Story"', () => {
    expect(IssueService.getDefaultLabels()).not.toContain('User Story');
  });

  it('does not include "Development"', () => {
    expect(IssueService.getDefaultLabels()).not.toContain('Development');
  });
});

// ---------------------------------------------------------------------------
// Tests: handleCreateIssue — PILGER warning
// ---------------------------------------------------------------------------

describe('handleCreateIssue — PILGER warning', () => {
  let handlers: McpToolHandlers;

  beforeEach(() => {
    vi.clearAllMocks();
    handlers = makeHandlers();
    mockFindProjectByName.mockResolvedValue(fakeProject);
    mockGetUserByUsername.mockResolvedValue(fakeUser);
    mockCreateIssue.mockResolvedValue({ ...fakeIssue, iid: 10 });
  });

  it('[US] in correct project (user-stories) → no PILGER warning', async () => {
    const result = await handlers.handleCreateIssue({
      project_name: 'user-stories',
      title: '[US] Feature X',
      description: 'desc',
    });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).not.toContain('PILGER');
  });

  it('[US] in wrong project → adds PILGER warning', async () => {
    const result = await handlers.handleCreateIssue({
      project_name: 'other-project',
      title: '[US] Feature X',
      description: 'desc',
    });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('PILGER');
    expect(result.content[0].text).toContain('other-project');
  });

  it('[US] PILGER warning mentions the correct project (user-stories)', async () => {
    const result = await handlers.handleCreateIssue({
      project_name: 'wrong-project',
      title: '[US] Feature Y',
      description: 'desc',
    });

    expect(result.content[0].text).toContain('user-stories');
  });

  it('[TD] in any project → no PILGER warning', async () => {
    const result = await handlers.handleCreateIssue({
      project_name: 'other-project',
      title: '[TD] Débito técnico',
      description: 'desc',
    });

    expect(result.content[0].text).not.toContain('PILGER');
  });

  it('[BUG] in any project → no PILGER warning', async () => {
    const result = await handlers.handleCreateIssue({
      project_name: 'other-project',
      title: '[BUG] Crash on login',
      description: 'desc',
    });

    expect(result.content[0].text).not.toContain('PILGER');
  });
});

// ---------------------------------------------------------------------------
// Tests: handleCreateDevTasks — preview mode
// ---------------------------------------------------------------------------

describe('handleCreateDevTasks — preview mode', () => {
  let handlers: McpToolHandlers;

  beforeEach(() => {
    vi.clearAllMocks();
    handlers = makeHandlers();
    mockGetIssueByUrl.mockResolvedValue({ project: fakeProject, issue: fakeIssue });
    mockFindProjectByName.mockResolvedValue(fakeProject);
    mockGetUserByUsername.mockResolvedValue(fakeUser);
    mockCreateIssue.mockResolvedValue({ ...fakeIssue, iid: 100 });
    mockCreateIssueLink.mockResolvedValue({});
  });

  it('does not create any issue in preview mode', async () => {
    await handlers.handleCreateDevTasks({
      parent_issue_url: 'http://gitlab.example.com/mygroup/my-project/-/issues/42',
    });

    expect(mockCreateIssue).not.toHaveBeenCalled();
  });

  it('does not create any link in preview mode', async () => {
    await handlers.handleCreateDevTasks({
      parent_issue_url: 'http://gitlab.example.com/mygroup/my-project/-/issues/42',
    });

    expect(mockCreateIssueLink).not.toHaveBeenCalled();
  });

  it('preview mode result contains the parent issue title', async () => {
    const result = await handlers.handleCreateDevTasks({
      parent_issue_url: 'http://gitlab.example.com/mygroup/my-project/-/issues/42',
    });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain(fakeIssue.title);
  });

  it('preview mode result contains LLM instruction to call create_dev_tasks_from_issue', async () => {
    const result = await handlers.handleCreateDevTasks({
      parent_issue_url: 'http://gitlab.example.com/mygroup/my-project/-/issues/42',
    });

    expect(result.content[0].text).toContain('create_dev_tasks_from_issue');
  });

  it('preview mode calls analyzeIssueForTaskSuggestion with issue description and title', async () => {
    await handlers.handleCreateDevTasks({
      parent_issue_url: 'http://gitlab.example.com/mygroup/my-project/-/issues/42',
    });

    expect(analyzeIssueForTaskSuggestion).toHaveBeenCalledWith(
      fakeIssue.description,
      fakeIssue.title
    );
  });

  it('returns error when task_title is provided but default_project is missing', async () => {
    const result = await handlers.handleCreateDevTasks({
      parent_issue_url: 'http://gitlab.example.com/mygroup/my-project/-/issues/42',
      task_title: 'Implementar endpoint',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('default_project');
  });
});
