# GitLab MCP Server (TypeScript)

**Cross-platform** GitLab MCP server implementation in TypeScript.

## 🎯 Advantages over Python version:

- ✅ **Cross-platform**: One codebase runs on macOS, Windows, Linux
- ✅ **No compilation needed**: JavaScript runs natively with Node.js
- ✅ **Smaller footprint**: ~50KB vs ~15-30MB per binary
- ✅ **VS Code integration**: Uses VS Code's bundled Node.js
- ✅ **Easy debugging**: TypeScript support in VS Code
- ✅ **Type-safe**: Full TypeScript typing

## 📁 Structure:

```
server/
├── src/
│   ├── server.ts              # Main entry point
│   ├── gitlab/
│   │   ├── api.ts            # GitLab API client
│   │   ├── projects.ts       # Project search logic
│   │   └── issues.ts         # Issue creation logic
│   ├── mcp/
│   │   ├── protocol.ts       # MCP protocol types
│   │   ├── tools.ts          # Tool definitions
│   │   └── handlers.ts       # Tool handlers
│   ├── templates/
│   │   └── issue-template.ts # Issue template
│   └── utils/
│       ├── config.ts         # Configuration management
│       └── logger.ts         # Logging utility
├── dist/                      # Compiled JavaScript (gitignored in source)
├── package.json
└── tsconfig.json
```

## 🛠️ Development:

```bash
# Install dependencies
cd server
npm install

# Build (TypeScript → JavaScript)
npm run build

# Watch mode (auto-rebuild on changes)
npm run watch

# Clean build artifacts
npm run clean
```

## 🚀 Testing:

Run the server directly:

```bash
export GITLAB_TOKEN="your-token"
export GITLAB_API_URL="https://gitlab.com/api/v4"
export GITLAB_DEFAULT_GROUP="your/group"
export GITLAB_DEFAULT_ASSIGNEE="username"

node dist/server.js
```

Send test JSON-RPC message:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | node dist/server.js
```

## 📦 Packaging:

The extension automatically builds the server during `npm run package`:

```bash
# From extension root
npm run package
```

This compiles both the extension and server, packaging everything into a `.vsix` file.

## 🔍 Code Guidelines:

- ✅ **Small methods**: Each method does one thing well
- ✅ **Descriptive names**: Clear, self-documenting code
- ✅ **Type-safe**: Full TypeScript coverage
- ✅ **Error handling**: Graceful error messages
- ✅ **Logging**: Comprehensive logging to stderr
- ✅ **No side effects**: Pure functions where possible

## 📚 MCP Protocol:

Implements [Model Context Protocol](https://modelcontextprotocol.io) v2024-11-05:

- `initialize` - Server initialization
- `tools/list` - List available tools
- `tools/call` - Execute a tool

## 🔐 Configuration:

Environment variables (provided by VS Code extension):

- `GITLAB_TOKEN` - GitLab Personal Access Token
- `GITLAB_API_URL` - GitLab API URL
- `GITLAB_DEFAULT_GROUP` - Default group path
- `GITLAB_DEFAULT_ASSIGNEE` - Default assignee username
