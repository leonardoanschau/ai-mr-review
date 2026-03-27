/**
 * GitLab Issue Template
 * Generates standardized issue descriptions following the PILGER standard (issue #1054)
 */

export class IssueTemplate {
  static getFullTemplate(): string {
    return `# 🎯 Objetivo

[Descrever claramente O QUE será feito e PARA QUÊ em 2-3 linhas]

# 🔍 Problema a Resolver

[Descrever a situação atual, o problema ou a necessidade que motivou esta US]

# 💡 Como Queremos Resolver

[Descrever a solução proposta: serviços envolvidos, abordagem técnica, fluxo de dados]

# ✅ Micro Tarefas

- [ ] [Tarefa técnica específica 1]
- [ ] [Tarefa técnica específica 2]
- [ ] [Tarefa técnica específica 3]

# ✔️ Critérios de Aceite

1. [Critério verificável 1]
2. [Critério verificável 2]
3. [Critério verificável 3]`.trim();
  }
}

