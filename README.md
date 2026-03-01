# 🚀 GitLab MCP for VS Code

**Version 1.0.0** | MIT License

GitLab productivity tools integrated with GitHub Copilot. Create issues, list projects, and use templates - all with natural language!

## 🖥️ Cross-Platform Support

✅ **macOS** (Intel & Apple Silicon)  
✅ **Windows** (x64 & ARM64)  
✅ **Linux** (x64 & ARM64)

*Works out-of-the-box on all platforms - no Python, no binaries, just JavaScript!*

## ⚡ Architecture

Built with **TypeScript** for maximum compatibility:
- 🌍 **Universal**: One codebase runs everywhere
- 🚀 **Fast startup**: No binary loading overhead  
- 🔧 **Easy debugging**: Native VS Code support
- 📦 **Small footprint**: ~50KB vs ~30MB per binary
- 🔐 **Secure**: Uses VS Code's built-in Node.js

## ✨ Features

- 🎯 **GitLab Issue Creation** - Use natural language with Copilot
- 📋 **Complete Templates** - User Stories, Bugs, Technical Debt
- 🔍 **Project Search** - List all projects recursively
- 📡 **API Contracts** - Request/Response templates included
- 🤖 **Copilot Integration** - AI generates content automatically
- 🔐 **Secure** - Tokens stored encrypted in VS Code Secret Storage

---

## 🎬 Quick Start

### 1️⃣ Installation

**From VS Code Marketplace:**
```
Extensions → Search "GitLab MCP" → Install
```

**From VSIX:**
```bash
code --install-extension gitlab-mcp-1.0.0.vsix
```

### 2️⃣ Configuration

On first run, a wizard will open automatically:

1. **GitLab URL**: Your GitLab API URL (e.g., `https://gitlab.com/api/v4`)
2. **GitLab Token**: Personal access token ([how to get](#-get-gitlab-token))
3. **Default Group**: Optional (e.g., `mycompany/myteam`)
4. **Default Assignee**: Optional (your username)

### 3️⃣ Usage with Copilot

Open **Copilot Chat** (`Ctrl+Shift+I` / `Cmd+Shift+I`):

```
@workspace create a user story in project MyApp about implementing Redis cache
```

```
@workspace list GitLab projects
```

```
@workspace show GitLab issue template
```

**The AI will:**
1. List available projects
2. You choose the project
3. AI generates title and description
4. Creates the issue automatically

---

## 📋 Issue Template

All issues follow a comprehensive template with 9 sections:

- 🎯 **Objective** - What and why
- 📌 **Context** - Current situation
- 📡 **API Contracts** - Request/Response (if applicable)
- 🔗 **Dependencies** - External services, prerequisites
- ✅ **Tasks** - Technical checklist
- ⚡ **Impacts** - Breaking changes, migrations
- ⚠️ **Observations** - Risks and considerations
- 📊 **Success Metrics** - SLAs, monitoring
- ✔️ **Acceptance Criteria** - How to validate

> **Note:** AI evaluates context and includes only relevant sections.

---

## 🔐 Get GitLab Token

1. Go to: Your GitLab → Settings → Access Tokens
2. Click **"Add new token"**
3. Configure:
   - **Name**: `VS Code MCP`
   - **Scopes**: `api`, `read_user`, `write_repository`
   - **Expiration**: 1 year (recommended)
4. **Copy the token** (shown only once!)
5. Paste in the extension wizard

---

## ⚙️ Manual Configuration

**Command Palette** (`Cmd+Shift+P` / `Ctrl+Shift+P`):
```
GitLab MCP: Configure GitLab
```

**Or edit settings manually:**
```json
{
  "gitlabmcp.gitlab.url": "https://gitlab.com/api/v4",
  "gitlabmcp.gitlab.defaultGroup": "mycompany/myteam",
  "gitlabmcp.gitlab.defaultAssignee": "your-username"
}
```

Token via Command Palette: `GitLab MCP: Configure GitLab`

---

## 🛠️ Commands

| Command | Description |
|---------|-------------|
| `GitLab MCP: Configure GitLab` | Open configuration wizard |
| `GitLab MCP: Create GitLab Issue` | Usage tips with Copilot |
| `GitLab MCP: List GitLab Projects` | Usage tips for project search |
| `GitLab MCP: Show Issue Template` | Display complete template |

---

## 🐛 Troubleshooting

### ❌ Server doesn't start

1. Check **Output Channel**: `View → Output → GitLab MCP Server`
2. Verify Python is installed: `python3 --version`
3. Reconfigure: `GitLab MCP: Configure GitLab`

### ❌ Copilot doesn't recognize tools

1. Restart VS Code
2. Check server is running (status bar: ✔️ GitLab MCP)
3. View logs in Output Channel

### ❌ Project not found

Use exact name from list:
```
@workspace list GitLab projects
```
Copy exact project name from returned list.

---

## 📦 Building from Source

```bash
# Clone repository
git clone <your-repo>
cd gitlab-mcp

# Install dependencies
npm install
pip install -r requirements.txt

# Compile TypeScript
npm run compile

# Generate .vsix
npm run package

# Install locally
code --install-extension gitlab-mcp-1.0.0.vsix
```

---

## 📝 Changelog

See CHANGELOG.md for version history.

## 🤝 Contributing

Contributions welcome! Open an issue or submit a pull request.

## 📄 License

MIT License

---

**Questions?** Open an issue on the repository! 🚀

