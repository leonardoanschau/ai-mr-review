#!/usr/bin/env python3
"""
MCP Server para criação de issues no GitLab com IA.
Expõe ferramentas para o GitHub Copilot usar diretamente no VS Code.
"""
import asyncio
import json
import os
from typing import Any
import requests

from mcp.server.models import InitializationOptions
import mcp.types as types
from mcp.server import NotificationOptions, Server
import mcp.server.stdio

# Configurações GitLab
GITLAB_TOKEN = os.getenv("GITLAB_TOKEN")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
GITLAB_API_URL = os.getenv("GITLAB_API_URL", "http://gitlab.dimed.com.br/api/v4")

# Defaults
DEFAULT_GROUP = os.getenv("GITLAB_DEFAULT_GROUP", "grupopanvel/varejo/crm")
DEFAULT_BACKLOG_LABEL = os.getenv("GITLAB_BACKLOG_LABEL", "Grupo Panvel :: Backlog")
DEFAULT_ASSIGNEE = os.getenv("GITLAB_DEFAULT_ASSIGNEE", "lanschau")

HEADERS = {
    "PRIVATE-TOKEN": GITLAB_TOKEN
}

OPENAI_TIMEOUT_SECONDS = int(os.getenv("MR_REVIEW_OPENAI_TIMEOUT_SECONDS", "90"))

# Criar servidor MCP
server = Server("gitlab-issues-mcp")

def openai_chat(messages: list[dict], temperature: float = 0.7) -> str:
    """Envia mensagens para a OpenAI e retorna a resposta."""
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
    response.raise_for_status()
    return response.json()["choices"][0]["message"]["content"]

def generate_issue_content(context: str) -> tuple[str, str]:
    """Gera título e descrição da issue usando IA."""
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
        return "Issue criada por IA", response

def get_user_id(username: str) -> int:
    """Busca o ID do usuário pelo username no GitLab."""
    url = f"{GITLAB_API_URL}/users"
    params = {"username": username}
    resp = requests.get(url, headers=HEADERS, params=params, timeout=30)
    resp.raise_for_status()
    users = resp.json()
    
    if not users:
        raise ValueError(f"Usuário '{username}' não encontrado no GitLab")
    
    return users[0]["id"]

def get_projects_from_group(group_path: str) -> list[dict]:
    """Lista todos os projetos do grupo."""
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

def create_issue(project_id: int, title: str, description: str, 
                 assignee_id: int, labels: list[str]) -> dict:
    """Cria uma issue no GitLab."""
    url = f"{GITLAB_API_URL}/projects/{project_id}/issues"
    
    data = {
        "title": title,
        "description": description,
        "assignee_ids": [assignee_id],
        "labels": ",".join(labels)
    }
    
    resp = requests.post(url, headers=HEADERS, json=data, timeout=30)
    resp.raise_for_status()
    
    return resp.json()

@server.list_tools()
async def handle_list_tools() -> list[types.Tool]:
    """Lista as ferramentas disponíveis."""
    return [
        types.Tool(
            name="create_gitlab_issue",
            description=(
                "Cria uma issue no GitLab usando IA para gerar título e descrição. "
                "Você pode fornecer um contexto em texto livre e a IA vai estruturar "
                "uma issue técnica bem formatada."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "context": {
                        "type": "string",
                        "description": "Contexto da issue (pode ser texto livre, bullet points, requisitos, etc.)"
                    },
                    "project_name": {
                        "type": "string",
                        "description": "Nome do projeto no grupo (ex: 'customer-service', 'acompanhamento'). Se não especificado, lista os projetos disponíveis."
                    },
                    "group": {
                        "type": "string",
                        "description": f"Caminho do grupo no GitLab (default: '{DEFAULT_GROUP}')"
                    },
                    "assignee": {
                        "type": "string",
                        "description": f"Username do assignee (default: '{DEFAULT_ASSIGNEE}')"
                    },
                    "labels": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": f"Labels para a issue (default: ['{DEFAULT_BACKLOG_LABEL}'])"
                    }
                },
                "required": ["context"]
            }
        ),
        types.Tool(
            name="list_gitlab_projects",
            description="Lista todos os projetos disponíveis em um grupo do GitLab.",
            inputSchema={
                "type": "object",
                "properties": {
                    "group": {
                        "type": "string",
                        "description": f"Caminho do grupo no GitLab (default: '{DEFAULT_GROUP}')"
                    }
                }
            }
        ),
        types.Tool(
            name="generate_issue_content",
            description=(
                "Gera apenas o título e descrição de uma issue usando IA, "
                "sem criar a issue no GitLab. Útil para preview antes de criar."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "context": {
                        "type": "string",
                        "description": "Contexto da issue"
                    }
                },
                "required": ["context"]
            }
        )
    ]

@server.call_tool()
async def handle_call_tool(
    name: str, arguments: dict | None
) -> list[types.TextContent | types.ImageContent | types.EmbeddedResource]:
    """Executa uma ferramenta."""
    
    if name == "list_gitlab_projects":
        group = arguments.get("group", DEFAULT_GROUP) if arguments else DEFAULT_GROUP
        try:
            projects = get_projects_from_group(group)
            result = f"📁 Projetos no grupo '{group}':\n\n"
            for proj in projects:
                result += f"- **{proj['name']}** (`{proj['path']}`)\n"
                result += f"  ID: {proj['id']}\n"
                result += f"  URL: {proj['web_url']}\n\n"
            
            return [types.TextContent(type="text", text=result)]
        except Exception as e:
            return [types.TextContent(type="text", text=f"❌ Erro: {str(e)}")]
    
    elif name == "generate_issue_content":
        if not arguments or "context" not in arguments:
            return [types.TextContent(type="text", text="❌ Erro: 'context' é obrigatório")]
        
        try:
            title, description = generate_issue_content(arguments["context"])
            result = f"✨ **Título gerado:**\n{title}\n\n"
            result += f"📄 **Descrição gerada:**\n\n{description}"
            return [types.TextContent(type="text", text=result)]
        except Exception as e:
            return [types.TextContent(type="text", text=f"❌ Erro: {str(e)}")]
    
    elif name == "create_gitlab_issue":
        if not arguments or "context" not in arguments:
            return [types.TextContent(type="text", text="❌ Erro: 'context' é obrigatório")]
        
        try:
            context = arguments["context"]
            group = arguments.get("group", DEFAULT_GROUP)
            assignee = arguments.get("assignee", DEFAULT_ASSIGNEE)
            labels = arguments.get("labels", [DEFAULT_BACKLOG_LABEL])
            project_name = arguments.get("project_name")
            
            # Gerar conteúdo com IA
            title, description = generate_issue_content(context)
            
            # Buscar ID do usuário
            assignee_id = get_user_id(assignee)
            
            # Buscar projetos do grupo
            projects = get_projects_from_group(group)
            
            # Selecionar projeto
            if project_name:
                # Buscar projeto pelo nome
                project = next(
                    (p for p in projects if p['path'] == project_name or p['name'] == project_name),
                    None
                )
                if not project:
                    available = ", ".join([p['name'] for p in projects])
                    return [types.TextContent(
                        type="text",
                        text=f"❌ Projeto '{project_name}' não encontrado. Projetos disponíveis: {available}"
                    )]
                project_id = project["id"]
            elif len(projects) == 1:
                project_id = projects[0]["id"]
                project_name = projects[0]["name"]
            else:
                # Listar projetos para escolha
                result = f"📁 Projetos disponíveis no grupo '{group}':\n\n"
                for proj in projects:
                    result += f"- **{proj['name']}** (`{proj['path']}`)\n"
                result += "\nℹ️ Especifique 'project_name' para criar a issue."
                return [types.TextContent(type="text", text=result)]
            
            # Criar issue
            issue = create_issue(project_id, title, description, assignee_id, labels)
            
            result = "✅ **Issue criada com sucesso!**\n\n"
            result += f"🔗 **URL:** {issue['web_url']}\n"
            result += f"🆔 **ID:** #{issue['iid']}\n"
            result += f"📌 **Título:** {issue['title']}\n"
            result += f"📁 **Projeto:** {project_name}\n"
            result += f"🏷️ **Labels:** {', '.join(labels)}\n"
            
            return [types.TextContent(type="text", text=result)]
            
        except Exception as e:
            return [types.TextContent(type="text", text=f"❌ Erro: {str(e)}")]
    
    else:
        raise ValueError(f"Ferramenta desconhecida: {name}")

async def main():
    """Executa o servidor MCP."""
    async with mcp.server.stdio.stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            InitializationOptions(
                server_name="gitlab-issues-mcp",
                server_version="1.0.0",
                capabilities=server.get_capabilities(
                    notification_options=NotificationOptions(),
                    experimental_capabilities={},
                ),
            ),
        )

if __name__ == "__main__":
    asyncio.run(main())
