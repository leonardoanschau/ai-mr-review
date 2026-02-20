import requests
import os
import re
import time
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
MAX_FILE_CONTEXT_CHARS = int(os.getenv("MR_REVIEW_MAX_FILE_CONTEXT_CHARS", "80000"))
MAX_BATCH_CONTEXT_CHARS = int(os.getenv("MR_REVIEW_MAX_BATCH_CONTEXT_CHARS", "120000"))
OPENAI_TIMEOUT_SECONDS = int(os.getenv("MR_REVIEW_OPENAI_TIMEOUT_SECONDS", "90"))
OPENAI_MAX_RETRIES = int(os.getenv("MR_REVIEW_OPENAI_MAX_RETRIES", "10"))
OPENAI_RETRY_BASE_SECONDS = int(os.getenv("MR_REVIEW_OPENAI_RETRY_BASE_SECONDS", "15"))
OPENAI_RETRY_MAX_SECONDS = int(os.getenv("MR_REVIEW_OPENAI_RETRY_MAX_SECONDS", "180"))
GITLAB_TIMEOUT_SECONDS = int(os.getenv("MR_REVIEW_GITLAB_TIMEOUT_SECONDS", "30"))
FILE_429_RETRIES = int(os.getenv("MR_REVIEW_FILE_429_RETRIES", "15"))
FILE_429_WAIT_SECONDS = int(os.getenv("MR_REVIEW_FILE_429_WAIT_SECONDS", "60"))
FILE_429_WAIT_MAX_SECONDS = int(os.getenv("MR_REVIEW_FILE_429_WAIT_MAX_SECONDS", "600"))

def debug_log(message):
    if DEBUG_MODE:
        print(f"DEBUG: {message}")

def format_line_no(line_no):
    return f"{line_no:>6}" if line_no is not None else "  None"

def get_retry_wait_seconds(attempt, response=None, base_seconds=15, max_seconds=180):
    if response is not None:
        retry_after = response.headers.get("Retry-After")
        if retry_after:
            try:
                retry_after_s = int(float(retry_after))
                return max(1, min(max_seconds, retry_after_s))
            except ValueError:
                pass
    return min(max_seconds, base_seconds * attempt)

def get_file_content(project_id, file_path, ref):
    """
    Busca o conteúdo bruto de um arquivo no GitLab em um commit/ref específico.
    """
    encoded_file_path = quote(file_path, safe="")
    url = f"{GITLAB_API_URL}/projects/{project_id}/repository/files/{encoded_file_path}/raw"
    resp = requests.get(url, headers=HEADERS, params={"ref": ref}, timeout=GITLAB_TIMEOUT_SECONDS)
    if resp.status_code != 200:
        debug_log(
            f"Falha ao buscar arquivo completo path={file_path} ref={ref} status={resp.status_code}"
        )
        return ""
    return resp.text

def render_file_with_line_numbers(file_text):
    """
    Renderiza arquivo completo com numeração de linha para dar contexto à IA.
    """
    if not file_text:
        return ""
    lines = file_text.splitlines()
    width = max(4, len(str(len(lines))))
    rendered = [f"L{str(idx).rjust(width, '0')} | {line}" for idx, line in enumerate(lines, start=1)]
    return "\n".join(rendered)

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

def get_reviewer_rules():
    return (
        "Você é um revisor de código experiente em projetos Java (Spring Boot) 21 com foco em performance.\n"
        "Sempre diga o porquê da sugestão, o impacto e a solução. Evite sugestões vagas.\n"
        "NÃO faça comentários genéricos e NÃO force comentários quando o código estiver bom.\n"
        "NÃO sugira terminar com linha em branco como: O arquivo não termina com uma linha em branco."
        "Comente quando houver bugs/riscos reais, violações claras de princípios, ou melhoria moderna aplicável.\n"
        "Considere o contexto acumulado de outros arquivos e comentários anteriores nesta conversa.\n"
        "Evite repetir a mesma sugestão em arquivos diferentes, exceto quando o risco for distinto.\n"
        "Ao sugerir código, use blocos Markdown com linguagem java.\n"
        "Formato esperado por sugestão:\n"
        "Linha X: ...\n"
        "Trecho: `...`\n"
        "Problema: ...\n"
        "Impacto: ...\n"
        "Sugestão: ...\n"
        "Exemplo:\n"
        "```java\n"
        "// código aqui\n"
        "```\n"
        "Todos os títulos em negrito: **Problema:**, **Impacto:**, **Sugestão:**, **Exemplo:**.\n"
        "Use linha do arquivo NOVO por padrão; para removida, use Linha X (antiga).\n"
    )

def openai_chat(messages, temperature=0.3):
    last_error = None
    last_status = None
    for attempt in range(1, OPENAI_MAX_RETRIES + 1):
        try:
            print(f"🤖 Enviando requisição para IA (tentativa {attempt}/{OPENAI_MAX_RETRIES})...")
            print("⏳ Aguardando retorno da IA...")
            response = requests.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {OPENAI_API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "gpt-4.1",
                    "messages": messages,
                    "temperature": temperature
                },
                timeout=OPENAI_TIMEOUT_SECONDS
            )
            print(f"✅ Retorno da IA recebido (status {response.status_code}).")
            if response.status_code in (429, 500, 502, 503, 504):
                last_status = response.status_code
                wait_s = get_retry_wait_seconds(
                    attempt,
                    response=response,
                    base_seconds=OPENAI_RETRY_BASE_SECONDS,
                    max_seconds=OPENAI_RETRY_MAX_SECONDS
                )
                debug_log(
                    f"OpenAI retorno {response.status_code} tentativa {attempt}/{OPENAI_MAX_RETRIES}. "
                    f"Aguardando {wait_s}s para retry."
                )
                time.sleep(wait_s)
                continue
            response.raise_for_status()
            return response.json()["choices"][0]["message"]["content"]
        except requests.RequestException as exc:
            last_error = exc
            wait_s = get_retry_wait_seconds(
                attempt,
                response=getattr(exc, "response", None),
                base_seconds=OPENAI_RETRY_BASE_SECONDS,
                max_seconds=OPENAI_RETRY_MAX_SECONDS
            )
            debug_log(
                f"Falha OpenAI tentativa {attempt}/{OPENAI_MAX_RETRIES}: {exc}. Retry em {wait_s}s."
            )
            time.sleep(wait_s)
    if last_error is not None:
        raise last_error
    raise requests.HTTPError(f"OpenAI falhou após retries. Último status: {last_status}")

def build_file_context_map(project_id, changes, head_sha):
    context_map = {}
    for change in changes:
        if change.get("deleted_file", False):
            continue
        file_content = get_file_content(project_id, change["new_path"], head_sha)
        rendered = render_file_with_line_numbers(file_content)
        if rendered and len(rendered) > MAX_FILE_CONTEXT_CHARS:
            rendered = rendered[:MAX_FILE_CONTEXT_CHARS] + "\n...[arquivo truncado por limite de contexto]..."
        context_map[change["new_path"]] = rendered
    return context_map

def build_context_batches(file_context_map):
    batches = []
    current = []
    current_size = 0
    for file_path, content in file_context_map.items():
        if not content:
            continue
        chunk = f"### Arquivo: {file_path}\n{content}\n"
        if current and current_size + len(chunk) > MAX_BATCH_CONTEXT_CHARS:
            batches.append("\n".join(current))
            current = [chunk]
            current_size = len(chunk)
        else:
            current.append(chunk)
            current_size += len(chunk)
    if current:
        batches.append("\n".join(current))
    return batches

def create_review_session(observacoes_usuario=""):
    base_prompt = get_reviewer_rules()
    if observacoes_usuario:
        base_prompt += f"\nINSTRUÇÕES PRIORITÁRIAS DO USUÁRIO:\n{observacoes_usuario}\n"
    return [
        {"role": "system", "content": "Você é um revisor de código experiente, direto, objetivo e detalhista."},
        {"role": "user", "content": base_prompt}
    ]

def prime_session_with_context(review_messages, file_context_map):
    batches = build_context_batches(file_context_map)
    if not batches:
        return
    print(f"🧠 Preparando contexto global em {len(batches)} lote(s)...")
    for idx, batch in enumerate(batches, start=1):
        debug_log(f"Enviando lote de contexto {idx}/{len(batches)} chars={len(batch)}")
        prompt = (
            f"LOTE DE CONTEXTO {idx}/{len(batches)}.\n"
            "Guarde o contexto desses arquivos para próximas análises de diff.\n"
            "Resuma em no máximo 12 bullets os pontos estruturais importantes (fluxos, validações, contratos, helpers).\n"
            "Não faça sugestões agora. Apenas memória útil para evitar comentários repetidos/incoerentes.\n\n"
            f"{batch}"
        )
        try:
            response = openai_chat(review_messages + [{"role": "user", "content": prompt}], temperature=0.2)
        except requests.RequestException as e:
            print(f"⚠️ Falha no lote de contexto {idx}/{len(batches)}: {e}")
            print("⚠️ Continuando sem esse lote de contexto.")
            continue
        review_messages.append({
            "role": "assistant",
            "content": f"MEMORIA DE CONTEXTO LOTE {idx}/{len(batches)}\n{response}"
        })

def ask_chatgpt(review_messages, file_path, file_diff, full_file_context=""):
    full_file_block = ""
    if full_file_context:
        full_file_block = (
            "\n\nCONTEXTO DO ARQUIVO COMPLETO (APENAS PARA ESTE ARQUIVO):\n"
            "Use esse contexto para precisão, mas comente somente mudanças do diff.\n"
            f"{full_file_context}\n"
        )
    prompt = (
        f"Agora analise somente o arquivo: {file_path}\n"
        "Considere memória já acumulada nesta conversa para evitar repetição de sugestões já feitas.\n"
        "Diff numerado:\n"
        f"{file_diff}\n"
        f"{full_file_block}"
        "Liste apenas melhorias relevantes. Para cada sugestão, indique: Linha X: sugestão."
    )
    user_msg = {"role": "user", "content": prompt}
    response = openai_chat(review_messages + [user_msg], temperature=0.3)
    review_messages.append(user_msg)
    review_messages.append({"role": "assistant", "content": response})
    return response

def comment_on_mr(project_id, mr_id, old_path, new_path, line, body, diff_refs, line_type="new"):
    url = f"{GITLAB_API_URL}/projects/{project_id}/merge_requests/{mr_id}/discussions"
    base_position = {
        "position_type": "text",
        "old_path": old_path,
        "new_path": new_path,
        "base_sha": diff_refs["base_sha"],
        "start_sha": diff_refs["start_sha"],
        "head_sha": diff_refs["head_sha"]
    }
    line_pairs = diff_refs.get("line_pairs", {})
    new_to_old = line_pairs.get("new_to_old", {})
    old_to_new = line_pairs.get("old_to_new", {})

    attempts = []
    if line_type == "old":
        position = dict(base_position)
        position["old_line"] = line
        attempts.append(position)
        paired_new = old_to_new.get(line)
        if paired_new is not None:
            position_ctx = dict(position)
            position_ctx["new_line"] = paired_new
            attempts.append(position_ctx)
    else:
        position = dict(base_position)
        position["new_line"] = line
        attempts.append(position)
        paired_old = new_to_old.get(line)
        if paired_old is not None:
            position_ctx = dict(position)
            position_ctx["old_line"] = paired_old
            attempts.append(position_ctx)

    last_resp = None
    for idx, position in enumerate(attempts, start=1):
        data = {"body": body, "position": position}
        debug_log(f"Enviando comentário tentativa {idx}/{len(attempts)}: {data}")
        resp = requests.post(url, headers=HEADERS, json=data, timeout=GITLAB_TIMEOUT_SECONDS)
        last_resp = resp
        if resp.status_code == 201:
            return resp.json()
        if resp.status_code == 400 and "line_code" in resp.text and idx < len(attempts):
            debug_log("GitLab retornou line_code inválido. Tentando fallback de posição com linha pareada.")
            continue
        print(f"Resposta da API: {resp.text}")
        resp.raise_for_status()

    if last_resp is not None:
        print(f"Resposta da API: {last_resp.text}")
        last_resp.raise_for_status()
    raise RuntimeError("Falha ao enviar comentário para o GitLab.")

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

def get_line_pair_maps(diff_text):
    """
    Mapeia linhas de contexto do diff (new <-> old), útil para montar position completo no GitLab.
    """
    patch = PatchSet(diff_text)
    new_to_old = {}
    old_to_new = {}
    for patched_file in patch:
        for hunk in patched_file:
            for line in hunk:
                if line.is_context and line.target_line_no is not None and line.source_line_no is not None:
                    new_to_old[line.target_line_no] = line.source_line_no
                    old_to_new[line.source_line_no] = line.target_line_no
    return new_to_old, old_to_new

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
    resp = requests.get(url, headers=HEADERS, timeout=GITLAB_TIMEOUT_SECONDS)
    resp.raise_for_status()
    mr_data = resp.json()
    changes = mr_data["changes"]
    diff_refs = mr_data["diff_refs"]

    print(f"📂 {len(changes)} arquivos encontrados para análise.\n")
    file_context_map = build_file_context_map(PROJECT_ID, changes, diff_refs["head_sha"])
    review_messages = create_review_session(observacoes)
    prime_session_with_context(review_messages, file_context_map)

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
        new_to_old, old_to_new = get_line_pair_maps(full_diff)
        diff_refs_for_file = dict(diff_refs)
        diff_refs_for_file["line_pairs"] = {
            "new_to_old": new_to_old,
            "old_to_new": old_to_new
        }

        diff_for_ai = render_diff_with_line_numbers(full_diff)
        debug_log(f"Diff numerado gerado com {len(diff_for_ai.splitlines())} linhas")
        full_file_context = file_context_map.get(change["new_path"], "")
        debug_log(
            f"Contexto de arquivo recuperado para IA: lines={len(full_file_context.splitlines()) if full_file_context else 0}"
        )
        analysis = None
        for file_attempt in range(1, FILE_429_RETRIES + 1):
            try:
                analysis = ask_chatgpt(review_messages, file_path, diff_for_ai, full_file_context)
                break
            except requests.RequestException as e:
                status_code = getattr(getattr(e, "response", None), "status_code", None)
                is_rate_limit = status_code == 429 or "429" in str(e)
                if is_rate_limit and file_attempt < FILE_429_RETRIES:
                    wait_s = min(FILE_429_WAIT_MAX_SECONDS, FILE_429_WAIT_SECONDS * file_attempt)
                    print(
                        f"   ⚠️ OpenAI retornou 429 para {file_path}. "
                        f"Nova tentativa em {wait_s}s ({file_attempt}/{FILE_429_RETRIES})..."
                    )
                    time.sleep(wait_s)
                    continue
                print(f"   ⚠️ Erro ao consultar IA para {file_path}: {e}")
                print("   ⚠️ Arquivo ignorado nesta execução.\n")
                break
        if analysis is None:
            continue
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
                        comment_on_mr(PROJECT_ID, MR_ID, change["old_path"], change["new_path"], target_line, suggestion_block, diff_refs_for_file, line_type=target_line_type)
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
