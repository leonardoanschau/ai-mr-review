# 📢 Publicando a Extensão no VS Code Marketplace

## Por que publicar?

- ✅ Usuários instalam com 1 clique pelo VS Code
- ✅ Atualizações automáticas
- ✅ Funciona em **Windows, macOS e Linux** sem modificação
- ✅ Descoberta através do Marketplace

## Pré-requisitos

1. **Conta Microsoft/Azure** (gratuita)
2. **Personal Access Token do Azure DevOps**

## Passo a Passo

### 1. Criar Publisher no Azure DevOps

1. Acesse: https://marketplace.visualstudio.com/manage
2. Clique em "Create publisher"
3. Preencha:
   - **Publisher ID**: `anschauti` (ou outro único)
   - **Display Name**: `Anschau TI`
   - **Email**: seu email

### 2. Criar Personal Access Token

1. Vá para: https://dev.azure.com/
2. User Settings → Personal Access Tokens → New Token
3. Configure:
   - **Name**: `vscode-extension-publishing`
   - **Organization**: All accessible organizations
   - **Expiration**: 90 days (ou mais)
   - **Scopes**: Custom → **Marketplace: Manage** ✅
4. Copy o token (guarde em lugar seguro!)

### 3. Login no vsce

```bash
vsce login AnschauTI
# Cole o Personal Access Token quando solicitado
```

### 4. Publicar

```bash
# Publicando pela primeira vez
npm run publish

# Ou manualmente:
vsce publish
```

### 5. Atualizações Futuras

```bash
# Incrementar versão patch (1.0.0 → 1.0.1)
vsce publish patch

# Incrementar versão minor (1.0.1 → 1.1.0)
vsce publish minor

# Incrementar versão major (1.1.0 → 2.0.0)
vsce publish major

# Ou versão específica
vsce publish 1.2.3
```

## Depois da Publicação

1. **Marketplace Link**: 
   - `https://marketplace.visualstudio.com/items?itemName=AnschauTI.gitlab-mcp`

2. **Instalação via Marketplace**:
   - VS Code → Extensions → Buscar "GitLab MCP Tools"
   - Ou: `code --install-extension AnschauTI.gitlab-mcp`

3. **Verificar publicação**:
   - https://marketplace.visualstudio.com/manage/publishers/AnschauTI

## Cross-Platform: Como Funciona Automaticamente

### ✅ Windows
- Node.js já vem com VS Code
- Extensão roda `node server/dist/server.js`
- Funciona imediatamente

### ✅ macOS
- Node.js já vem com VS Code
- Mesma lógica, mesmo código JavaScript
- Funciona em Intel e ARM (M1/M2/M3)

### ✅ Linux
- Node.js já vem com VS Code
- Mesma lógica, sem dependências externas
- Funciona em qualquer distro

## Diferença da Abordagem Anterior

### ❌ Com Python (antes)
```
Extension
  ├─ bin/
  │  ├─ server-macos-arm64    (30 MB)
  │  ├─ server-macos-intel    (30 MB)
  │  ├─ server-windows.exe    (25 MB)
  │  └─ server-linux          (35 MB)
  └─ Total: ~120 MB
```
- Precisava compilar para cada plataforma
- GitHub Actions com 4+ workflows
- 120 MB de download

### ✅ Com TypeScript (agora)
```
Extension
  └─ server/
     └─ dist/
        └─ *.js files        (50 KB)
```
- 1 código JavaScript funciona em todos OS
- Sem compilação específica por plataforma
- 50 KB de download
- Node.js já está disponível no VS Code

## Vantagens da Migração

| Aspecto | Python | TypeScript/Node.js |
|---------|--------|-------------------|
| Cross-platform | ❌ Requer binários | ✅ Automático |
| Tamanho | 120 MB | 50 KB |
| Build | PyInstaller + GitHub Actions | `tsc` |
| Instalação | Complexa | Simples |
| Manutenção | Difícil | Fácil |
| Atualizações | Recompilar tudo | `npm run build` |

## Troubleshooting

### "Publisher not found"
```bash
# Criar publisher primeiro em:
# https://marketplace.visualstudio.com/manage
```

### "Authentication failed"
```bash
# Fazer login novamente:
vsce login AnschauTI
```

### "Extension already published"
```bash
# Incrementar versão no package.json
# Ou usar: vsce publish patch
```

## Recursos

- [VS Code Publishing Guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [vsce Documentation](https://github.com/microsoft/vscode-vsce)
- [Marketplace Management](https://marketplace.visualstudio.com/manage)
