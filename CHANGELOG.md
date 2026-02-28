# Changelog

All notable changes to the GitLab MCP extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-02-26

### ✨ Added
- GitLab integration via MCP Server
- Create GitLab issues with pre-configured templates
- List projects from GitLab groups (recursive)
- Default template for User Stories with 9 sections:
  - Objective
  - Context
  - API Contracts (Request/Response)
  - Dependencies
  - Tasks
  - Impacts and Compatibility
  - Observations
  - Success Metrics
  - Acceptance Criteria
- Configuration wizard on first run
- Secure token storage in VS Code Secret Storage
- GitHub Copilot integration for content generation
- Output channel for MCP server logs
- Status bar indicator when server is active

### 🔐 Security
- GitLab tokens stored encrypted
- No credentials exposed in code
- Sensitive variables not versioned

### 📚 Documentation
- Complete README with installation instructions
- GitLab token setup guide
- Usage examples with Copilot

### 🛠️ Commands
- `GitLab MCP: Configure GitLab` - Open configuration wizard
- `GitLab MCP: Create GitLab Issue` - Usage tips with Copilot
- `GitLab MCP: List GitLab Projects` - Usage tips for project search
- `GitLab MCP: Show Issue Template` - Display complete template

