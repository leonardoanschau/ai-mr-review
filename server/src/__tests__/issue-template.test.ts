/**
 * issue-template.test.ts
 * Unit tests for IssueTemplate — validates PILGER standard structure (based on issue #1054)
 */

import { describe, it, expect } from 'vitest';
import { IssueTemplate } from '../templates/issue-template.js';

describe('IssueTemplate.getFullTemplate', () => {
  const template = IssueTemplate.getFullTemplate();

  // ── Section presence ────────────────────────────────────────────────────────

  it('contains "# 🎯 Objetivo" section (H1, not H2)', () => {
    expect(template).toContain('# 🎯 Objetivo');
    expect(template).not.toContain('## 🎯 Objetivo');
  });

  it('contains "# 🔍 Problema a Resolver" section', () => {
    expect(template).toContain('# 🔍 Problema a Resolver');
  });

  it('contains "# 💡 Como Queremos Resolver" section', () => {
    expect(template).toContain('# 💡 Como Queremos Resolver');
  });

  it('contains "# ✅ Micro Tarefas" section', () => {
    expect(template).toContain('# ✅ Micro Tarefas');
  });

  it('contains "# ✔️ Critérios de Aceite" section', () => {
    expect(template).toContain('# ✔️ Critérios de Aceite');
  });

  // ── Section order ───────────────────────────────────────────────────────────

  it('sections appear in correct order: Objetivo → Problema → Como → Micro Tarefas → Critérios', () => {
    const objetivo = template.indexOf('# 🎯 Objetivo');
    const problema = template.indexOf('# 🔍 Problema a Resolver');
    const como = template.indexOf('# 💡 Como Queremos Resolver');
    const tarefas = template.indexOf('# ✅ Micro Tarefas');
    const criterios = template.indexOf('# ✔️ Critérios de Aceite');

    expect(objetivo).toBeLessThan(problema);
    expect(problema).toBeLessThan(como);
    expect(como).toBeLessThan(tarefas);
    expect(tarefas).toBeLessThan(criterios);
  });

  // ── Micro Tarefas checkboxes ────────────────────────────────────────────────

  it('Micro Tarefas section has at least one checkbox placeholder', () => {
    expect(template).toMatch(/- \[ \]/);
  });

  it('Micro Tarefas checkboxes are unchecked (not [x])', () => {
    const checkboxes = [...template.matchAll(/- \[([ x])\]/g)];
    expect(checkboxes.length).toBeGreaterThan(0);
    for (const match of checkboxes) {
      expect(match[1]).toBe(' ');
    }
  });

  // ── H1 headings (no H2) ─────────────────────────────────────────────────────

  it('all main section headings use H1 (#), not H2 (##)', () => {
    // The main sections should be H1
    const h2Sections = [...template.matchAll(/^## /gm)];
    expect(h2Sections).toHaveLength(0);
  });

  // ── Old sections removed ────────────────────────────────────────────────────

  it('does NOT contain old "Contexto" section', () => {
    expect(template).not.toContain('Contexto');
  });

  it('does NOT contain old "Contratos de API" section', () => {
    expect(template).not.toContain('Contratos de API');
  });

  it('does NOT contain old "Dependências" section', () => {
    expect(template).not.toContain('Dependências');
  });

  it('does NOT contain old "Impactos e Compatibilidade" section', () => {
    expect(template).not.toContain('Impactos e Compatibilidade');
  });

  it('does NOT contain old "Observações" section', () => {
    expect(template).not.toContain('Observações');
  });

  it('does NOT contain old "Métricas de Sucesso" section', () => {
    expect(template).not.toContain('Métricas de Sucesso');
  });

  // ── General shape ───────────────────────────────────────────────────────────

  it('returns a non-empty string', () => {
    expect(template.length).toBeGreaterThan(0);
  });

  it('has exactly 5 top-level sections', () => {
    const h1Sections = [...template.matchAll(/^# /gm)];
    expect(h1Sections).toHaveLength(5);
  });
});
