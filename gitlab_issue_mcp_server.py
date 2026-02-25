#!/usr/bin/env python3
"""
GitLab Issue Creator MCP Server
Servidor MCP para criar issues no GitLab com IA gerando título e descrição.
"""

import json
import sys
import os
import re
from typing import Any
import requests

# Configurações
GITLAB_TOKEN = os.getenv("GITLAB_TOKEN")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
GITLAB_API_URL = os.getenv("GITLAB_API_URL", "http://gitlab.dimed.com.br/api/v4")
DEFAULT_GROUP = os.getenv("GITLAB_DEFAULT_GROUP", "grupopanvel/varejo/crm")
DEFAULT_ASSIGNEE = os.getenv("GITLAB_DEFAULT_ASSIGNEE", "lanschau")

HEADERS = {"PRIVATE-TOKEN": GITLAB_TOKEN}
OPENAI_TIMEOUT_SECONDS = 90

def log_error(message: str):
    """Log para stderr (não interfere com MCP stdout)"""
    print(f"ERROR: {message}", file=sys.stderr)

def openai_chat(messages, temperature=0.7):
    """Chama OpenAI para gerar conteúdo"""
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

def generate_issue_content(context: str) -> tuple[str, str]:
    """Gera título e descrição usando IA"""
    # Detecta prefixo no contexto
    title_prefix = ""
    prefix_match = re.search(r'prefixo\s*["\']([^"\']+)["\']', context, re.IGNORECASE)
    if prefix_match:
        title_prefix = prefix_match.group(1).strip()
    
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
    
    user_prompt = f"Com base no contexto abaixo, crie uma issue técnica:\n\nCONTEXTO:\n{context}\n\n"
    
    if title_prefix:
        user_prompt += f'IMPORTANTE: O título deve começar com o prefixo "{title_prefix}"\n\n'
    
    user_prompt += (
        'Retorne a resposta no seguinte formato JSON:\n'
        '{\n'
        '  "title": "Título da issue aqui",\n'
        '  "description": "Descrição completa em Markdown aqui"\n'
        '}'
    )
    
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ]
    
    response = openai_chat(messages, temperature=0.7)
    
    # Parse JSON response
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
        log_error(f"Erro ao parsear resposta da IA: {e}")
        return "Issue criada por IA", response

def get_user_id(username: str) -> int:
    """Busca ID do usuário no GitLab"""
    url = f"{GITLAB_API_URL}/users"
    resp = requests.get(url, headers=HEADERS, params={"username": username}, timeout=30)
    resp.raise_for_status()
    users = resp.json()
    
    if not users:
        raise ValueError(f"Usuário '{username}' não encontrado no GitLab")
    
    return users[0]["id"]

def get_projects_from_group(group_path: str) -> list[dict]:
    """Lista todos os projetos do grupo incluindo subgrupos"""
    from urllib.parse import quote
    
    encoded_group = quote(group_path, safe='')
    url = f"{GITLAB_API_URL}/groups/{encoded_group}/projects"
    
    resp = requests.get(
        url, 
        headers=HEADERS, 
        params={"per_page": 100, "include_subgroups": "true"}, 
        timeout=30
    )
    resp.raise_for_status()
    projects = resp.json()
    
    if not projects:
        raise ValueError(f"Nenhum projeto encontrado no grupo '{group_path}'")
    
    # Ordena por path
    projects.sort(key=lambda p: p.get('path_with_namespace', ''))
    
    return projects

def find_project_by_name(project_name: str, group_path: str) -> dict:
    """Busca projeto por nome"""
    projects = get_projects_from_group(group_path)
    
    # Busca exata
    for proj in projects:
        if proj['name'].lower() == project_name.lower() or proj['path'].lower() == project_name.lower():
            return proj
    
    # Busca parcial
    matches = [p for p in projects if project_name.lower() in p['name'].lower() or project_name.lower() in p['path'].lower()]
    
    if len(matches) == 1:
        return matches[0]
    elif len(matches) > 1:
        available = ', '.join([p['name'] for p in matches[:5]])
        raise ValueError(f"Múltiplos projetos encontrados com '{project_name}': {available}")
    
    available = ', '.join([p['name'] for p in projects[:10]])
    raise ValueError(f"Projeto '{project_name}' não encontrado. Disponíveis: {available}")

def create_issue(project_id: int, title: str, description: str, assignee_id: int, labels: list[str]) -> dict:
    """Cria issue no GitLab"""
    url = f"{GITLAB_API_URL}/projects/{project_id}/issues"
    
    data = {
        "title": title,
        "description": description,
        "assignee_ids": [assignee_id],
        "labels": labels
    }
    
    resp = requests.post(url, headers=HEADERS, json=data, timeout=30)
    resp.raise_for_status()
    
    return resp.json()

# ============================================================================
# MCP Protocol Implementation
# ============================================================================

def handle_list_tools() -> dict:
    """Retorna lista de tools disponíveis"""
    return {
        "tools": [
            {
                "name": "list_gitlab_projects",
                "description": "Lista todos os projetos GitLab do grupo CRM configurado (incluindo subgrupos)",
                "inputSchema": {
                    "type": "object",
                    "properties": {},
                    "required": []
                }
            },
            {
                "name": "create_gitlab_issue",
                "description": "Cria uma nova issue no GitLab. A IA gera automaticamente título e descrição com base no contexto fornecido. Suporta busca de projeto por nome e labels múltiplas.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "project_name": {
                            "type": "string",
                            "description": "Nome do projeto GitLab (ex: 'user-stories', 'customer-service')"
                        },
                        "context": {
                            "type": "string",
                            "description": "Contexto da issue que será usado pela IA para gerar título e descrição"
                        },
                        "assignee": {
                            "type": "string",
                            "description": f"Username do responsável (opcional, padrão: {DEFAULT_ASSIGNEE})"
                        },
                        "labels": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Labels da issue (opcional, padrão: ['Grupo Panvel :: Analyze', 'User Story'])"
                        }
                    },
                    "required": ["project_name", "context"]
                }
            },
            {
                "name": "generate_issue_content",
                "description": "Gera apenas conteúdo (título e descrição) para uma issue usando IA, sem criar a issue",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "context": {
                            "type": "string",
                            "description": "Contexto descrevendo a issue desejada"
                        }
                    },
                    "required": ["context"]
                }
            }
        ]
    }

def handle_call_tool(tool_name: str, arguments: dict) -> dict:
    """Executa uma tool"""
    try:
        if tool_name == "list_gitlab_projects":
            return handle_list_projects()
        elif tool_name == "create_gitlab_issue":
            return handle_create_issue(arguments)
        elif tool_name == "generate_issue_content":
            return handle_generate_content(arguments)
        else:
            return {
                "content": [{"type": "text", "text": f"❌ Tool desconhecida: {tool_name}"}],
                "isError": True
            }
    except Exception as e:
        log_error(f"Erro ao executar tool {tool_name}: {e}")
        return {
            "content": [{"type": "text", "text": f"❌ Erro: {str(e)}"}],
            "isError": True
        }

def handle_list_projects() -> dict:
    """Lista projetos do GitLab"""
    projects = get_projects_from_group(DEFAULT_GROUP)
    
    result = f"📁 Projetos no grupo '{DEFAULT_GROUP}':\n\n"
    for proj in projects:
        path_display = proj.get('path_with_namespace', proj['path'])
        result += f"- **{proj['name']}** (`{path_display}`)\n"
        result += f"  ID: {proj['id']}\n"
        if proj.get('description'):
            result += f"  Descrição: {proj['description']}\n"
        result += "\n"
    
    return {
        "content": [{"type": "text", "text": result}],
        "isError": False
    }

def handle_create_issue(arguments: dict) -> dict:
    """Cria issue no GitLab"""
    project_name = arguments["project_name"]
    context = arguments["context"]
    assignee = arguments.get("assignee", DEFAULT_ASSIGNEE)
    labels = arguments.get("labels", ["Grupo Panvel :: Analyze", "User Story"])
    
    # Gera título e descrição com IA
    title, description = generate_issue_content(context)
    
    # Busca projeto
    project = find_project_by_name(project_name, DEFAULT_GROUP)
    
    # Busca usuário
    assignee_id = get_user_id(assignee)
    
    # Cria issue
    issue = create_issue(project['id'], title, description, assignee_id, labels)
    
    result = (
        f"✅ Issue criada com sucesso!\n\n"
        f"🔗 **URL:** {issue['web_url']}\n"
        f"🆔 **ID:** #{issue['iid']}\n"
        f"📌 **Título:** {issue['title']}\n"
        f"📂 **Projeto:** {project['name']}\n"
        f"👤 **Assignee:** {assignee}\n"
        f"🏷️ **Labels:** {', '.join(labels)}"
    )
    
    return {
        "content": [{"type": "text", "text": result}],
        "isError": False
    }

def handle_generate_content(arguments: dict) -> dict:
    """Gera apenas conteúdo da issue sem criar"""
    context = arguments["context"]
    
    title, description = generate_issue_content(context)
    
    result = f"📌 **TÍTULO:**\n{title}\n\n📄 **DESCRIÇÃO:**\n{description}"
    
    return {
        "content": [{"type": "text", "text": result}],
        "isError": False
    }

def handle_initialize(params: dict) -> dict:
    """Responde à inicialização do MCP"""
    return {
        "protocolVersion": "2024-11-05",
        "capabilities": {
            "tools": {}
        },
        "serverInfo": {
            "name": "gitlab-issue-creator",
            "version": "1.0.0"
        }
    }

def process_message(message: dict) -> dict:
    """Processa mensagem MCP"""
    method = message.get("method")
    params = message.get("params", {})
    
    if method == "initialize":
        result = handle_initialize(params)
    elif method == "tools/list":
        result = handle_list_tools()
    elif method == "tools/call":
        tool_name = params.get("name")
        arguments = params.get("arguments", {})
        result = handle_call_tool(tool_name, arguments)
    else:
        return {
            "jsonrpc": "2.0",
            "id": message.get("id"),
            "error": {
                "code": -32601,
                "message": f"Method not found: {method}"
            }
        }
    
    return {
        "jsonrpc": "2.0",
        "id": message.get("id"),
        "result": result
    }

def main():
    """Main loop do MCP server"""
    log_error("GitLab Issue Creator MCP Server iniciado")
    
    # Valida variáveis de ambiente
    if not GITLAB_TOKEN:
        log_error("ERRO: GITLAB_TOKEN não configurado")
        sys.exit(1)
    if not OPENAI_API_KEY:
        log_error("ERRO: OPENAI_API_KEY não configurado")
        sys.exit(1)
    
    # Loop principal: lê mensagens do stdin e responde no stdout
    for line in sys.stdin:
        try:
            line = line.strip()
            if not line:
                continue
            
            message = json.loads(line)
            response = process_message(message)
            
            # Envia resposta no stdout
            print(json.dumps(response), flush=True)
            
        except json.JSONDecodeError as e:
            log_error(f"Erro ao parsear JSON: {e}")
            error_response = {
                "jsonrpc": "2.0",
                "id": None,
                "error": {
                    "code": -32700,
                    "message": "Parse error"
                }
            }
            print(json.dumps(error_response), flush=True)
        except Exception as e:
            log_error(f"Erro inesperado: {e}")
            error_response = {
                "jsonrpc": "2.0",
                "id": None,
                "error": {
                    "code": -32603,
                    "message": f"Internal error: {str(e)}"
                }
            }
            print(json.dumps(error_response), flush=True)

if __name__ == "__main__":
    main()
