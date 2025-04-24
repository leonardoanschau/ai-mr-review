import requests
import os
import re
from unidiff import PatchSet

# Configure suas variáveis
GITLAB_TOKEN = os.getenv("GITLAB_TOKEN")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
GITLAB_API_URL = "http://gitlab.dimed.com.br/api/v4"
PROJECT_ID = "381"
MR_ID = "1259"  # conforme sua URL

HEADERS = {
    "PRIVATE-TOKEN": GITLAB_TOKEN
}

def get_mr_changes():
    url = f"{GITLAB_API_URL}/projects/{PROJECT_ID}/merge_requests/{MR_ID}/changes"
    resp = requests.get(url, headers=HEADERS)
    resp.raise_for_status()
    return resp.json()["changes"]

def ask_chatgpt(file_diff):
    prompt = (
        "Você é um revisor de código experiente em projetos Java (Spring Boot) e Angular, com foco em performance, Clean Code, DDD e padrões Controller, Facade, Service e Repository.\n"
        "Analise apenas o que foi alterado no diff abaixo. NÃO faça comentários genéricos ou subjetivos.\n"
        "Para cada ponto de melhoria, seja específico: aponte exatamente o trecho, explique o problema e proponha uma solução objetiva e prática.\n"
        "Evite frases vagas como 'deve ser revisado para garantir Clean Code'. Em vez disso, diga o que deve ser mudado e como.\n"
        "Se possível, forneça exemplos curtos de código corrigido.\n"
        "Nem todos os pontos precisam ser abordados se o código está legível e objetivo, mas evite deixar de lado questões importantes.\n"
        "Näo faça comentários para adicionar bloco de comentários no método estilo javadocs. Vai contra o Clean Code.\n" 
        "Não faça sugestões de refatoração extensas ou complexas, a menos que sejam realmente necessárias. Foque em melhorias pontuais e práticas.\n"
        "Estimule a usar ideias simples e práticas, como: 'Use Optional para evitar NullPointerException'. Libs/bibliotecas novas com a evolução das linguagens.\n"
        "Priorize performance, clareza, simplicidade e aderência aos padrões do time.\n"
        f"{file_diff}\n"
        "Liste as melhorias de forma direta e acionável. Para cada sugestão, indique o número da linha afetada, se possível, no formato: Linha X: sugestão."
    )
    response = requests.post(
        "https://api.openai.com/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {OPENAI_API_KEY}",
            "Content-Type": "application/json"
        },
        json={
            "model": "gpt-4o-mini",
            "messages": [
                {"role": "system", "content": "Você é um revisor de código experiente, direto, objetivo e detalhista."},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.2
        }
    )
    response.raise_for_status()
    return response.json()["choices"][0]["message"]["content"]

def comment_on_mr(file_path, line, body, diff_refs):
    url = f"{GITLAB_API_URL}/projects/{PROJECT_ID}/merge_requests/{MR_ID}/discussions"
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

        analysis = ask_chatgpt(change["diff"])
        print(f"🧠 Análise da IA para `{file_path}`:\n{analysis}\n{'-'*80}")

        for idx, line in enumerate(analysis.split('\n')):
            match = re.search(r"Linha (\d+):", line)
            if match:
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
                        comment_on_mr(file_path, line_number, suggestion_block, diff_refs)
                        print(f"💬 Comentário adicionado na linha {line_number} de {file_path}")
                    else:
                        # Procura em qual hunk a linha se encaixa
                        commented = False
                        for start, end, added_lines in hunk_ranges:
                            if start <= line_number <= end and added_lines:
                                target_line = min(added_lines)
                                # Apenas o bloco de sugestão, sem linha informativa
                                comment_on_mr(file_path, target_line, suggestion_block, diff_refs)
                                print(f"💬 Comentário adicionado na linha {target_line} (bloco {start}-{end}) de {file_path}")
                                commented = True
                                break
                        if not commented:
                            print(f"⚠️ Linha {line_number} não está no diff nem em nenhum bloco, comentário ignorado.")
                except Exception as e:
                    print(f"⚠️ Erro ao comentar: {e}")

if __name__ == "__main__":
    main()