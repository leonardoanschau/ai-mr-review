import requests
import os
import json

# Configurações
GITLAB_TOKEN = os.getenv("GITLAB_TOKEN")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
GITLAB_API_URL = "http://gitlab.dimed.com.br/api/v4"

# Parâmetros padrão (podem ser sobrescritos via environment variables)
DEFAULT_GROUP = os.getenv("GITLAB_DEFAULT_GROUP", "grupopanvel/varejo/crm")
DEFAULT_BOARD_ID = os.getenv("GITLAB_DEFAULT_BOARD", "747")
DEFAULT_BACKLOG_LABEL = os.getenv("GITLAB_BACKLOG_LABEL", "Grupo Panvel :: Backlog")
DEFAULT_ASSIGNEE = os.getenv("GITLAB_DEFAULT_ASSIGNEE", "lanschau")

HEADERS = {
    "PRIVATE-TOKEN": GITLAB_TOKEN
}

OPENAI_TIMEOUT_SECONDS = int(os.getenv("MR_REVIEW_OPENAI_TIMEOUT_SECONDS", "90"))

def openai_chat(messages, temperature=0.7):
    """
    Envia mensagens para a OpenAI e retorna a resposta.
    """
    print("🤖 Gerando título e descrição com IA...")
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
    response.raise_for_status()
    return response.json()["choices"][0]["message"]["content"]

def generate_issue_content(context):
    """
    Gera título e descrição da issue usando IA baseado no contexto fornecido.
    """
    system_prompt = (
        "Você é um assistente especializado em criar issues técnicas bem estruturadas para GitLab.\n"
        "Seu trabalho é transformar contextos em issues claras, objetivas e bem formatadas.\n"
        "O título deve ser conciso (máximo 100 caracteres) e direto ao ponto.\n"
        "A descrição deve ser organizada, usar Markdown, e incluir seções relevantes como:\n"
        "- Contexto\n"
        "- Objetivo\n"
        "- Tarefas/Checklist (se aplicável)\n"
        "- Observações/Notas (se aplicável)\n"
        "\nSeja profissional mas direto. Evite formalidades desnecessárias."
    )
    
    user_prompt = (
        f"Com base no contexto abaixo, crie uma issue técnica:\n\n"
        f"CONTEXTO:\n{context}\n\n"
        f"Retorne a resposta no seguinte formato JSON:\n"
        f"{{\n"
        f'  "title": "Título da issue aqui",\n'
        f'  "description": "Descrição completa em Markdown aqui"\n'
        f"}}"
    )
    
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ]
    
    response = openai_chat(messages, temperature=0.7)
    
    # Tenta extrair JSON da resposta
    try:
        # Remove possíveis blocos de código markdown
        response_clean = response.strip()
        if response_clean.startswith("```json"):
            response_clean = response_clean[7:]
        if response_clean.startswith("```"):
            response_clean = response_clean[3:]
        if response_clean.endswith("```"):
            response_clean = response_clean[:-3]
        
        issue_data = json.loads(response_clean.strip())
        return issue_data["title"], issue_data["description"]
    except (json.JSONDecodeError, KeyError) as e:
        print(f"⚠️ Erro ao parsear resposta da IA: {e}")
        print(f"Resposta recebida:\n{response}")
        # Fallback: usa a resposta inteira como descrição
        return "Issue criada por IA", response

def get_user_id(username):
    """
    Busca o ID do usuário pelo username no GitLab.
    """
    url = f"{GITLAB_API_URL}/users"
    params = {"username": username}
    resp = requests.get(url, headers=HEADERS, params=params, timeout=30)
    resp.raise_for_status()
    users = resp.json()
    
    if not users:
        raise ValueError(f"Usuário '{username}' não encontrado no GitLab")
    
    return users[0]["id"]

def get_projects_from_group(group_path):
    """
    Lista todos os projetos do grupo.
    No GitLab, issues são criadas em projetos, não em grupos diretamente.
    """
    from urllib.parse import quote
    
    encoded_group = quote(group_path, safe='')
    url = f"{GITLAB_API_URL}/groups/{encoded_group}/projects"
    
    resp = requests.get(url, headers=HEADERS, params={"per_page": 100}, timeout=30)
    resp.raise_for_status()
    projects = resp.json()
    
    if not projects:
        raise ValueError(
            f"Nenhum projeto encontrado no grupo '{group_path}'. "
            f"Issues devem ser criadas em projetos específicos."
        )
    
    return projects

def create_issue(project_id, title, description, assignee_id, labels):
    """
    Cria uma issue no GitLab.
    """
    url = f"{GITLAB_API_URL}/projects/{project_id}/issues"
    
    data = {
        "title": title,
        "description": description,
        "assignee_ids": [assignee_id],
        "labels": labels
    }
    
    print(f"\n📝 Criando issue no projeto {project_id}...")
    print(f"   Título: {title}")
    print(f"   Labels: {', '.join(labels)}")
    print(f"   Assignee ID: {assignee_id}")
    
    resp = requests.post(url, headers=HEADERS, json=data, timeout=30)
    resp.raise_for_status()
    
    return resp.json()

def main():
    print("=" * 70)
    print("🎯 CRIADOR DE ISSUES COM IA")
    print("=" * 70)
    
    # Solicitar parâmetros customizados (ou usar padrões)
    print(f"\n📋 Configurações atuais:")
    print(f"   Grupo: {DEFAULT_GROUP}")
    print(f"   Board: {DEFAULT_BOARD_ID}")
    print(f"   Label: {DEFAULT_BACKLOG_LABEL}")
    print(f"   Assignee: {DEFAULT_ASSIGNEE}")
    
    usar_padrao = input("\n✅ Usar configurações padrão? (S/n): ").strip().lower()
    
    if usar_padrao == 'n':
        group = input(f"   Grupo GitLab [{DEFAULT_GROUP}]: ").strip() or DEFAULT_GROUP
        backlog_label = input(f"   Label backlog [{DEFAULT_BACKLOG_LABEL}]: ").strip() or DEFAULT_BACKLOG_LABEL
        assignee = input(f"   Username assignee [{DEFAULT_ASSIGNEE}]: ").strip() or DEFAULT_ASSIGNEE
    else:
        group = DEFAULT_GROUP
        backlog_label = DEFAULT_BACKLOG_LABEL
        assignee = DEFAULT_ASSIGNEE
    
    print("\n" + "=" * 70)
    print("📝 CONTEXTO DA ISSUE")
    print("=" * 70)
    print("Cole o contexto da issue abaixo.")
    print("Pode ser texto livre, bullet points, requisitos, etc.")
    print("Pressione Enter duas vezes (linha vazia) para finalizar:")
    print("-" * 70)
    
    lines = []
    empty_count = 0
    while True:
        line = input()
        if not line.strip():
            empty_count += 1
            if empty_count >= 2:
                break
        else:
            empty_count = 0
        lines.append(line)
    
    context = "\n".join(lines).strip()
    
    if not context:
        print("\n❌ Contexto vazio. Operação cancelada.")
        return
    
    print("\n" + "=" * 70)
    
    try:
        # Gerar título e descrição com IA
        title, description = generate_issue_content(context)
        
        print("\n✨ Conteúdo gerado pela IA:")
        print("=" * 70)
        print(f"📌 TÍTULO:\n{title}\n")
        print(f"📄 DESCRIÇÃO:\n{description}")
        print("=" * 70)
        
        confirmar = input("\n✅ Criar issue com esse conteúdo? (S/n): ").strip().lower()
        
        if confirmar == 'n':
            print("\n❌ Operação cancelada pelo usuário.")
            return
        
        # Buscar ID do usuário
        print(f"\n🔍 Buscando ID do usuário '{assignee}'...")
        assignee_id = get_user_id(assignee)
        print(f"   ✅ Usuário encontrado: ID {assignee_id}")
        
        # Buscar projetos do grupo
        print(f"\n🔍 Buscando projetos no grupo '{group}'...")
        projects = get_projects_from_group(group)
        print(f"   ✅ {len(projects)} projeto(s) encontrado(s)\n")
        
        # Listar projetos para escolha
        print("Projetos disponíveis:")
        for idx, proj in enumerate(projects, 1):
            print(f"   {idx}. {proj['name']} ({proj['path']})")
        
        # Escolher projeto
        if len(projects) == 1:
            project_id = projects[0]["id"]
            print(f"\n   ℹ️  Usando único projeto: {projects[0]['name']}")
        else:
            while True:
                escolha = input(f"\n   Escolha o projeto (1-{len(projects)}): ").strip()
                try:
                    idx = int(escolha) - 1
                    if 0 <= idx < len(projects):
                        project_id = projects[idx]["id"]
                        print(f"   ✅ Projeto selecionado: {projects[idx]['name']}")
                        break
                    else:
                        print(f"   ⚠️ Escolha um número entre 1 e {len(projects)}")
                except ValueError:
                    print("   ⚠️ Digite um número válido")
        
        # Criar issue
        labels = [backlog_label]
        issue = create_issue(project_id, title, description, assignee_id, labels)
        
        print("\n" + "=" * 70)
        print("✅ ISSUE CRIADA COM SUCESSO!")
        print("=" * 70)
        print(f"🔗 URL: {issue['web_url']}")
        print(f"🆔 ID: #{issue['iid']}")
        print(f"📌 Título: {issue['title']}")
        print("=" * 70)
        
    except requests.RequestException as e:
        print(f"\n❌ Erro na comunicação com GitLab/OpenAI: {e}")
        if hasattr(e, 'response') and e.response is not None:
            print(f"   Status: {e.response.status_code}")
            print(f"   Resposta: {e.response.text}")
    except Exception as e:
        print(f"\n❌ Erro inesperado: {e}")

if __name__ == "__main__":
    main()
