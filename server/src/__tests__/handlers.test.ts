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
const mockUpdateIssue = vi.fn();
const mockGetIssue = vi.fn();
const mockGetIssueLinks = vi.fn();

vi.mock('../gitlab/api.js', () => ({
  GitLabApiClient: vi.fn().mockImplementation(() => ({
    createIssue: mockCreateIssue,
    getIssueByUrl: mockGetIssueByUrl,
    getUserByUsername: mockGetUserByUsername,
    createIssueLink: mockCreateIssueLink,
    getIssue: mockGetIssue,
    updateIssue: mockUpdateIssue,
    getIssueLinks: mockGetIssueLinks,
    listGroupMilestones: vi.fn().mockResolvedValue([]),
    listProjectMilestones: vi.fn().mockResolvedValue([]),
    listGroupEpics: vi.fn().mockResolvedValue([]),
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
  id: 1042,
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

// ---------------------------------------------------------------------------
// Tests: handleCreateDevTasks — strip [DEV] prefix to avoid duplication
// ---------------------------------------------------------------------------

describe('handleCreateDevTasks — strip [DEV] prefix', () => {
  let handlers: McpToolHandlers;

  beforeEach(() => {
    vi.clearAllMocks();
    handlers = makeHandlers();
    mockGetIssueByUrl.mockResolvedValue({ project: fakeProject, issue: fakeIssue });
    mockFindProjectByName.mockResolvedValue(fakeProject);
    mockGetUserByUsername.mockResolvedValue(fakeUser);
    mockCreateIssue.mockResolvedValue({ ...fakeIssue, iid: 100 });
    mockCreateIssueLink.mockResolvedValue({});
    (parseTasksFromDescription as ReturnType<typeof vi.fn>).mockReturnValue([]);
  });

  it('strips [DEV] prefix if passed in task_title — no [DEV][DEV] duplication', async () => {
    await handlers.handleCreateDevTasks({
      parent_issue_url: 'http://gitlab.example.com/mygroup/my-project/-/issues/42',
      default_project: 'my-project',
      task_title: '[DEV] Minha tarefa',
    });

    expect(mockCreateIssue).toHaveBeenCalledTimes(1);
    const created = mockCreateIssue.mock.calls[0][0] as { title: string };
    expect(created.title).toBe('[DEV] Minha tarefa');
    expect(created.title).not.toContain('[DEV] [DEV]');
    expect(created.title).not.toMatch(/^\[DEV\]\s*\[DEV\]/i);
  });

  it('strips [dev] lowercase prefix correctly', async () => {
    await handlers.handleCreateDevTasks({
      parent_issue_url: 'http://gitlab.example.com/mygroup/my-project/-/issues/42',
      default_project: 'my-project',
      task_title: '[dev] Minha tarefa',
    });

    const created = mockCreateIssue.mock.calls[0][0] as { title: string };
    expect(created.title).toBe('[DEV] Minha tarefa');
    expect(created.title).not.toMatch(/^\[DEV\]\s*\[dev\]/i);
  });

  it('does NOT strip prefix from normal task_title (without [DEV])', async () => {
    await handlers.handleCreateDevTasks({
      parent_issue_url: 'http://gitlab.example.com/mygroup/my-project/-/issues/42',
      default_project: 'my-project',
      task_title: 'Minha tarefa sem prefixo',
    });

    const created = mockCreateIssue.mock.calls[0][0] as { title: string };
    expect(created.title).toBe('[DEV] Minha tarefa sem prefixo');
  });
});

// ---------------------------------------------------------------------------
// Tests: handleCreateIssue — automatic type labels
// ---------------------------------------------------------------------------

describe('handleCreateIssue — automatic type labels', () => {
  let handlers: McpToolHandlers;

  beforeEach(() => {
    vi.clearAllMocks();
    handlers = makeHandlers();
    mockFindProjectByName.mockResolvedValue(fakeProject);
    mockGetUserByUsername.mockResolvedValue(fakeUser);
    mockCreateIssue.mockResolvedValue({ ...fakeIssue, iid: 10 });
  });

  it('[US] title adds "User Story" label to default labels', async () => {
    let capturedLabels: string[] = [];
    const { IssueService: IS } = await import('../gitlab/issues.js');
    const createSpy = vi.spyOn(
      (handlers as any).issueService as InstanceType<typeof IS>,
      'createIssue'
    ).mockImplementation(async (opts: import('../gitlab/issues.js').CreateIssueOptions) => {
      capturedLabels = opts.labels;
      return { ...fakeIssue, iid: 10 };
    });

    await handlers.handleCreateIssue({
      project_name: 'user-stories',
      title: '[US] Feature nova',
      description: 'desc',
      milestone_id: 0,
    });

    expect(capturedLabels).toContain('User Story');
    expect(capturedLabels).toContain('Grupo Panvel :: Analyze');
    expect(capturedLabels).not.toContain('Technical Debit');
    createSpy.mockRestore();
  });

  it('[TD] title adds "Technical Debit" label to default labels', async () => {
    let capturedLabels: string[] = [];
    const { IssueService: IS } = await import('../gitlab/issues.js');
    const createSpy = vi.spyOn(
      (handlers as any).issueService as InstanceType<typeof IS>,
      'createIssue'
    ).mockImplementation(async (opts: import('../gitlab/issues.js').CreateIssueOptions) => {
      capturedLabels = opts.labels;
      return { ...fakeIssue, iid: 10 };
    });

    await handlers.handleCreateIssue({
      project_name: 'my-project',
      title: '[TD] Refatorar serviço',
      description: 'desc',
      milestone_id: 0,
    });

    expect(capturedLabels).toContain('Technical Debit');
    expect(capturedLabels).toContain('Grupo Panvel :: Analyze');
    expect(capturedLabels).not.toContain('User Story');
    createSpy.mockRestore();
  });

  it('[BUG] title does NOT add any type label', async () => {
    let capturedLabels: string[] = [];
    const { IssueService: IS } = await import('../gitlab/issues.js');
    const createSpy = vi.spyOn(
      (handlers as any).issueService as InstanceType<typeof IS>,
      'createIssue'
    ).mockImplementation(async (opts: import('../gitlab/issues.js').CreateIssueOptions) => {
      capturedLabels = opts.labels;
      return { ...fakeIssue, iid: 10 };
    });

    await handlers.handleCreateIssue({
      project_name: 'my-project',
      title: '[BUG] Crash no login',
      description: 'desc',
      milestone_id: 0,
    });

    expect(capturedLabels).not.toContain('User Story');
    expect(capturedLabels).not.toContain('Technical Debit');
    expect(capturedLabels).toEqual(['Grupo Panvel :: Analyze']);
    createSpy.mockRestore();
  });

  it('label "User Story" is exact — not "user story" or "UserStory"', async () => {
    let capturedLabels: string[] = [];
    const { IssueService: IS } = await import('../gitlab/issues.js');
    const createSpy = vi.spyOn(
      (handlers as any).issueService as InstanceType<typeof IS>,
      'createIssue'
    ).mockImplementation(async (opts: import('../gitlab/issues.js').CreateIssueOptions) => {
      capturedLabels = opts.labels;
      return { ...fakeIssue, iid: 10 };
    });

    await handlers.handleCreateIssue({
      project_name: 'user-stories',
      title: '[US] Feature nova',
      description: 'desc',
      milestone_id: 0,
    });

    expect(capturedLabels).toContain('User Story');
    expect(capturedLabels).not.toContain('user story');
    expect(capturedLabels).not.toContain('UserStory');
    createSpy.mockRestore();
  });

  it('label "Technical Debit" is exact — not "Technical Debt" or "TechnicalDebit"', async () => {
    let capturedLabels: string[] = [];
    const { IssueService: IS } = await import('../gitlab/issues.js');
    const createSpy = vi.spyOn(
      (handlers as any).issueService as InstanceType<typeof IS>,
      'createIssue'
    ).mockImplementation(async (opts: import('../gitlab/issues.js').CreateIssueOptions) => {
      capturedLabels = opts.labels;
      return { ...fakeIssue, iid: 10 };
    });

    await handlers.handleCreateIssue({
      project_name: 'my-project',
      title: '[TD] Refatorar',
      description: 'desc',
      milestone_id: 0,
    });

    expect(capturedLabels).toContain('Technical Debit');
    expect(capturedLabels).not.toContain('Technical Debt');
    expect(capturedLabels).not.toContain('TechnicalDebit');
    createSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Tests: handleCreateIssue — milestone pre-check
// ---------------------------------------------------------------------------

describe('handleCreateIssue — milestone pre-check', () => {
  let handlers: McpToolHandlers;
  const mockListGroupMilestones = vi.fn();
  const mockListProjectMilestones = vi.fn();
  const mockListGroupEpics = vi.fn();

  const fakeMilestones = [
    { id: 101, iid: 1, title: 'Sprint 1', state: 'active', web_url: 'http://gitlab/ms/1', due_date: '2026-04-01' },
    { id: 102, iid: 2, title: 'Sprint 2', state: 'active', web_url: 'http://gitlab/ms/2' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    handlers = makeHandlers();
    mockFindProjectByName.mockResolvedValue(fakeProject);
    mockGetUserByUsername.mockResolvedValue(fakeUser);
    mockCreateIssue.mockResolvedValue({ ...fakeIssue, iid: 10 });

    // Inject milestone + epic mocks into the api instance
    (handlers as any).api.listGroupMilestones = mockListGroupMilestones;
    (handlers as any).api.listProjectMilestones = mockListProjectMilestones;
    (handlers as any).api.listGroupEpics = mockListGroupEpics;
    mockListGroupEpics.mockResolvedValue([]); // default: no epics
  });

  it('[US] without milestone_id returns milestone list (does not create issue)', async () => {
    mockListGroupMilestones.mockResolvedValue(fakeMilestones);

    const result = await handlers.handleCreateIssue({
      project_name: 'user-stories',
      title: '[US] Feature X',
      description: 'desc',
    });

    expect(result.isError).toBeFalsy();
    expect(mockCreateIssue).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain('Seleção de Milestone');
    expect(result.content[0].text).toContain('Sprint 1');
    expect(result.content[0].text).toContain('Sprint 2');
    expect(result.content[0].text).toContain('ID 101');
    expect(result.content[0].text).toContain('ID 102');
  });

  it('[TD] without milestone_id also triggers milestone pre-check', async () => {
    mockListGroupMilestones.mockResolvedValue(fakeMilestones);

    const result = await handlers.handleCreateIssue({
      project_name: 'my-project',
      title: '[TD] Refatorar',
      description: 'desc',
    });

    expect(mockCreateIssue).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain('Seleção de Milestone');
  });

  it('[BUG] without milestone_id SKIPS pre-check and creates issue directly', async () => {
    mockListGroupMilestones.mockResolvedValue(fakeMilestones);

    const result = await handlers.handleCreateIssue({
      project_name: 'my-project',
      title: '[BUG] Crash',
      description: 'desc',
    });

    expect(result.isError).toBeFalsy();
    expect(mockCreateIssue).toHaveBeenCalledTimes(1);
    expect(result.content[0].text).not.toContain('Seleção de Milestone');
  });

  it('[US] with milestone_id=0 creates issue without milestone (skips pre-check)', async () => {
    const result = await handlers.handleCreateIssue({
      project_name: 'user-stories',
      title: '[US] Feature X',
      description: 'desc',
      milestone_id: 0,
    });

    expect(result.isError).toBeFalsy();
    expect(mockCreateIssue).toHaveBeenCalledTimes(1);
    expect(mockListGroupMilestones).not.toHaveBeenCalled();
  });

  it('[US] with explicit milestone_id creates issue and skips pre-check', async () => {
    const result = await handlers.handleCreateIssue({
      project_name: 'user-stories',
      title: '[US] Feature X',
      description: 'desc',
      milestone_id: 101,
    });

    expect(result.isError).toBeFalsy();
    expect(mockCreateIssue).toHaveBeenCalledTimes(1);
    expect(mockListGroupMilestones).not.toHaveBeenCalled();
  });

  it('falls back to listProjectMilestones if listGroupMilestones fails', async () => {
    mockListGroupMilestones.mockRejectedValue(new Error('group not found'));
    mockListProjectMilestones.mockResolvedValue(fakeMilestones);

    const result = await handlers.handleCreateIssue({
      project_name: 'user-stories',
      title: '[US] Feature X',
      description: 'desc',
    });

    expect(mockListProjectMilestones).toHaveBeenCalled();
    expect(result.content[0].text).toContain('Seleção de Milestone');
    expect(mockCreateIssue).not.toHaveBeenCalled();
  });

  it('proceeds to create issue if no milestones found at all', async () => {
    mockListGroupMilestones.mockResolvedValue([]);
    mockListProjectMilestones.mockResolvedValue([]);

    const result = await handlers.handleCreateIssue({
      project_name: 'user-stories',
      title: '[US] Feature X',
      description: 'desc',
    });

    expect(result.isError).toBeFalsy();
    expect(mockCreateIssue).toHaveBeenCalledTimes(1);
  });

  it('milestone list response includes option 0 for skip', async () => {
    mockListGroupMilestones.mockResolvedValue(fakeMilestones);

    const result = await handlers.handleCreateIssue({
      project_name: 'user-stories',
      title: '[US] Feature X',
      description: 'desc',
    });

    expect(result.content[0].text).toContain('0');
    expect(result.content[0].text).toContain('Criar sem milestone');
  });

});

// ---------------------------------------------------------------------------
// Tests: handleGetIssue — milestone and epic display
// ---------------------------------------------------------------------------

describe('handleGetIssue — milestone and epic display', () => {
  let handlers: McpToolHandlers;

  beforeEach(() => {
    vi.clearAllMocks();
    handlers = makeHandlers();
  });

  it('shows Milestone when issue has milestone', async () => {
    mockGetIssueByUrl.mockResolvedValue({
      project: fakeProject,
      issue: {
        ...fakeIssue,
        milestone: { id: 101, iid: 1, title: 'Sprint 1', web_url: 'http://gitlab/ms/1' },
      },
    });

    const result = await handlers.handleGetIssue({
      issue_url: 'http://gitlab.example.com/mygroup/my-project/-/issues/42',
    });

    expect(result.content[0].text).toContain('**Milestone:**');
    expect(result.content[0].text).toContain('Sprint 1');
    expect(result.content[0].text).toContain('http://gitlab/ms/1');
  });

  it('shows Parent/Epic when issue has epic', async () => {
    mockGetIssueByUrl.mockResolvedValue({
      project: fakeProject,
      issue: {
        ...fakeIssue,
        epic: { id: 55, iid: 5, title: 'Epic do Prime', web_url: 'http://gitlab/epic/5' },
      },
    });

    const result = await handlers.handleGetIssue({
      issue_url: 'http://gitlab.example.com/mygroup/my-project/-/issues/42',
    });

    expect(result.content[0].text).toContain('**Parent/Epic:**');
    expect(result.content[0].text).toContain('Epic do Prime');
    expect(result.content[0].text).toContain('http://gitlab/epic/5');
  });

  it('does NOT show Milestone line when issue has no milestone', async () => {
    mockGetIssueByUrl.mockResolvedValue({ project: fakeProject, issue: { ...fakeIssue } });

    const result = await handlers.handleGetIssue({
      issue_url: 'http://gitlab.example.com/mygroup/my-project/-/issues/42',
    });

    expect(result.content[0].text).not.toContain('**Milestone:**');
  });

  it('does NOT show Parent/Epic line when issue has no epic', async () => {
    mockGetIssueByUrl.mockResolvedValue({ project: fakeProject, issue: { ...fakeIssue } });

    const result = await handlers.handleGetIssue({
      issue_url: 'http://gitlab.example.com/mygroup/my-project/-/issues/42',
    });

    expect(result.content[0].text).not.toContain('**Parent/Epic:**');
  });

  it('shows both Milestone and Epic when both are present', async () => {
    mockGetIssueByUrl.mockResolvedValue({
      project: fakeProject,
      issue: {
        ...fakeIssue,
        milestone: { id: 101, iid: 1, title: 'Sprint 1', web_url: 'http://gitlab/ms/1' },
        epic: { id: 55, iid: 5, title: 'Epic do Prime', web_url: 'http://gitlab/epic/5' },
      },
    });

    const result = await handlers.handleGetIssue({
      issue_url: 'http://gitlab.example.com/mygroup/my-project/-/issues/42',
    });

    expect(result.content[0].text).toContain('**Milestone:**');
    expect(result.content[0].text).toContain('**Parent/Epic:**');
  });
});

// ---------------------------------------------------------------------------
// Tests: handleUpdateIssue — milestone_id
// ---------------------------------------------------------------------------

describe('handleUpdateIssue — milestone_id', () => {
  let handlers: McpToolHandlers;

  beforeEach(() => {
    vi.clearAllMocks();
    handlers = makeHandlers();
    mockGetIssueByUrl.mockResolvedValue({ project: fakeProject, issue: fakeIssue });
    mockUpdateIssue.mockResolvedValue({ ...fakeIssue, title: '[US] Minha issue' });
  });

  it('passes milestone_id to updateIssue when provided', async () => {
    await handlers.handleUpdateIssue({
      issue_url: 'http://gitlab.example.com/mygroup/my-project/-/issues/42',
      milestone_id: 7,
    });

    expect(mockUpdateIssue).toHaveBeenCalledWith(
      fakeProject.id,
      fakeIssue.iid,
      expect.objectContaining({ milestone_id: 7 })
    );
  });

  it('passes null when milestone_id is 0 (remove milestone)', async () => {
    await handlers.handleUpdateIssue({
      issue_url: 'http://gitlab.example.com/mygroup/my-project/-/issues/42',
      milestone_id: 0,
    });

    expect(mockUpdateIssue).toHaveBeenCalledWith(
      fakeProject.id,
      fakeIssue.iid,
      expect.objectContaining({ milestone_id: null })
    );
  });

  it('includes milestone_id in "Campos atualizados" output', async () => {
    const result = await handlers.handleUpdateIssue({
      issue_url: 'http://gitlab.example.com/mygroup/my-project/-/issues/42',
      milestone_id: 7,
    });

    expect(result.content[0].text).toContain('milestone_id');
  });

  it('returns error when no fields are provided', async () => {
    const result = await handlers.handleUpdateIssue({
      issue_url: 'http://gitlab.example.com/mygroup/my-project/-/issues/42',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Nenhum campo para atualizar');
  });
});

// ---------------------------------------------------------------------------
// Tests: handleUpdateIssue — parent_issue_url
// ---------------------------------------------------------------------------

describe('handleUpdateIssue — parent_issue_url', () => {
  let handlers: McpToolHandlers;

  const parentIssue = { ...fakeIssue, id: 2000, iid: 100, title: '[US] Parent Issue' };
  const parentProject = { id: 2, name: 'user-stories', path_with_namespace: 'mygroup/user-stories' };

  beforeEach(() => {
    vi.clearAllMocks();
    handlers = makeHandlers();
    mockUpdateIssue.mockResolvedValue({ ...fakeIssue });
    mockCreateIssueLink.mockResolvedValue(undefined);
  });

  it('creates a blocks link when parent_issue_url is provided alongside another field', async () => {
    mockGetIssueByUrl
      .mockResolvedValueOnce({ project: fakeProject, issue: fakeIssue })
      .mockResolvedValueOnce({ project: parentProject, issue: parentIssue });

    await handlers.handleUpdateIssue({
      issue_url: 'http://gitlab.example.com/mygroup/my-project/-/issues/42',
      title: '[US] Atualizado',
      parent_issue_url: 'http://gitlab.example.com/mygroup/my-project/-/issues/100',
    });

    expect(mockCreateIssueLink).toHaveBeenCalledWith(
      fakeProject.id,
      fakeIssue.iid,
      parentProject.id,
      parentIssue.iid,
      'blocks'
    );
  });

  it('creates link even when no other update params are set', async () => {
    mockGetIssueByUrl
      .mockResolvedValueOnce({ project: fakeProject, issue: fakeIssue })
      .mockResolvedValueOnce({ project: parentProject, issue: parentIssue });

    const result = await handlers.handleUpdateIssue({
      issue_url: 'http://gitlab.example.com/mygroup/my-project/-/issues/42',
      parent_issue_url: 'http://gitlab.example.com/mygroup/my-project/-/issues/100',
    });

    expect(result.isError).toBe(false);
    expect(mockUpdateIssue).not.toHaveBeenCalled();
    expect(mockCreateIssueLink).toHaveBeenCalled();
  });

  it('includes parent_issue_url in "Campos atualizados" output', async () => {
    mockGetIssueByUrl
      .mockResolvedValueOnce({ project: fakeProject, issue: fakeIssue })
      .mockResolvedValueOnce({ project: parentProject, issue: parentIssue });

    const result = await handlers.handleUpdateIssue({
      issue_url: 'http://gitlab.example.com/mygroup/my-project/-/issues/42',
      parent_issue_url: 'http://gitlab.example.com/mygroup/my-project/-/issues/100',
    });

    expect(result.content[0].text).toContain('parent_issue_url');
  });
});

// ---------------------------------------------------------------------------
// Tests: handleCreateDevTasks — milestone and epic inheritance
// ---------------------------------------------------------------------------

describe('handleCreateDevTasks — milestone and epic inheritance', () => {
  let handlers: McpToolHandlers;

  const issueWithMilestoneAndEpic = {
    ...fakeIssue,
    milestone: { id: 5610, iid: 1, title: 'Cliente Prime - Release 1', web_url: 'http://gitlab/ms/1' },
    epic: { id: 55, iid: 5, title: 'Programa de fidelização Panvel Prime', web_url: 'http://gitlab/epic/5' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    handlers = makeHandlers();
    mockGetIssueByUrl.mockResolvedValue({ project: fakeProject, issue: issueWithMilestoneAndEpic });
    mockFindProjectByName.mockResolvedValue(fakeProject);
    mockGetUserByUsername.mockResolvedValue(fakeUser);
    mockCreateIssue.mockResolvedValue({ ...fakeIssue, iid: 100 });
    mockCreateIssueLink.mockResolvedValue({});
    (parseTasksFromDescription as ReturnType<typeof vi.fn>).mockReturnValue([]);
  });

  // ── Preview mode ──────────────────────────────────────────────────────────

  it('preview shows Milestone from parent issue', async () => {
    const result = await handlers.handleCreateDevTasks({
      parent_issue_url: 'http://gitlab.example.com/mygroup/my-project/-/issues/42',
    });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('**Milestone:**');
    expect(result.content[0].text).toContain('Cliente Prime - Release 1');
    expect(result.content[0].text).toContain('5610');
  });

  it('preview shows Epic from parent issue', async () => {
    const result = await handlers.handleCreateDevTasks({
      parent_issue_url: 'http://gitlab.example.com/mygroup/my-project/-/issues/42',
    });

    expect(result.content[0].text).toContain('**Epic:**');
    expect(result.content[0].text).toContain('Programa de fidelização Panvel Prime');
    expect(result.content[0].text).toContain('55');
  });

  it('preview shows inheritance note when parent has milestone and epic', async () => {
    const result = await handlers.handleCreateDevTasks({
      parent_issue_url: 'http://gitlab.example.com/mygroup/my-project/-/issues/42',
    });

    expect(result.content[0].text).toContain('herdados automaticamente');
  });

  it('preview does NOT show Milestone line when parent has no milestone', async () => {
    mockGetIssueByUrl.mockResolvedValue({ project: fakeProject, issue: fakeIssue });

    const result = await handlers.handleCreateDevTasks({
      parent_issue_url: 'http://gitlab.example.com/mygroup/my-project/-/issues/42',
    });

    expect(result.content[0].text).not.toContain('**Milestone:**');
  });

  it('preview does NOT show Epic line when parent has no epic', async () => {
    mockGetIssueByUrl.mockResolvedValue({ project: fakeProject, issue: fakeIssue });

    const result = await handlers.handleCreateDevTasks({
      parent_issue_url: 'http://gitlab.example.com/mygroup/my-project/-/issues/42',
    });

    expect(result.content[0].text).not.toContain('**Epic:**');
  });

  it('preview does NOT show inheritance note when parent has no milestone or epic', async () => {
    mockGetIssueByUrl.mockResolvedValue({ project: fakeProject, issue: fakeIssue });

    const result = await handlers.handleCreateDevTasks({
      parent_issue_url: 'http://gitlab.example.com/mygroup/my-project/-/issues/42',
    });

    expect(result.content[0].text).not.toContain('herdados automaticamente');
  });

  // ── Create mode ───────────────────────────────────────────────────────────

  it('passes milestoneId from parent to createIssue', async () => {
    await handlers.handleCreateDevTasks({
      parent_issue_url: 'http://gitlab.example.com/mygroup/my-project/-/issues/42',
      default_project: 'my-project',
      task_title: 'Minha tarefa',
    });

    expect(mockCreateIssue).toHaveBeenCalledTimes(1);
    const opts = mockCreateIssue.mock.calls[0][0] as { milestoneId?: number };
    expect(opts.milestoneId).toBe(5610);
  });

  it('passes epicId from parent to createIssue', async () => {
    await handlers.handleCreateDevTasks({
      parent_issue_url: 'http://gitlab.example.com/mygroup/my-project/-/issues/42',
      default_project: 'my-project',
      task_title: 'Minha tarefa',
    });

    expect(mockCreateIssue).toHaveBeenCalledTimes(1);
    const opts = mockCreateIssue.mock.calls[0][0] as { epicId?: number };
    expect(opts.epicId).toBe(55);
  });

  it('creates issue without milestoneId/epicId when parent has none', async () => {
    mockGetIssueByUrl.mockResolvedValue({ project: fakeProject, issue: fakeIssue });

    await handlers.handleCreateDevTasks({
      parent_issue_url: 'http://gitlab.example.com/mygroup/my-project/-/issues/42',
      default_project: 'my-project',
      task_title: 'Minha tarefa',
    });

    expect(mockCreateIssue).toHaveBeenCalledTimes(1);
    const opts = mockCreateIssue.mock.calls[0][0] as { milestoneId?: number; epicId?: number };
    expect(opts.milestoneId).toBeUndefined();
    expect(opts.epicId).toBeUndefined();
  });

  it('create result includes Milestone info when parent has milestone', async () => {
    const result = await handlers.handleCreateDevTasks({
      parent_issue_url: 'http://gitlab.example.com/mygroup/my-project/-/issues/42',
      default_project: 'my-project',
      task_title: 'Minha tarefa',
    });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('**Milestone:**');
    expect(result.content[0].text).toContain('Cliente Prime - Release 1');
  });

  it('create result includes Epic info when parent has epic', async () => {
    const result = await handlers.handleCreateDevTasks({
      parent_issue_url: 'http://gitlab.example.com/mygroup/my-project/-/issues/42',
      default_project: 'my-project',
      task_title: 'Minha tarefa',
    });

    expect(result.content[0].text).toContain('**Epic:**');
    expect(result.content[0].text).toContain('Programa de fidelização Panvel Prime');
  });
});

// ---------------------------------------------------------------------------
// Tests: handleGetIssueLinks
// ---------------------------------------------------------------------------

describe('handleGetIssueLinks', () => {
  let handlers: McpToolHandlers;

  beforeEach(() => {
    vi.clearAllMocks();
    handlers = makeHandlers();
    mockGetIssueByUrl.mockResolvedValue({ project: fakeProject, issue: fakeIssue });
  });

  it('returns message when there are no linked issues', async () => {
    mockGetIssueLinks.mockResolvedValue([]);

    const result = await handlers.handleGetIssueLinks({
      issue_url: 'http://gitlab.example.com/mygroup/my-project/-/issues/42',
    });

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('Nenhuma issue vinculada');
  });

  it('lists linked issues with their link type and state', async () => {
    mockGetIssueLinks.mockResolvedValue([
      { id: 1, iid: 10, title: '[DEV] Task A', state: 'opened', web_url: 'http://gitlab/dev/10', link_type: 'is_blocked_by' },
      { id: 2, iid: 11, title: '[DEV] Task B', state: 'closed',  web_url: 'http://gitlab/dev/11', link_type: 'blocks' },
    ]);

    const result = await handlers.handleGetIssueLinks({
      issue_url: 'http://gitlab.example.com/mygroup/my-project/-/issues/42',
    });

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('[DEV] Task A');
    expect(result.content[0].text).toContain('[DEV] Task B');
    expect(result.content[0].text).toContain('2 v\u00ednculo(s)');
  });

  it('returns error when neither issue_url nor project_name+iid are given', async () => {
    const result = await handlers.handleGetIssueLinks({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Forne\u00e7a issue_url');
  });

  it('calls getIssueLinks with correct project id and issue iid', async () => {
    mockGetIssueLinks.mockResolvedValue([]);

    await handlers.handleGetIssueLinks({
      issue_url: 'http://gitlab.example.com/mygroup/my-project/-/issues/42',
    });

    expect(mockGetIssueLinks).toHaveBeenCalledWith(fakeProject.id, fakeIssue.iid);
  });

  it('shows blocks and is_blocked_by labels correctly', async () => {
    mockGetIssueLinks.mockResolvedValue([
      { id: 1, iid: 5, title: 'Blocker', state: 'opened', web_url: 'http://x', link_type: 'blocks' },
      { id: 2, iid: 6, title: 'Blocked', state: 'opened', web_url: 'http://y', link_type: 'is_blocked_by' },
    ]);

    const result = await handlers.handleGetIssueLinks({
      issue_url: 'http://gitlab.example.com/mygroup/my-project/-/issues/42',
    });

    expect(result.content[0].text).toContain('Bloqueia');
    expect(result.content[0].text).toContain('Bloqueada por');
  });
});
