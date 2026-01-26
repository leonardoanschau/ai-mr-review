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
        "Você é um revisor de código experiente em projetos Java (Spring Boot) e Angular, com foco em performance, Clean Code, DDD e padrões Controller, Facade, Service e Repository.\n"
        "Analise apenas o que foi alterado no diff abaixo. NÃO faça comentários genéricos ou subjetivos.\n"
        "SEJA SELETIVO: Comente apenas mudanças que realmente importam. NÃO comente:\n"
        "- Renomeações simples de variáveis ou métodos (a menos que o novo nome seja inadequado)\n"
        "- Mudanças de formatação ou estilo\n"
        "- Alterações triviais ou óbvias\n"
        "- Adição de nova linha no final do arquivo\n"
        "- Comentários genéricos tipo 'veja se é necessário' ou 'verifique se funciona'\n"
        "Para cada ponto de melhoria, seja específico: aponte exatamente o trecho, explique o problema REAL e proponha uma solução objetiva.\n"
        "Comente apenas se houver:\n"
        "- Problemas de performance\n"
        "- Bugs ou riscos de erro (NullPointerException, race conditions, etc.)\n"
        "- Violações claras de princípios (SOLID, DDD, padrões do projeto)\n"
        "- Oportunidades de uso de recursos modernos da linguagem/framework\n"
        "Evite frases vagas. Em vez de 'deve ser revisado', diga exatamente o que mudar e por quê.\n"
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
            "model": "gpt-4o",
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
    
    print(f"🔎 Buscando alterações do MR {MR_ID}...")
    url = f"{GITLAB_API_URL}/projects/{PROJECT_ID}/merge_requests/{MR_ID}/changes"
    resp = requests.get(url, headers=HEADERS)
    resp.raise_for_status()
    mr_data = resp.json()
    changes = mr_data["changes"]
    diff_refs = mr_data["diff_refs"]
    print(f"📄 {len(changes)} arquivos encontrados.\n")

    for change in changes:
        file_path = change["new_path"]
        full_diff = build_full_diff(change)
        valid_lines = get_valid_lines(full_diff)
        hunk_ranges = get_hunk_ranges(full_diff)

        print(f"➡️ Arquivo: {file_path}")

        analysis = ask_chatgpt(change["diff"], observacoes)
        print(f"🧠 Análise da IA para `{file_path}`:\n{analysis}\n{'-'*80}")

        # Contador de comentários
        comentarios_postados = 0
        linhas_encontradas = 0
        
        for idx, line in enumerate(analysis.split('\n')):
            match = re.search(r"Linha (\d+):", line)
            if match:
                linhas_encontradas += 1
                try:
                    line_number = int(match.group(1))
                    # Captura o bloco de sugestão completo
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
                        print(f"💬 Comentário adicionado na linha {line_number} de {file_path}")
                        comentarios_postados += 1
                    else:
                        # Procura em qual hunk a linha se encaixa
                        commented = False
                        for start, end, added_lines in hunk_ranges:
                            if start <= line_number <= end and added_lines:
                                target_line = min(added_lines)
                                # Apenas o bloco de sugestão, sem linha informativa
                                comment_on_mr(PROJECT_ID, MR_ID, file_path, target_line, suggestion_block, diff_refs)
                                print(f"💬 Comentário adicionado na linha {target_line} (bloco {start}-{end}) de {file_path}")
                                commented = True
                                comentarios_postados += 1
                                break
                        if not commented:
                            print(f"⚠️ Linha {line_number} não está no diff nem em nenhum bloco, comentário ignorado.")
                except Exception as e:
                    print(f"⚠️ Erro ao comentar: {e}")
        
        # Resumo do arquivo
        if linhas_encontradas == 0:
            print(f"✅ Nenhuma sugestão para {file_path} - código está OK!")
        else:
            print(f"📊 Resumo: {comentarios_postados}/{linhas_encontradas} sugestões postadas para {file_path}\n")

if __name__ == "__main__":
    main()