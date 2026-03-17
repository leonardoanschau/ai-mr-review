# 🚀 GitlabMCP-AnschauTI

**Version 1.1.0** | MIT License

GitLab productivity tools integrated with GitHub Copilot. Automate issue management, code review, and task decomposition - all with natural language!

## 📋 Requirements

- ✅ **GitLab Personal Access Token** with scopes: `api`, `read_user`, `write_repository`
- ✅ **GitHub Copilot** (recommended for AI-powered workflows)

**No additional runtime needed** - The extension uses VS Code's built-in Node.js runtime.

## 🖥️ Cross-Platform Support

✅ **macOS** (Intel & Apple Silicon)  
✅ **Windows** (x64 & ARM64)  
✅ **Linux** (x64 & ARM64)

*Pure TypeScript - works everywhere VS Code runs!*

## 🔧 Available Tools

This extension provides **7 tools** that work seamlessly with GitHub Copilot:

### 📋 Issue Management

**1. list_gitlab_projects**  
Lists all projects in your CRM group. Shows name, ID, and full path. Use this first before creating any issue.

**2. create_gitlab_issue**  
Creates a new GitLab issue. Requires project name, title with prefix ([US], [TD], or [BUG]), and Markdown description. Optional assignee and labels.

**3. update_gitlab_issue**  
Edits an existing issue. Update title, description, assignee, labels, or status (close/reopen). Only modifies the fields you specify.

**4. get_gitlab_issue_template**  
Returns the standard issue template with sections: Description, Acceptance Criteria, Definition of Done, and Notes.

**5. create_dev_tasks_from_issue**  
Automates creation of [DEV] issues from User Stories or Technical Debt. Reads the "## ✅ Tarefas" section, creates one [DEV] issue per checkbox, and links them to the parent issue. **Requires specifying target project.**

### 🔍 Code Review

**6. review_gitlab_merge_request**  
Analyzes a Merge Request using 19 code review rules. Returns a complete report with metadata, quality checklist, and only added lines (+). Marks commentable lines with 💬.

**7. post_merge_request_comments**  
Posts inline comments on specific MR lines. Use after `review_gitlab_merge_request`. **Important:** Only works on added lines (marked with 💬), not context lines.

---

## 🎬 Getting Started

### Installation

Install from the **VS Code Marketplace**:

1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X` / `Cmd+Shift+X`)
3. Search for **"GitlabMCP-AnschauTI"**
4. Click **Install**

### Configuration

On first use, configure your GitLab credentials:

**Command Palette** (`Cmd+Shift+P` / `Ctrl+Shift+P`):
```
GitLab MCP: Configure GitLab
```

You'll need to provide:
1. **GitLab API URL** - Your GitLab API endpoint (e.g., `http://gitlab.company.com/api/v4`)
2. **Personal Access Token** - Token with `api`, `read_user`, `write_repository` scopes
3. **Default Group** (optional) - Your team's namespace (e.g., `company/team`)
4. **Default Assignee** (optional) - Your GitLab username

### Usage with GitHub Copilot

Open **Copilot Chat** and start using natural language:

**Example 1: Create an issue**
```
@workspace list gitlab projects
@workspace create a user story in project authorization-service about improving audit logs
```

**Example 2: Review a merge request**
```
@workspace review merge request !42 from project customer-service
```

**Example 3: Create dev tasks**
```
@workspace create dev tasks from issue #1038 in project authorization-service
```

The AI will guide you through the workflow, showing options and generating content automatically.

---

## 🔐 Getting Your GitLab Token

1. Go to GitLab → **Settings** → **Access Tokens**
2. Click **"Add new token"**
3. Configure:
   - **Name**: `VS Code MCP`
   - **Scopes**: Select `api`, `read_user`, `write_repository`
   - **Expiration**: Set to 1 year (recommended)
4. Click **Create personal access token**
5. **Copy the token** (shown only once!)
6. Paste it in the extension configuration wizard

---

## ⚙️ Manual Configuration

If you need to update your settings later:

**Via Command Palette:**
```
GitLab MCP: Configure GitLab
```

**Or edit VS Code settings:**
```json
{
  "gitlabmcp.gitlab.url": "http://gitlab.company.com/api/v4",
  "gitlabmcp.gitlab.defaultGroup": "company/team",
  "gitlabmcp.gitlab.defaultAssignee": "your-username"
}
```

**Update token via Command Palette:**
```
GitLab MCP: Configure GitLab
```

---

## 🛠️ Available Commands

| Command | Description |
|---------|-------------|
| `GitLab MCP: Configure GitLab` | Open configuration wizard |
| `GitLab MCP: Create GitLab Issue` | Show usage tips with Copilot |
| `GitLab MCP: List GitLab Projects` | Show project search tips |
| `GitLab MCP: Show Issue Template` | Display complete template |

---

## 🐛 Troubleshooting

### ❌ Server doesn't start

1. Check **Output Channel**: `View → Output → GitlabMCP-AnschauTI`
2. Verify Node.js is accessible to VS Code
3. Restart VS Code
4. Reconfigure: `GitLab MCP: Configure GitLab`

### ❌ Copilot doesn't recognize tools

1. Restart VS Code completely
2. Check server status in status bar (should show ✔️ GitlabMCP-AnschauTI)
3. Open Output Channel to view logs: `View → Output → GitlabMCP-AnschauTI`

### ❌ "Project not found" error

Use the exact project name from the list:
```
@workspace list GitLab projects
```
Copy the **exact name** shown in the returned list (case-sensitive).

### ❌ Cannot create [DEV] tasks

Make sure your issue has a section named `## ✅ Tarefas` or `## Tarefas` with checkboxes:
```markdown
## ✅ Tarefas
- [ ] Task 1
- [ ] Task 2
```

You must also specify the target project when creating tasks.

---

## 📝 Issue Template Structure

All issues follow a comprehensive template with these sections:

- 🎯 **Objective** - What needs to be done and why
- 📌 **Context** - Current situation and background
- 📡 **API Contracts** - Request/Response (if applicable)
- 🔗 **Dependencies** - External services, prerequisites
- ✅ **Tasks** - Technical checklist (used by create_dev_tasks_from_issue)
- ⚡ **Impacts** - Breaking changes, migrations
- ⚠️ **Observations** - Risks and considerations
- 📊 **Success Metrics** - SLAs, monitoring
- ✔️ **Acceptance Criteria** - How to validate completion

> **Note:** GitHub Copilot automatically includes only relevant sections based on context.

---

## 📄 License

MIT License - See LICENSE file for details.

---

**Made with ❤️ for GitLab + GitHub Copilot users**

*Questions or issues? Open an issue on the repository!* 🚀
