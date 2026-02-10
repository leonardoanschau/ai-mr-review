import requests
import os
import re
from urllib.parse import quote
from unidiff import PatchSet

# Configure suas variáveis
GITLAB_TOKEN = os.getenv("GITLAB_TOKEN")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
GITLAB_API_URL = "http://gitlab.dimed.com.br/api/v4"

HEADERS = {
    "PRIVATE-TOKEN": GITLAB_TOKEN
}

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
        "Você é um revisor de código experiente em projetos Java (Spring Boot) com foco em performance\n"
        "Comente se o código não estiver de acordo com as recomendações de Clean Code, SOLID, DDD e melhores práticas de desenvolvimento.\n"
        "Analise apenas o que foi alterado no diff abaixo. NÃO faça comentários genéricos ou subjetivos.\n"
        "SEJA SELETIVO: Comente apenas mudanças que realmente importam."
        "Sempre diga o porque da sugestão, o impacto e a solução. Evite sugestões vagas ou genéricas.\n"
        "Ao comentar sugestão de código, utilize a formatação do gitlab para o gitlab saber que é código Java"
        "Nao faça Comentários genéricos tipo 'veja se é necessário' ou 'verifique se funciona'\n"
        "Para cada ponto de melhoria, seja específico: aponte exatamente o trecho, explique o problema REAL e proponha uma solução objetiva.\n"
        "Comente apenas se houver Problemas de performance\n"
        "Comente apenas se houver Bugs ou riscos de erro (NullPointerException, race conditions, etc.)\n"
        "Comente apenas se houver Violações claras de princípios (SOLID, DDD, padrões do projeto)\n"
        "Comente apenas se houver Oportunidades de uso de recursos modernos da linguagem/framework\n"
        "Se possível, forneça exemplos curtos de código corrigido.\n"
        "NÃO faça comentários para adicionar javadocs. Vai contra Clean Code.\n"
        "Se o código está bom e funcional, NÃO force comentários. Prefira não comentar a fazer sugestões fracas.\n"
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

def comment_on_mr(project_id, mr_id, file_path, line, body, diff_refs):
    url = f"{GITLAB_API_URL}/projects/{project_id}/merge_requests/{mr_id}/discussions"
    data = {
        "body": body,
        "position": {
            "position_type": "text",
            "new_path": file_path,
            "new_line": line,
            "base_sha": diff_refs["base_sha"],
            "start_sha": diff_refs["start_sha"],
            "head_sha": diff_refs["head_sha"]
        }
    }
    print(f"DEBUG: Enviando comentário: {data}")
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

def get_valid_lines(diff_text):
    """
    Retorna um set com os números das linhas adicionadas no diff.
    """
    patch = PatchSet(diff_text)
    valid_lines = set()
    for patched_file in patch:
        for hunk in patched_file:
            for line in hunk:
                if line.is_added:
                    valid_lines.add(line.target_line_no)
    return valid_lines

def get_hunk_ranges(diff_text):
    """
    Retorna uma lista de tuplas (start, end, set de linhas adicionadas) para cada hunk do diff.
    """
    patch = PatchSet(diff_text)
    hunk_ranges = []
    for patched_file in patch:
        for hunk in patched_file:
            start = hunk.target_start
            end = hunk.target_start + hunk.target_length - 1
            added_lines = set()
            for line in hunk:
                if line.is_added:
                    added_lines.add(line.target_line_no)
            hunk_ranges.append((start, end, added_lines))
    return hunk_ranges

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

        full_diff = build_full_diff(change)
        valid_lines = get_valid_lines(full_diff)
        hunk_ranges = get_hunk_ranges(full_diff)

        analysis = ask_chatgpt(change["diff"], observacoes)
        print(f"   🧠 Sugestões geradas pela IA para `{file_path}`:\n")

        comentarios_postados = 0
        linhas_encontradas = 0

        for idx, line in enumerate(analysis.split('\n')):
            match = re.search(r"Linha (\d+):", line)
            if match:
                linhas_encontradas += 1
                try:
                    line_number = int(match.group(1))
                    suggestion_lines = []
                    suggestion = line.split(":", 1)[1].strip()
                    if suggestion:
                        suggestion_lines.append(suggestion)
                    for next_line in analysis.split('\n')[idx+1:]:
                        if re.search(r"Linha \d+:", next_line):
                            break
                        suggestion_lines.append(next_line)
                    suggestion_block = "\n".join(suggestion_lines).strip()

                    if line_number in valid_lines:
                        comment_on_mr(PROJECT_ID, MR_ID, file_path, line_number, suggestion_block, diff_refs)
                        comentarios_postados += 1
                    else:
                        commented = False
                        for start, end, added_lines in hunk_ranges:
                            if start <= line_number <= end and added_lines:
                                target_line = min(added_lines)
                                comment_on_mr(PROJECT_ID, MR_ID, file_path, target_line, suggestion_block, diff_refs)
                                comentarios_postados += 1
                                commented = True
                                break
                        if not commented:
                            print(f"   ⚠️ Linha {line_number} não está no diff nem em nenhum bloco, comentário ignorado.")
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