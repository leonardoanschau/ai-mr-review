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
OPENAI_TIMEOUT_SECONDS = int(os.getenv("MR_REVIEW_OPENAI_TIMEOUT_SECONDS", "120"))
OPENAI_MAX_RETRIES = int(os.getenv("MR_REVIEW_OPENAI_MAX_RETRIES", "3"))  # Reduzido para 3
OPENAI_RETRY_WAIT_SECONDS = int(os.getenv("MR_REVIEW_OPENAI_RETRY_WAIT_SECONDS", "30"))  # Espera fixa de 30s
GITLAB_TIMEOUT_SECONDS = int(os.getenv("MR_REVIEW_GITLAB_TIMEOUT_SECONDS", "30"))
REVIEW_MODE = os.getenv("MR_REVIEW_MODE", "balanced")  # strict, balanced, lenient
MIN_DIFF_SIZE_TO_REVIEW = int(os.getenv("MR_REVIEW_MIN_DIFF_SIZE", "50"))  # Pular diffs muito pequenos
DELAY_BETWEEN_CALLS = float(os.getenv("MR_REVIEW_DELAY_SECONDS", "3.0"))  # Delay entre chamadas

# Padrões de arquivos que devem ser ignorados na análise
SKIP_FILES_PATTERNS = [
    r'package-lock\.json$',
    r'yarn\.lock$',
    r'pom\.xml\.versionsBackup$',
    r'\.min\.js$',
    r'\.map$',
    r'-lock\.json$',
    r'\.generated\.',
]

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

def should_skip_file(file_path):
    """Verifica se arquivo deve ser pulado na análise."""
    for pattern in SKIP_FILES_PATTERNS:
        if re.search(pattern, file_path):
            return True
    return False

def should_skip_by_size(change):
    """Verifica se mudança é muito pequena para revisar."""
    diff_size = len(change.get("diff", ""))
    return diff_size < MIN_DIFF_SIZE_TO_REVIEW

def get_mr_metadata(project_id, mr_id):
    """Busca título e descrição do MR para contextualizar a revisão."""
    url = f"{GITLAB_API_URL}/projects/{project_id}/merge_requests/{mr_id}"
    try:
        resp = requests.get(url, headers=HEADERS, timeout=GITLAB_TIMEOUT_SECONDS)
        resp.raise_for_status()
        data = resp.json()
        return {
            "title": data.get("title", ""),
            "description": data.get("description", ""),
            "labels": data.get("labels", [])
        }
    except Exception as e:
        debug_log(f"Falha ao buscar metadata do MR: {e}")
        return {"title": "", "description": "", "labels": []}

def get_issue_metadata(project_id, issue_id):
    """Busca título e descrição da issue/história de usuário."""
    url = f"{GITLAB_API_URL}/projects/{project_id}/issues/{issue_id}"
    try:
        resp = requests.get(url, headers=HEADERS, timeout=GITLAB_TIMEOUT_SECONDS)
        resp.raise_for_status()
        data = resp.json()
        return {
            "title": data.get("title", ""),
            "description": data.get("description", ""),
            "labels": data.get("labels", []),
            "state": data.get("state", ""),
            "iid": data.get("iid", "")
        }
    except Exception as e:
        debug_log(f"Falha ao buscar metadata da issue: {e}")
        return None

def parse_issue_reference(issue_ref, project_path):
    """Extrai issue_id de uma URL completa ou referência simples (#123 ou 123)."""
    # Tenta match de URL completa
    url_match = re.search(r'https?://[^/]+/(.+?)/-/issues/(\d+)', issue_ref)
    if url_match:
        issue_project = quote(url_match.group(1), safe='')
        issue_id = url_match.group(2)
        return issue_project, issue_id
    
    # Tenta match de referência simples (#123 ou 123)
    simple_match = re.search(r'#?(\d+)', issue_ref)
    if simple_match:
        return project_path, simple_match.group(1)
    
    return None, None

def get_file_specific_rules(file_path):
    """Retorna regras específicas por tipo de arquivo."""
    if file_path.endswith("Test.java") or "/test/" in file_path:
        return "\n🧪 ARQUIVO DE TESTE: Foque em cobertura adequada, assertions claros e específicos, nomes descritivos de testes."
    elif file_path.endswith("Controller.java"):
        return "\n🌐 CONTROLLER: Foque em validação de entrada, status HTTP corretos, uso adequado de DTOs, documentação de API."
    elif file_path.endswith("Service.java"):
        return "\n⚙️ SERVICE: Foque em lógica de negócio, transações adequadas, tratamento de exceções, separação de responsabilidades."
    elif file_path.endswith("Repository.java"):
        return "\n💾 REPOSITORY: Foque em queries eficientes, uso de índices, prevenção de N+1 queries, paginação."
    elif file_path.endswith(".yml") or file_path.endswith(".yaml"):
        return "\n⚙️ CONFIG: Foque em secrets expostos (senhas, tokens), valores default inadequados para produção."
    elif file_path.endswith(".sql"):
        return "\n🗄️ SQL: Foque em performance de queries, uso de índices, injeção SQL, transações."
    return ""

def get_reviewer_rules():
    base_rules = (
        "Você é um revisor de código Java/Spring Boot experiente.\n\n"
        
        "🎯 FOQUE APENAS EM:\n"
        "1. Bugs reais (NullPointerException, race conditions, memory leaks, lógica incorreta)\n"
        "2. Vulnerabilidades de segurança (SQL injection, XSS, secrets expostos, autenticação/autorização)\n"
        "3. Problemas de performance críticos (N+1 queries, loops O(n²) ou pior, recursos não liberados)\n"
        "4. Violações de SOLID quando impactam manutenibilidade de forma significativa\n"
        "5. Falta de tratamento de erros em operações críticas (I/O, banco de dados, APIs externas)\n"
        "6. Problemas de concorrência (shared mutable state, ausência de sincronização necessária)\n\n"
        
        "❌ NÃO COMENTE:\n"
        "- Estilo/formatação (espaços, linhas em branco, ordem de imports)\n"
        "- Código que está correto mas poderia ser 'mais elegante'\n"
        "- Sugestões genéricas sem contexto específico do problema\n"
        "- Melhorias que não trazem benefício mensurável\n"
        "- Padrões já estabelecidos e consistentes no projeto\n"
        "- Comentários sobre arquivos terminarem com linha em branco\n"
        "- Refatorações que não resolvem problema concreto\n\n"
        
        "📝 FORMATO OBRIGATÓRIO POR SUGESTÃO:\n"
        "Linha X: [título curto e específico]\n"
        "Trecho: `código específico que tem problema`\n"
        "**Problema:** [o que está errado e por quê - seja específico]\n"
        "**Impacto:** [consequência real - crash, data loss, vazamento, lentidão mensurável, vulnerabilidade]\n"
        "**Sugestão:** [como corrigir - passo a passo se necessário]\n"
        "**Exemplo:**\n"
        "```java\n"
        "// código corrigido com comentários explicativos\n"
        "```\n\n"
        
        "💡 PRINCÍPIOS:\n"
        "- Seja específico: cite linha exata, método, variável, trecho de código\n"
        "- Seja objetivo: explique o benefício concreto e mensurável\n"
        "- Seja consistente: não repita sugestões já feitas em arquivos anteriores\n"
        "- Considere o contexto: analise relação com outros arquivos da sessão\n"
        "- Quando em dúvida sobre a relevância, NÃO comente\n"
        "- Use linha do arquivo NOVO por padrão; para linha removida, use 'Linha X (antiga)'\n\n"
    )
    
    if REVIEW_MODE == "strict":
        base_rules += "⚡ MODO RIGOROSO: Seja rigoroso e comente qualquer desvio de boas práticas estabelecidas.\n"
    elif REVIEW_MODE == "lenient":
        base_rules += "⚡ MODO PERMISSIVO: Seja permissivo e comente apenas bugs críticos e vulnerabilidades de segurança.\n"
    else:  # balanced
        base_rules += "⚡ MODO EQUILIBRADO: Seja equilibrado e comente problemas reais com impacto mensurável.\n"
    
    return base_rules

def openai_chat(messages, temperature=0.3):
    """Chama OpenAI com retry simples (máximo 3 tentativas)"""
    for attempt in range(1, OPENAI_MAX_RETRIES + 1):
        try:
            print(f"🤖 Chamando OpenAI (tentativa {attempt}/{OPENAI_MAX_RETRIES})...")
            response = requests.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {OPENAI_API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "gpt-4o",
                    "messages": messages,
                    "temperature": temperature
                },
                timeout=OPENAI_TIMEOUT_SECONDS
            )
            
            if response.status_code == 200:
                print("✅ Resposta recebida")
                return response.json()["choices"][0]["message"]["content"]
            
            # Rate limit - aguarda e tenta novamente
            if response.status_code == 429 and attempt < OPENAI_MAX_RETRIES:
                print(f"⚠️  Rate limit (429). Aguardando {OPENAI_RETRY_WAIT_SECONDS}s...")
                time.sleep(OPENAI_RETRY_WAIT_SECONDS)
                continue
            
            # Outros erros
            print(f"❌ Erro {response.status_code}: {response.text[:200]}")
            response.raise_for_status()
            
        except requests.Timeout:
            print(f"⏱️  Timeout na tentativa {attempt}")
            if attempt < OPENAI_MAX_RETRIES:
                time.sleep(OPENAI_RETRY_WAIT_SECONDS)
            else:
                raise
        except requests.RequestException as e:
            print(f"❌ Erro: {str(e)[:200]}")
            if attempt < OPENAI_MAX_RETRIES:
                time.sleep(OPENAI_RETRY_WAIT_SECONDS)
            else:
                raise
    
    raise RuntimeError(f"❌ Falha após {OPENAI_MAX_RETRIES} tentativas")

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

def detect_duplicate_suggestion(new_suggestion, previous_suggestions, threshold=0.75):
    """Verifica se sugestão é muito similar a uma já feita."""
    new_norm = normalize_text(new_suggestion)
    if len(new_norm) < 20:
        return False
    
    for prev in previous_suggestions:
        prev_norm = normalize_text(prev)
        if len(prev_norm) < 20:
            continue
        ratio = SequenceMatcher(None, new_norm, prev_norm).ratio()
        if ratio > threshold:
            debug_log(f"Sugestão duplicada detectada (similaridade: {ratio:.2f})")
            return True
    return False

def prioritize_changes(changes):
    """Ordena arquivos: primeiro os menores, depois testes, depois configs."""
    def sort_key(change):
        path = change["new_path"]
        diff_size = len(change.get("diff", ""))
        
        # Prioridade por tipo (menor número = maior prioridade)
        if should_skip_file(path):
            priority = 99  # Último na fila (mas será pulado mesmo)
        elif "/test/" in path or path.endswith("Test.java"):
            priority = 2
        elif path.endswith((".yml", ".yaml", ".properties", ".xml")):
            priority = 3
        else:
            priority = 1
        
        return (priority, diff_size)
    
    return sorted(changes, key=sort_key)

def validate_suggestion_relevance(suggestion_text, review_messages):
    """Validação simplificada - sempre aceita sugestões"""
    return True  # Simplificado - confia na análise inicial

def generate_changes_summary(changes):
    """Gera resumo executivo das mudanças para contextualizar a IA."""
    summary_lines = ["📊 RESUMO DAS MUDANÇAS NO MR:"]
    
    by_type = {}
    total_additions = 0
    total_deletions = 0
    
    for change in changes:
        if should_skip_file(change["new_path"]):
            continue
        ext = change["new_path"].split(".")[-1] if "." in change["new_path"] else "no-ext"
        by_type.setdefault(ext, []).append(change["new_path"])
    
    for ext, files in sorted(by_type.items(), key=lambda x: len(x[1]), reverse=True):
        summary_lines.append(f"  - {len(files)} arquivo(s) .{ext}")
    
    summary_lines.append(f"\nTotal de arquivos a revisar: {sum(len(f) for f in by_type.values())}")
    
    return "\n".join(summary_lines)

def create_review_session(observacoes_usuario="", mr_metadata=None, issue_metadata=None):
    base_prompt = get_reviewer_rules()
    
    if issue_metadata:
        base_prompt += "\n📖 HISTÓRIA DE USUÁRIO / ISSUE:\n"
        if issue_metadata.get('iid'):
            base_prompt += f"Issue #{issue_metadata['iid']}\n"
        if issue_metadata.get('title'):
            base_prompt += f"Título: {issue_metadata['title']}\n"
        if issue_metadata.get('description'):
            desc = issue_metadata['description'][:1000]
            base_prompt += f"Descrição: {desc}{'...' if len(issue_metadata['description']) > 1000 else ''}\n"
        if issue_metadata.get('labels'):
            base_prompt += f"Labels: {', '.join(issue_metadata['labels'])}\n"
        base_prompt += "\n"
    
    if mr_metadata:
        base_prompt += "\n📋 CONTEXTO DO MERGE REQUEST:\n"
        if mr_metadata.get('title'):
            base_prompt += f"Título: {mr_metadata['title']}\n"
        if mr_metadata.get('description'):
            desc = mr_metadata['description'][:800]
            base_prompt += f"Descrição: {desc}{'...' if len(mr_metadata['description']) > 800 else ''}\n"
        if mr_metadata.get('labels'):
            base_prompt += f"Labels: {', '.join(mr_metadata['labels'])}\n"
        base_prompt += "\n"
    
    if observacoes_usuario:
        base_prompt += f"\n🎯 INSTRUÇÕES PRIORITÁRIAS DO USUÁRIO:\n{observacoes_usuario}\n"
    
    return [
        {"role": "system", "content": "Você é um revisor de código experiente, direto, objetivo e detalhista."},
        {"role": "user", "content": base_prompt}
    ]

def ask_chatgpt(review_messages, file_path, file_diff, full_file_context=""):
    """Analisa um arquivo e retorna sugestões"""
    full_file_block = ""
    if full_file_context:
        # Limita contexto para não sobrecarregar
        if len(full_file_context) > MAX_FILE_CONTEXT_CHARS:
            full_file_context = full_file_context[:MAX_FILE_CONTEXT_CHARS] + "\n... (truncado)"
        full_file_block = f"\n\nContexto do arquivo completo:\n{full_file_context}\n"
    
    prompt = (
        f"Arquivo: {file_path}\n\n"
        f"Diff:\n{file_diff}\n"
        f"{full_file_block}\n"
        "Analise e liste melhorias relevantes. Formato: 'Linha X: sugestão'"
    )
    user_msg = {"role": "user", "content": prompt}
    response = openai_chat(review_messages + [user_msg], temperature=0.3)
    
    # Delay para evitar rate limit
    time.sleep(DELAY_BETWEEN_CALLS)
    
    return response

def get_existing_comments(project_id, mr_id):
    """
    Busca todos os comentários/discussions existentes no MR.
    Retorna um set de tuplas (file_path, line_number) para verificação rápida.
    """
    url = f"{GITLAB_API_URL}/projects/{project_id}/merge_requests/{mr_id}/discussions"
    existing_comments = set()
    
    try:
        resp = requests.get(url, headers=HEADERS, timeout=GITLAB_TIMEOUT_SECONDS)
        if resp.status_code != 200:
            debug_log(f"⚠️  Não foi possível buscar comentários existentes: {resp.status_code}")
            return existing_comments
        
        discussions = resp.json()
        for discussion in discussions:
            notes = discussion.get("notes", [])
            for note in notes:
                position = note.get("position")
                if position:
                    # Prioriza new_path e new_line (comentários no código novo)
                    file_path = position.get("new_path") or position.get("old_path")
                    line_number = position.get("new_line") or position.get("old_line")
                    
                    if file_path and line_number:
                        existing_comments.add((file_path, line_number))
                        debug_log(f"📌 Comentário existente: {file_path}:{line_number}")
        
        print(f"✅ Encontrados {len(existing_comments)} comentários existentes no MR")
        return existing_comments
    
    except Exception as e:
        debug_log(f"⚠️  Erro ao buscar comentários existentes: {e}")
        return existing_comments

def comment_on_mr(project_id, mr_id, old_path, new_path, line, body, diff_refs, line_type="new", existing_comments=None):
    # Verificar se já existe comentário nesta linha
    if existing_comments is not None:
        file_to_check = new_path if line_type == "new" else old_path
        if (file_to_check, line) in existing_comments:
            print(f"⏭️  Pulando linha {line} em {file_to_check} - comentário já existe")
            return {"skipped": True, "reason": "duplicate"}
    
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

    # Solicita referência da issue/história de usuário (opcional)
    print("\n📖 Issue/História de Usuário relacionada (opcional - pressione Enter para pular):")
    print("   Exemplos: 'https://gitlab.../issues/123', '#123', ou '123'")
    issue_ref = input("   Issue: ").strip()

    # Solicita observações personalizadas (opcional)
    print("\n📝 Observações personalizadas para o revisor (opcional - pressione Enter para pular):")
    observacoes = input("   Exemplo: 'Foque em performance de queries' ou 'Verifique tratamento de erros': ").strip()

    try:
        PROJECT_ID, MR_ID = parse_mr_url(mr_url)
    except ValueError as e:
        print(f"❌ Erro: {e}")
        return

    print(f"\n🔍 Iniciando análise do Merge Request {MR_ID}...\n")

    # Buscar metadata da issue se fornecida
    issue_metadata = None
    if issue_ref:
        print("📖 Buscando informações da issue...")
        issue_project_id, issue_id = parse_issue_reference(issue_ref, PROJECT_ID)
        if issue_id:
            issue_metadata = get_issue_metadata(issue_project_id, issue_id)
            if issue_metadata:
                print(f"   ✅ Issue #{issue_metadata.get('iid', issue_id)}: {issue_metadata.get('title', 'Sem título')}")
                if issue_metadata.get('labels'):
                    print(f"   Labels: {', '.join(issue_metadata['labels'])}")
            else:
                print(f"   ⚠️ Não foi possível buscar a issue {issue_id}")
        else:
            print(f"   ⚠️ Formato de issue inválido: {issue_ref}")
        print()

    # Buscar metadata do MR
    print("📋 Buscando informações do MR...")
    mr_metadata = get_mr_metadata(PROJECT_ID, MR_ID)
    if mr_metadata.get('title'):
        print(f"   Título: {mr_metadata['title']}")
    if mr_metadata.get('labels'):
        print(f"   Labels: {', '.join(mr_metadata['labels'])}")
    print()

    # Buscar comentários existentes para evitar duplicação
    print("📝 Verificando comentários existentes...")
    existing_comments = get_existing_comments(PROJECT_ID, MR_ID)
    print()

    url = f"{GITLAB_API_URL}/projects/{PROJECT_ID}/merge_requests/{MR_ID}/changes"
    resp = requests.get(url, headers=HEADERS, timeout=GITLAB_TIMEOUT_SECONDS)
    resp.raise_for_status()
    mr_data = resp.json()
    changes = mr_data["changes"]
    diff_refs = mr_data["diff_refs"]

    # Filtrar arquivos que devem ser ignorados
    original_count = len(changes)
    changes = [c for c in changes if not should_skip_file(c["new_path"])]
    
    # Filtrar mudanças muito pequenas (economiza chamadas API)
    changes_before_size_filter = len(changes)
    changes = [c for c in changes if not should_skip_by_size(c)]
    
    skipped_by_pattern = original_count - changes_before_size_filter
    skipped_by_size = changes_before_size_filter - len(changes)
    
    if skipped_by_pattern > 0:
        print(f"⏭️  {skipped_by_pattern} arquivo(s) ignorado(s) (lock files, generated files, etc.)")
    if skipped_by_size > 0:
        print(f"⏭️  {skipped_by_size} arquivo(s) ignorado(s) (mudanças < {MIN_DIFF_SIZE_TO_REVIEW} chars)")
    print(f"📂 {len(changes)} arquivo(s) selecionado(s) para análise.\n")
    
    if len(changes) == 0:
        print("✨ Nenhum arquivo relevante para revisar!\n")
        return
    
    # Priorizar arquivos por tamanho e tipo
    changes = prioritize_changes(changes)
    
    # Gerar sumário de mudanças
    changes_summary = generate_changes_summary(changes)
    print(changes_summary)
    print()
    
    file_context_map = build_file_context_map(PROJECT_ID, changes, diff_refs["head_sha"])
    review_messages = create_review_session(observacoes, mr_metadata, issue_metadata)
    
    # Adicionar sumário de mudanças ao contexto
    review_messages.append({"role": "user", "content": changes_summary})
    review_messages.append({"role": "assistant", "content": "Resumo registrado. Pronto para análise."})
    
    print("✅ Contexto preparado\n")

    total_sugestoes = 0
    total_comentarios = 0
    total_duplicadas = 0
    total_irrelevantes = 0
    previous_suggestions = []
    
    # Processar cada arquivo individualmente (SIMPLIFICADO)
    print(f"📁 Processando {len(changes)} arquivo(s)...\n")
    
    for change in changes:
        file_path = change["new_path"]
        print(f"➡️ Analisando arquivo: {file_path}")
        
        # Adicionar regras específicas do tipo de arquivo
        file_specific_rules = get_file_specific_rules(file_path)
        if file_specific_rules:
            debug_log(f"Aplicando regras específicas para {file_path}")
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
        
        # Adicionar contexto específico do tipo de arquivo ao prompt
        file_specific_context = get_file_specific_rules(file_path)
        if file_specific_context:
            full_file_context = file_specific_context + "\n\n" + full_file_context
        
        # Analisar arquivo
        try:
            analysis = ask_chatgpt(review_messages, file_path, diff_for_ai, full_file_context)
        except Exception as e:
            print(f"   ⚠️  Erro ao analisar {file_path}: {e}")
            print("   ⏭️  Pulando arquivo...\n")
            continue
        
        if not analysis or not analysis.strip():
            print(f"   ✅ Nenhuma sugestão para {file_path}\n")
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
                        # Verificar se é duplicada
                        if detect_duplicate_suggestion(suggestion_block, previous_suggestions):
                            debug_log(f"Sugestão duplicada ignorada para linha {line_number}")
                            total_duplicadas += 1
                            continue
                        
                        # Validar relevância (se habilitado)
                        if not validate_suggestion_relevance(suggestion_block, review_messages):
                            debug_log(f"Sugestão considerada irrelevante para linha {line_number}")
                            total_irrelevantes += 1
                            continue
                        
                        debug_log(
                            f"Comentário mapeado de linha solicitada={line_number} para linha final="
                            f"{target_line_type}:{target_line}"
                        )
                        comment_result = comment_on_mr(
                            PROJECT_ID, MR_ID, 
                            change["old_path"], 
                            change["new_path"], 
                            target_line, 
                            suggestion_block, 
                            diff_refs_for_file, 
                            line_type=target_line_type,
                            existing_comments=existing_comments
                        )
                        
                        if comment_result.get("skipped"):
                            debug_log(f"Comentário duplicado ignorado na linha {target_line}")
                        else:
                            # Adicionar ao cache para evitar duplicação na mesma execução
                            file_to_cache = change["new_path"] if target_line_type == "new" else change["old_path"]
                            existing_comments.add((file_to_cache, target_line))
                            previous_suggestions.append(suggestion_block)
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
    print(f"💬 Total de comentários postados: {total_comentarios}")
    if total_duplicadas > 0:
        print(f"🔄 Sugestões duplicadas filtradas: {total_duplicadas}")
    if total_irrelevantes > 0:
        print(f"⚖️  Sugestões irrelevantes filtradas: {total_irrelevantes}")
    print()

if __name__ == "__main__":
    main()
