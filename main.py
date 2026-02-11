import requests
import os
import re
from difflib import SequenceMatcher
from urllib.parse import quote
from unidiff import PatchSet

# Configure suas variáveis
GITLAB_TOKEN = os.getenv("GITLAB_TOKEN")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
GITLAB_API_URL = "http://gitlab.dimed.com.br/api/v4"

HEADERS = {
    "PRIVATE-TOKEN": GITLAB_TOKEN
}

DEBUG_MODE = os.getenv("MR_REVIEW_DEBUG", "1") == "1"

def debug_log(message):
    if DEBUG_MODE:
        print(f"DEBUG: {message}")

def format_line_no(line_no):
    return f"{line_no:>6}" if line_no is not None else "  None"

def parse_mr_url(url):
    """
    Extrai o project_path e mr_id da URL do merge request.
    Exemplo: http://gitlab.dimed.com.br/grupopanvel/varejo/.../customer-service/-/merge_requests/574
    Retorna: (project_path_encoded, mr_id)
    """
    # Remove o domínio
    match = re.search(r'https?://[^/]+/(.+)/-/merge_requests/(\d+)', url)
    if not match:
        raise ValueError(f"URL inválida: {url}")
    
    project_path = match.group(1)
    mr_id = match.group(2)
    
    # URL-encode o path do projeto para usar na API
    project_path_encoded = quote(project_path, safe='')
    
    return project_path_encoded, mr_id

def ask_chatgpt(file_diff, observacoes_usuario=""):
    # Monta o bloco de observações prioritárias do usuário
    observacoes_block = ""
    if observacoes_usuario:
        observacoes_block = (
            f"\n\n🔴 INSTRUÇÕES PRIORITÁRIAS DO USUÁRIO (SIGA ESTAS ANTES DE TUDO):\n"
            f"{observacoes_usuario}\n"
            f"\n"
        )
    
    prompt = (
        "Você é um revisor de código experiente em projetos Java (Spring Boot) 21 com foco em performance\n"
        "Analise apenas o que foi alterado no diff abaixo. NÃO faça comentários genéricos ou subjetivos.\n"
        "Sempre diga o porque da sugestão, o impacto e a solução. Evite sugestões vagas ou genéricas.\n"
        "Ao comentar sugestão de código, utilize a formatação do gitlab para o gitlab saber que é código Java"
        "Sempre sugira uso de streams, lambdas, Optional, var, records, pattern matching e outros recursos modernos do Java quando aplicável.\n"
        "Explique sempre quando usar stream que é por causa da imutabilidade, facilidade de leitura e paralelismo. Explique sempre quando usar Optional que é para evitar NullPointerException e deixar claro que o valor pode ser ausente.\n"
        "Nao faça Comentários genéricos tipo 'veja se é necessário' ou 'verifique se funciona'\n"
        "Para cada ponto de melhoria, seja específico: aponte exatamente o trecho, explique o problema REAL e proponha uma solução objetiva.\n"
        "Sugira template strings ao invés de concatenação de strings, sugira uso de var para variáveis locais quando o tipo é óbvio, sugira uso de records para classes de dados simples, sugira uso de pattern matching para instanceof, sugira uso de Optional para valores que podem ser nulos, sugira uso de streams/lambdas para coleções.\n"
        "Sugira separar um método grande em métodos menores para melhorar a legibilidade e facilitar testes unitários.\n"
        "Sugira uso de DTOs para evitar expor entidades diretamente em APIs, e para facilitar a validação e transformação de dados.\n"
        "Sugira testes unitários para métodos complexos ou com lógica de negócio importante, e explique que isso ajuda a garantir a qualidade do código e facilita futuras refatorações.\n"
        "Comente se não usar records para classes de dados simples, se não usar pattern matching para instanceof, se não usar var para variáveis locais quando o tipo é óbvio, se não usar Optional para valores que podem ser nulos, se não usar streams/lambdas para coleções.\n"
        "Comente se houver Bugs ou riscos de erro (NullPointerException, race conditions, etc.)\n"
        "Comente se houver Violações claras de princípios (SOLID, DDD, padrões do projeto)\n"
        "Se possível, forneça exemplos curtos de código corrigido.\n"
        "NÃO faça comentários para adicionar javadocs. Vai contra Clean Code.\n"
        "Se o código está bom e funcional, NÃO force comentários. Prefira não comentar a fazer sugestões fracas.\n"
        "O diff abaixo já está numerado. Use exatamente esses números de linha.\n"
        "Use o número de linha do arquivo NOVO (lado '+' do diff, conforme cabeçalho @@). "
        "Se a sugestão for sobre linha removida, indique explicitamente: 'Linha X (antiga): ...'.\n"
        "Para cada sugestão, inclua o trecho exato da linha do diff no formato: Trecho: `...`.\n"
        "Copie exatamente o conteúdo após o caractere '|' do diff numerado. Não inclua os números.\n"
        "Se não conseguir indicar o trecho com certeza, não sugira.\n"
        "Formate o comentário para o GitLab UI com seções claras e código destacado:\n"
        "Problema: ...\n"
        "Impacto: ...\n"
        "Sugestão: ...\n"
        "Exemplo (se houver código):\n"
        "```java\n"
        "// código aqui\n"
        "```\n"
        "Todos os títulos de seção devem estar em negrito no formato Markdown, por exemplo: **Problema:**, **Impacto:**, **Sugestão:**, **Exemplo:**\n"
        "Sempre que houver código, use bloco de código com linguagem `java`. Não use código inline.\n"
        "Use uma linha em branco entre parágrafos e blocos de código.\n"
        f"{observacoes_block}"
        f"{file_diff}\n"
        "Liste apenas melhorias relevantes. Para cada sugestão, indique o número da linha: Linha X: sugestão."
    )
    response = requests.post(
        "https://api.openai.com/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {OPENAI_API_KEY}",
            "Content-Type": "application/json"
        },
        json={
            "model": "gpt-4.1",
            "messages": [
                {"role": "system", "content": "Você é um revisor de código experiente, direto, objetivo e detalhista."},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.3
        }
    )
    response.raise_for_status()
    return response.json()["choices"][0]["message"]["content"]

def comment_on_mr(project_id, mr_id, old_path, new_path, line, body, diff_refs, line_type="new"):
    url = f"{GITLAB_API_URL}/projects/{project_id}/merge_requests/{mr_id}/discussions"
    position = {
        "position_type": "text",
        "old_path": old_path,
        "new_path": new_path,
        "base_sha": diff_refs["base_sha"],
        "start_sha": diff_refs["start_sha"],
        "head_sha": diff_refs["head_sha"]
    }
    if line_type == "old":
        position["old_line"] = line
    else:
        position["new_line"] = line
    data = {"body": body, "position": position}
    debug_log(f"Enviando comentário: {data}")
    resp = requests.post(url, headers=HEADERS, json=data)
    if resp.status_code != 201:
        print(f"Resposta da API: {resp.text}")
    resp.raise_for_status()
    return resp.json()

def build_full_diff(change):
    return (
        f"diff --git a/{change['old_path']} b/{change['new_path']}\n"
        f"--- a/{change['old_path']}\n"
        f"+++ b/{change['new_path']}\n"
        f"{change['diff']}"
    )

def render_diff_with_line_numbers(diff_text):
    """
    Renderiza o diff com números de linha explícitos (NEW/OLD) para reduzir erro de referência.
    """
    patch = PatchSet(diff_text)
    output_lines = []
    for file_idx, patched_file in enumerate(patch):
        debug_log(f"Renderizando patch file[{file_idx}]")
        for hunk_idx, hunk in enumerate(patched_file):
            debug_log(
                f"Hunk[{hunk_idx}] src_start={hunk.source_start} src_len={hunk.source_length} "
                f"tgt_start={hunk.target_start} tgt_len={hunk.target_length}"
            )
            output_lines.append(str(hunk).splitlines()[0])
            for line_idx, line in enumerate(hunk):
                value = line.value.rstrip("\n")
                if line.target_line_no is None or line.source_line_no is None:
                    debug_log(
                        f"Linha com numeração parcial em hunk[{hunk_idx}] line[{line_idx}] "
                        f"is_added={line.is_added} is_removed={line.is_removed} is_context={line.is_context} "
                        f"source_line_no={line.source_line_no} target_line_no={line.target_line_no} "
                        f"value={value!r}"
                    )
                if line.is_added:
                    output_lines.append(f"NEW {format_line_no(line.target_line_no)} | {value}")
                elif line.is_removed:
                    output_lines.append(f"OLD {format_line_no(line.source_line_no)} | {value}")
                else:
                    output_lines.append(
                        f"NEW {format_line_no(line.target_line_no)} OLD {format_line_no(line.source_line_no)} | {value}"
                    )
    return "\n".join(output_lines)

def get_line_maps(diff_text):
    """
    Retorna dois dicts com números de linhas válidas no diff:
    - new_lines: linhas do arquivo novo (added + context) -> conteúdo da linha
    - old_lines: linhas do arquivo antigo (removed + context) -> conteúdo da linha
    """
    patch = PatchSet(diff_text)
    new_lines = {}
    old_lines = {}
    for file_idx, patched_file in enumerate(patch):
        for hunk_idx, hunk in enumerate(patched_file):
            for line_idx, line in enumerate(hunk):
                if (line.is_added or line.is_context) and line.target_line_no is not None:
                    new_lines[line.target_line_no] = line.value.rstrip("\n")
                if (line.is_removed or line.is_context) and line.source_line_no is not None:
                    old_lines[line.source_line_no] = line.value.rstrip("\n")
                if line.target_line_no is None and (line.is_added or line.is_context):
                    debug_log(
                        f"target_line_no None descartado file[{file_idx}] hunk[{hunk_idx}] line[{line_idx}] "
                        f"value={line.value.rstrip()!r}"
                    )
                if line.source_line_no is None and (line.is_removed or line.is_context):
                    debug_log(
                        f"source_line_no None descartado file[{file_idx}] hunk[{hunk_idx}] line[{line_idx}] "
                        f"value={line.value.rstrip()!r}"
                    )
    debug_log(f"Mapas de linha montados: new={len(new_lines)} old={len(old_lines)}")
    return new_lines, old_lines

def normalize_text(text):
    return " ".join(text.split())

def bold_section_titles(text):
    """
    Força títulos de seção em negrito para melhorar a leitura no GitLab.
    Ex.: "Problema: ..." -> "**Problema:** ..."
    """
    lines = text.split("\n")
    output = []
    in_code_block = False
    explicit_titles = re.compile(
        r"^\s*(Trecho|Problema|Impacto|Sugest[aã]o|Exemplo(?:\s*\(.*\))?|Resumo|Observa[çc][aã]o|Contexto|Risco|Causa|Solu[çc][aã]o)\s*:\s*(.*)$",
        re.IGNORECASE
    )
    line_titles = re.compile(r"^\s*(Linha [^:]{1,120})\s*:\s*(.*)$", re.IGNORECASE)
    generic_titles = re.compile(r"^\s*([A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ0-9 ()/_-]{1,60})\s*:\s*(.*)$")
    bold_inline_titles = re.compile(r"^\s*\*\*([^*]{1,120}):\*\*\s*(.*)$")

    for raw in lines:
        stripped = raw.strip()
        if stripped.startswith("```"):
            in_code_block = not in_code_block
            output.append(raw)
            continue
        if in_code_block:
            output.append(raw)
            continue
        if stripped.startswith("**"):
            bold_match = bold_inline_titles.match(raw)
            if bold_match:
                title = bold_match.group(1).strip()
                content = bold_match.group(2).strip()
                if content:
                    output.append(f"**{title}:**\n\n{content}")
                else:
                    output.append(f"**{title}:**\n")
            else:
                output.append(raw)
            continue

        match = explicit_titles.match(raw) or line_titles.match(raw)
        if not match:
            generic_match = generic_titles.match(raw)
            if generic_match and len(generic_match.group(1).split()) <= 6:
                match = generic_match

        if match:
            title = match.group(1).strip()
            content = match.group(2).strip()
            if content:
                output.append(f"**{title}:**\n\n{content}")
            else:
                output.append(f"**{title}:**\n")
        else:
            output.append(raw)

    return "\n".join(output).strip()

def extract_snippet_and_clean_lines(lines):
    snippet = None
    cleaned = []
    for line in lines:
        match = re.search(r"Trecho:\s*(?:`([^`]+)`|(.+))", line)
        if match:
            snippet = (match.group(1) or match.group(2) or "").strip()
            continue
        cleaned.append(line)
    return snippet, "\n".join(cleaned).strip()

def find_lines_by_snippet(snippet, line_map):
    if not snippet:
        return []
    matches = [line_no for line_no, content in line_map.items() if snippet in content]
    if matches:
        return matches
    snippet_norm = normalize_text(snippet)
    if not snippet_norm:
        return []
    return [line_no for line_no, content in line_map.items() if snippet_norm in normalize_text(content)]

def find_best_fuzzy_line(snippet, line_map):
    if not snippet or not line_map:
        return None, 0.0
    snippet_norm = normalize_text(snippet)
    if not snippet_norm:
        return None, 0.0
    best_line = None
    best_score = 0.0
    for line_no, content in line_map.items():
        content_norm = normalize_text(content)
        if snippet_norm in content_norm:
            return line_no, 1.0
        score = SequenceMatcher(None, snippet_norm, content_norm).ratio()
        if score > best_score:
            best_score = score
            best_line = line_no
    return best_line, best_score

def find_closest_line(line_number, line_map):
    if not line_map:
        return None
    return min(line_map.keys(), key=lambda ln: abs(ln - line_number))

def extract_method_names(text):
    candidates = re.findall(r"\b([A-Za-z_][A-Za-z0-9_]*)\s*\(", text)
    stop = {
        "if", "for", "while", "switch", "catch", "return", "new", "throw", "else",
        "try", "case", "do", "synchronized", "assert", "super", "this"
    }
    generic = {
        "get", "set", "add", "remove", "build", "builder", "of", "from", "to", "map",
        "flatMap", "filter", "stream", "collect", "orElse", "orElseGet", "orElseThrow",
        "is", "has", "create", "update", "delete"
    }
    result = []
    seen = set()
    for name in candidates:
        if len(name) < 4:
            continue
        if name.lower() in stop:
            continue
        if name in generic:
            continue
        if name not in seen:
            result.append(name)
            seen.add(name)
    return result

def choose_target_line(line_number, line_hint, snippet, suggestion_text, new_line_map, old_line_map):
    debug_log(
        f"Escolhendo linha: requested_line={line_number} hint={line_hint} "
        f"has_snippet={bool(snippet)} new_map={len(new_line_map)} old_map={len(old_line_map)}"
    )
    if line_hint == "old":
        candidates = [("old", old_line_map)]
    elif line_hint == "new":
        candidates = [("new", new_line_map)]
    else:
        candidates = [("new", new_line_map), ("old", old_line_map)]

    if snippet:
        debug_log(f"Snippet recebido: {snippet!r}")
        best = None
        for line_type, line_map in candidates:
            matches = find_lines_by_snippet(snippet, line_map)
            debug_log(f"Match exato por snippet em {line_type}: {matches[:5]}{'...' if len(matches) > 5 else ''}")
            if not matches:
                continue
            if line_number in matches:
                debug_log(f"Linha escolhida por match exato na linha informada: {line_type}:{line_number}")
                return line_type, line_number, True
            chosen = min(matches, key=lambda ln: abs(ln - line_number))
            dist = abs(chosen - line_number)
            key = (dist, 0 if line_type == candidates[0][0] else 1)
            if best is None or key < best[0]:
                best = (key, line_type, chosen)
        if best:
            debug_log(f"Linha escolhida por proximidade de match exato: {best[1]}:{best[2]}")
            return best[1], best[2], True
        # Fallback: fuzzy match quando não há match exato
        best_fuzzy = None
        for line_type, line_map in candidates:
            line_no, score = find_best_fuzzy_line(snippet, line_map)
            debug_log(f"Fuzzy match em {line_type}: line={line_no} score={score:.4f}")
            if line_no is None:
                continue
            key = (-score, 0 if line_type == candidates[0][0] else 1)
            if best_fuzzy is None or key < best_fuzzy[0]:
                best_fuzzy = (key, line_type, line_no, score)
        if best_fuzzy:
            debug_log(
                f"Linha escolhida por fuzzy: {best_fuzzy[1]}:{best_fuzzy[2]} score={best_fuzzy[3]:.4f}"
            )
            return best_fuzzy[1], best_fuzzy[2], True

    method_names = extract_method_names(suggestion_text)
    if method_names:
        debug_log(f"Métodos detectados na sugestão: {method_names}")
        def line_has_method(line_map, line_no):
            content = line_map.get(line_no, "")
            return any(f"{name}(" in content for name in method_names)

        for line_type, line_map in candidates:
            if line_number in line_map and line_has_method(line_map, line_number):
                debug_log(f"Linha escolhida por método na linha informada: {line_type}:{line_number}")
                return line_type, line_number, True

        matches = []
        for line_type, line_map in candidates:
            for name in method_names:
                for line_no, content in line_map.items():
                    if f"{name}(" in content:
                        matches.append((line_type, line_no))
        if matches:
            chosen = min(
                matches,
                key=lambda item: (abs(item[1] - line_number), 0 if item[0] == candidates[0][0] else 1)
            )
            debug_log(f"Linha escolhida por método mais próximo: {chosen[0]}:{chosen[1]}")
            return chosen[0], chosen[1], True
        return None, None, False

    for line_type, line_map in candidates:
        if line_number in line_map:
            debug_log(f"Linha escolhida por match direto de número: {line_type}:{line_number}")
            return line_type, line_number, True

    best = None
    for line_type, line_map in candidates:
        closest = find_closest_line(line_number, line_map)
        if closest is None:
            continue
        dist = abs(closest - line_number)
        key = (dist, 0 if line_type == candidates[0][0] else 1)
        if best is None or key < best[0]:
            best = (key, line_type, closest)
    if best:
        debug_log(f"Linha escolhida por fallback de proximidade: {best[1]}:{best[2]}")
        return best[1], best[2], True
    debug_log("Nenhuma linha candidata encontrada.")
    return None, None, False

def main():
    # Solicita a URL do MR ao usuário
    mr_url = input("🔗 Cole a URL do Merge Request: ").strip()

    # Solicita observações personalizadas (opcional)
    print("\n📝 Observações personalizadas para o revisor (opcional - pressione Enter para pular):")
    observacoes = input("   Exemplo: 'Foque em performance de queries' ou 'Verifique tratamento de erros': ").strip()

    try:
        PROJECT_ID, MR_ID = parse_mr_url(mr_url)
    except ValueError as e:
        print(f"❌ Erro: {e}")
        return

    print(f"\n🔍 Iniciando análise do Merge Request {MR_ID}...\n")

    url = f"{GITLAB_API_URL}/projects/{PROJECT_ID}/merge_requests/{MR_ID}/changes"
    resp = requests.get(url, headers=HEADERS)
    resp.raise_for_status()
    mr_data = resp.json()
    changes = mr_data["changes"]
    diff_refs = mr_data["diff_refs"]

    print(f"📂 {len(changes)} arquivos encontrados para análise.\n")

    total_sugestoes = 0
    total_comentarios = 0

    for change in changes:
        file_path = change["new_path"]
        print(f"➡️ Analisando arquivo: {file_path}")
        debug_log(
            f"Arquivo atual old_path={change['old_path']} new_path={change['new_path']} "
            f"diff_chars={len(change.get('diff', ''))}"
        )

        full_diff = build_full_diff(change)
        new_line_map, old_line_map = get_line_maps(full_diff)

        diff_for_ai = render_diff_with_line_numbers(full_diff)
        debug_log(f"Diff numerado gerado com {len(diff_for_ai.splitlines())} linhas")
        analysis = ask_chatgpt(diff_for_ai, observacoes)
        debug_log(f"Resposta IA recebida com {len(analysis.splitlines())} linhas")
        print(f"   🧠 Sugestões geradas pela IA para `{file_path}`:\n")

        comentarios_postados = 0
        linhas_encontradas = 0

        analysis_lines = analysis.split('\n')
        for idx, line in enumerate(analysis_lines):
            match = re.search(r"Linha (\d+)(?:\s*\((antiga|antigo|old|nova|novo|new)\))?:", line, re.IGNORECASE)
            if match:
                linhas_encontradas += 1
                try:
                    line_number = int(match.group(1))
                    raw_hint = (match.group(2) or "").lower()
                    if raw_hint in ("antiga", "antigo", "old"):
                        line_hint = "old"
                    elif raw_hint in ("nova", "novo", "new"):
                        line_hint = "new"
                    else:
                        line_hint = None
                    suggestion_lines = []
                    suggestion = line.split(":", 1)[1].strip()
                    if suggestion:
                        suggestion_lines.append(suggestion)
                    for next_line in analysis_lines[idx+1:]:
                        if re.search(r"Linha \d+(?:\s*\((?:antiga|antigo|old|nova|novo|new)\))?:", next_line, re.IGNORECASE):
                            break
                        suggestion_lines.append(next_line)
                    suggestion_text = "\n".join(suggestion_lines).strip()
                    snippet, suggestion_block = extract_snippet_and_clean_lines(suggestion_lines)
                    debug_log(
                        f"Sugestão parseada linha={line_number} hint={line_hint} "
                        f"snippet={'SIM' if bool(snippet) else 'NAO'}"
                    )
                    if not suggestion_block:
                        suggestion_block = suggestion_text
                    if snippet:
                        snippet_block = f"Trecho:\n```java\n{snippet}\n```"
                        if suggestion_block:
                            suggestion_block = f"{snippet_block}\n\n{suggestion_block}"
                        else:
                            suggestion_block = snippet_block
                    suggestion_block = bold_section_titles(suggestion_block)

                    target_line_type, target_line, ok = choose_target_line(
                        line_number,
                        line_hint,
                        snippet,
                        suggestion_text,
                        new_line_map,
                        old_line_map
                    )
                    if ok:
                        debug_log(
                            f"Comentário mapeado de linha solicitada={line_number} para linha final="
                            f"{target_line_type}:{target_line}"
                        )
                        comment_on_mr(PROJECT_ID, MR_ID, change["old_path"], change["new_path"], target_line, suggestion_block, diff_refs, line_type=target_line_type)
                        comentarios_postados += 1
                    else:
                        # Só acontece se não houver nenhuma linha no diff.
                        print(f"   ⚠️ Não foi possível localizar uma linha válida no diff para a Linha {line_number}.")
                except Exception as e:
                    print(f"   ⚠️ Erro ao comentar: {e}")

        total_sugestoes += linhas_encontradas
        total_comentarios += comentarios_postados

        if linhas_encontradas == 0:
            print(f"   ✅ Nenhuma sugestão para {file_path} - código está OK!\n")
        else:
            print(f"   📊 Resumo: {comentarios_postados}/{linhas_encontradas} sugestões postadas para {file_path}\n")

    print("\n✨ Análise concluída!")
    print(f"📊 Total de sugestões geradas: {total_sugestoes}")
    print(f"💬 Total de comentários postados: {total_comentarios}\n")

if __name__ == "__main__":
    main()
