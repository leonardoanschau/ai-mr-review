# 🎨 Ícone da Extensão

A extensão precisa de um arquivo `icon.png` na raiz do projeto.

## Requisitos:

- **Formato**: PNG
- **Tamanho**: 128x128 pixels (recomendado)
- **Transparência**: Suportada
- **Nome**: `icon.png`

## Opções:

### 1. Criar ícone customizado

Use ferramentas como:
- [Figma](https://figma.com)
- [Canva](https://canva.com)
- [Photoshop](https://adobe.com/photoshop)

**Sugestão de design:**
- Logo Panvel + elemento GitLab
- Cores corporativas
- Fundo transparente

### 2. Usar ícone temporário

Enquanto não tiver um ícone oficial, você pode:

**Opção A: Remover do package.json**
```json
// Remova esta linha:
"icon": "icon.png",
```

**Opção B: Usar ícone genérico**
- Baixe um ícone de https://icons8.com ou https://flaticon.com
- Renomeie para `icon.png`
- Coloque na raiz do projeto

### 3. Exemplo de conversão

Se você tem um logo SVG:

```bash
# Instale ImageMagick
brew install imagemagick

# Converta
convert logo.svg -resize 128x128 icon.png
```

## Após adicionar o ícone:

```bash
# Rebuild da extensão
npm run package

# O ícone aparecerá no VS Code marketplace
```

---

**Nota:** O ícone NÃO é obrigatório para build local, apenas recomendado para distribuição pública.
