/**
 * Semantic Code Parser
 * Detecta blocos de métodos/funções e extrai contexto completo
 */

export interface MethodBlock {
  name: string;
  signature: string;
  startLine: number;
  endLine: number;
  language: string;
  isNew: boolean;
  isModified: boolean;
  addedLines: number[];  // Linhas comentáveis
  fullCode: string;
  contextBefore: string[];
  contextAfter: string[];
}

export interface ParsedDiff {
  filePath: string;
  language: string;
  methods: MethodBlock[];
  standaloneChanges: MethodBlock[];  // Mudanças fora de métodos
}

export class CodeParser {
  /**
   * Detecta linguagem pelo caminho do arquivo
   */
  static detectLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    const langMap: Record<string, string> = {
      'java': 'java',
      'js': 'javascript',
      'jsx': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'py': 'python',
      'rb': 'ruby',
      'go': 'go',
      'cs': 'csharp',
      'cpp': 'cpp',
      'c': 'c',
      'php': 'php',
      'kt': 'kotlin',
      'swift': 'swift',
    };
    return langMap[ext] || 'text';
  }

  /**
   * Parseia diff e extrai contexto semântico de métodos
   */
  static parseDiff(diff: string, filePath: string): ParsedDiff {
    const language = this.detectLanguage(filePath);
    
    // Reconstrói o arquivo após aplicar o diff
    const fileContent = this.reconstructFileFromDiff(diff);
    const addedLines = this.extractAddedLineNumbers(diff);
    
    // Detecta métodos/funções
    const methods = this.detectMethods(fileContent, language, addedLines);
    
    // Mudanças standalone (fora de métodos)
    const standaloneChanges = this.detectStandaloneChanges(fileContent, language, addedLines, methods);
    
    return {
      filePath,
      language,
      methods,
      standaloneChanges,
    };
  }

  /**
   * Reconstrói o arquivo após aplicar o diff (versão nova)
   */
  private static reconstructFileFromDiff(diff: string): string[] {
    const lines = diff.split('\n');
    const result: string[] = [];
    let currentLine = 0;

    for (const line of lines) {
      if (line.startsWith('@@')) {
        const match = line.match(/\+(\d+)/);
        if (match) {
          currentLine = parseInt(match[1], 10);
        }
        continue;
      }

      // Linhas adicionadas ou mantidas vão para o arquivo final
      if (line.startsWith('+') && !line.startsWith('+++')) {
        result[currentLine - 1] = line.substring(1); // Remove o '+'
        currentLine++;
      } else if (line.startsWith(' ')) {
        result[currentLine - 1] = line.substring(1); // Remove o ' '
        currentLine++;
      }
      // Linhas removidas (com -) são ignoradas
    }

    return result.filter(l => l !== undefined);
  }

  /**
   * Extrai números das linhas adicionadas
   */
  private static extractAddedLineNumbers(diff: string): number[] {
    const lines = diff.split('\n');
    const addedLines: number[] = [];
    let currentLine = 0;

    for (const line of lines) {
      if (line.startsWith('@@')) {
        const match = line.match(/\+(\d+)/);
        if (match) {
          currentLine = parseInt(match[1], 10) - 1;
        }
        continue;
      }

      if (line.startsWith('+') && !line.startsWith('+++')) {
        currentLine++;
        addedLines.push(currentLine);
      } else if (line.startsWith(' ')) {
        currentLine++;
      }
    }

    return addedLines;
  }

  /**
   * Detecta métodos/funções no código
   */
  private static detectMethods(
    fileContent: string[],
    language: string,
    addedLines: number[]
  ): MethodBlock[] {
    switch (language) {
      case 'java':
      case 'typescript':
      case 'javascript':
      case 'csharp':
      case 'kotlin':
        return this.detectBracketBasedMethods(fileContent, language, addedLines);
      case 'python':
        return this.detectIndentBasedMethods(fileContent, language, addedLines);
      default:
        return [];
    }
  }

  /**
   * Detecta métodos em linguagens baseadas em chaves {}
   */
  private static detectBracketBasedMethods(
    fileContent: string[],
    language: string,
    addedLines: number[]
  ): MethodBlock[] {
    const methods: MethodBlock[] = [];
    
    // Regex para detectar assinatura de métodos
    const methodPatterns: Record<string, RegExp[]> = {
      java: [
        /^\s*(public|private|protected)?\s*(static)?\s*[\w<>,\s]+\s+(\w+)\s*\([^)]*\)\s*\{?/,
        /^\s*(public|private|protected)?\s*(\w+)\s*\([^)]*\)\s*\{?/,  // Construtor
      ],
      javascript: [
        /^\s*(async\s+)?function\s+(\w+)\s*\([^)]*\)\s*\{/,
        /^\s*(\w+)\s*:\s*function\s*\([^)]*\)\s*\{/,
        /^\s*(\w+)\s*\([^)]*\)\s*\{/,  // Método de objeto
        /^\s*(async\s+)?(\w+)\s*=\s*\([^)]*\)\s*=>/,  // Arrow function
      ],
      typescript: [
        /^\s*(public|private|protected)?\s*(async\s+)?(\w+)\s*\([^)]*\)\s*:\s*[\w<>]+\s*\{/,
        /^\s*(async\s+)?function\s+(\w+)\s*\([^)]*\)\s*:\s*[\w<>]+\s*\{/,
        /^\s*(const|let)\s+(\w+)\s*=\s*\([^)]*\)\s*:\s*[\w<>]+\s*=>/,
      ],
      csharp: [
        /^\s*(public|private|protected|internal)?\s*(static)?\s*(async\s+)?\w+\s+(\w+)\s*\([^)]*\)\s*\{?/,
      ],
      kotlin: [
        /^\s*(fun|suspend\s+fun)\s+(\w+)\s*\([^)]*\)\s*:\s*[\w<>]+\s*\{?/,
      ],
    };

    const patterns = methodPatterns[language] || [];
    
    for (let i = 0; i < fileContent.length; i++) {
      const line = fileContent[i];
      
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match) {
          // Encontrou assinatura de método - agora encontra o bloco completo
          const methodBlock = this.extractBracketBasedBlock(
            fileContent,
            i,
            language,
            addedLines
          );
          
          if (methodBlock) {
            methods.push(methodBlock);
          }
          break;
        }
      }
    }

    return methods;
  }

  /**
   * Extrai bloco de método baseado em chaves {}
   */
  private static extractBracketBasedBlock(
    fileContent: string[],
    startIndex: number,
    language: string,
    addedLines: number[]
  ): MethodBlock | null {
    let braceCount = 0;
    let started = false;
    let endIndex = startIndex;
    
    // Extrai assinatura (pode estar em múltiplas linhas)
    let signature = fileContent[startIndex].trim();
    
    // Procura pela abertura da chave
    for (let i = startIndex; i < fileContent.length; i++) {
      const line = fileContent[i];
      if (!started) {
        signature += ' ' + line.trim();
      }
      
      const openBraces = (line.match(/\{/g) || []).length;
      const closeBraces = (line.match(/\}/g) || []).length;
      
      if (openBraces > 0 && !started) {
        started = true;
      }
      
      braceCount += openBraces - closeBraces;
      
      if (started && braceCount === 0) {
        endIndex = i;
        break;
      }
    }

    if (!started || endIndex === startIndex) {
      return null;
    }

    const startLine = startIndex + 1;
    const endLine = endIndex + 1;
    
    // Verifica se tem linhas adicionadas neste método
    const methodAddedLines = addedLines.filter(line => line >= startLine && line <= endLine);
    
    if (methodAddedLines.length === 0) {
      return null;  // Ignorar métodos sem mudanças
    }

    // Verifica se é método novo (todas as linhas são adicionadas)
    const totalLines = endLine - startLine + 1;
    const isNew = methodAddedLines.length >= totalLines * 0.9;  // 90% das linhas são novas
    
    // Extrai código completo
    const fullCode = fileContent.slice(startIndex, endIndex + 1).join('\n');
    
    // Extrai nome do método
    const name = this.extractMethodName(signature, language);
    
    // Contexto antes (2 linhas)
    const contextBefore = fileContent.slice(Math.max(0, startIndex - 2), startIndex);
    
    // Contexto depois (2 linhas)
    const contextAfter = fileContent.slice(endIndex + 1, Math.min(fileContent.length, endIndex + 3));

    return {
      name,
      signature: signature.trim(),
      startLine,
      endLine,
      language,
      isNew,
      isModified: !isNew,
      addedLines: methodAddedLines,
      fullCode,
      contextBefore,
      contextAfter,
    };
  }

  /**
   * Detecta métodos em linguagens baseadas em indentação (Python)
   */
  private static detectIndentBasedMethods(
    fileContent: string[],
    language: string,
    addedLines: number[]
  ): MethodBlock[] {
    const methods: MethodBlock[] = [];
    const methodPattern = /^\s*(def|async\s+def)\s+(\w+)\s*\([^)]*\)/;
    
    for (let i = 0; i < fileContent.length; i++) {
      const line = fileContent[i];
      const match = line.match(methodPattern);
      
      if (match) {
        const methodBlock = this.extractIndentBasedBlock(
          fileContent,
          i,
          language,
          addedLines
        );
        
        if (methodBlock) {
          methods.push(methodBlock);
        }
      }
    }

    return methods;
  }

  /**
   * Extrai bloco baseado em indentação
   */
  private static extractIndentBasedBlock(
    fileContent: string[],
    startIndex: number,
    language: string,
    addedLines: number[]
  ): MethodBlock | null {
    const signature = fileContent[startIndex].trim();
    const baseIndent = fileContent[startIndex].search(/\S/);
    
    let endIndex = startIndex;
    
    // Encontra fim do bloco (quando indentação volta ao nível base ou menor)
    for (let i = startIndex + 1; i < fileContent.length; i++) {
      const line = fileContent[i];
      if (line.trim() === '') continue;  // Ignora linhas vazias
      
      const indent = line.search(/\S/);
      if (indent <= baseIndent) {
        endIndex = i - 1;
        break;
      }
      endIndex = i;
    }

    const startLine = startIndex + 1;
    const endLine = endIndex + 1;
    
    // Verifica se tem linhas adicionadas
    const methodAddedLines = addedLines.filter(line => line >= startLine && line <= endLine);
    
    if (methodAddedLines.length === 0) {
      return null;
    }

    const totalLines = endLine - startLine + 1;
    const isNew = methodAddedLines.length >= totalLines * 0.9;
    
    const fullCode = fileContent.slice(startIndex, endIndex + 1).join('\n');
    const name = this.extractMethodName(signature, language);
    const contextBefore = fileContent.slice(Math.max(0, startIndex - 2), startIndex);
    const contextAfter = fileContent.slice(endIndex + 1, Math.min(fileContent.length, endIndex + 3));

    return {
      name,
      signature,
      startLine,
      endLine,
      language,
      isNew,
      isModified: !isNew,
      addedLines: methodAddedLines,
      fullCode,
      contextBefore,
      contextAfter,
    };
  }

  /**
   * Extrai nome do método da assinatura
   */
  private static extractMethodName(signature: string, _language: string): string {
    // Remove modificadores e tipos de retorno
    const cleaned = signature
      .replace(/^(public|private|protected|internal|static|async|suspend|fun|def)\s+/g, '')
      .replace(/:\s*\w+/g, '');  // Remove tipos TypeScript
    
    // Extrai nome (primeira palavra antes do parêntese)
    const match = cleaned.match(/(\w+)\s*\(/);
    return match ? match[1] : 'unknown';
  }

  /**
   * Detecta mudanças standalone (fora de métodos)
   */
  private static detectStandaloneChanges(
    fileContent: string[],
    _language: string,
    addedLines: number[],
    methods: MethodBlock[]
  ): MethodBlock[] {
    const standalone: MethodBlock[] = [];
    
    // Linhas que não estão em nenhum método
    const methodLines = new Set<number>();
    methods.forEach(m => {
      for (let i = m.startLine; i <= m.endLine; i++) {
        methodLines.add(i);
      }
    });

    const standaloneLines = addedLines.filter(line => !methodLines.has(line));
    
    if (standaloneLines.length === 0) {
      return [];
    }

    // Agrupa linhas consecutivas
    const groups: number[][] = [];
    let currentGroup: number[] = [];
    
    standaloneLines.forEach(line => {
      if (currentGroup.length === 0 || line === currentGroup[currentGroup.length - 1] + 1) {
        currentGroup.push(line);
      } else {
        groups.push(currentGroup);
        currentGroup = [line];
      }
    });
    
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    // Cria blocos para cada grupo
    groups.forEach(group => {
      const startLine = Math.max(1, group[0] - 2);  // 2 linhas antes
      const endLine = Math.min(fileContent.length, group[group.length - 1] + 2);  // 2 linhas depois
      
      const fullCode = fileContent.slice(startLine - 1, endLine).join('\n');
      
      standalone.push({
        name: `standalone_${startLine}`,
        signature: 'Mudanças fora de métodos',
        startLine,
        endLine,
        language: _language,
        isNew: false,
        isModified: true,
        addedLines: group,
        fullCode,
        contextBefore: [],
        contextAfter: [],
      });
    });

    return standalone;
  }
}
