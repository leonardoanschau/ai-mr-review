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
GITLAB_API_URL = os.getenv("GITLAB_API_URL", "http://gitlab.dimed.com.br/api/v4")
DEFAULT_GROUP = os.getenv("GITLAB_DEFAULT_GROUP", "grupopanvel/varejo/crm")
DEFAULT_ASSIGNEE = os.getenv("GITLAB_DEFAULT_ASSIGNEE", "lanschau")

HEADERS = {"PRIVATE-TOKEN": GITLAB_TOKEN}

def log_error(message: str):
    """Log para stderr (não interfere com MCP stdout)"""
    print(f"ERROR: {message}", file=sys.stderr)

def get_issue_template() -> str:
    """Retorna o template padrão para issues"""
    return (
        "## 🎯 Objetivo\n\n"
        "[Descrever claramente O QUE será feito e PARA QUÊ em 2-3 linhas]\n\n"
        
        "## 📌 Contexto\n\n"
        "[Descrever a situação atual, problema ou necessidade em 2-3 linhas]\n\n"
        
        "## 📡 Contratos de API\n\n"
        "### Request\n"
        "```json\n"
        "{\n"
        "  // Estrutura do request, se aplicável\n"
        "}\n"
        "```\n\n"
        
        "### Response\n"
        "```json\n"
        "{\n"
        "  // Estrutura do response, se aplicável\n"
        "}\n"
        "```\n\n"
        
        "## 🔗 Dependências\n\n"
        "[Se aplicável: Listar serviços externos, outras USs/tasks pré-requisito, bibliotecas, acessos necessários]\n\n"
        
        "## ✅ Tarefas\n\n"
        "- [ ] [Tarefa técnica específica 1]\n"
        "- [ ] [Tarefa técnica específica 2]\n"
        "- [ ] [Tarefa técnica específica 3]\n\n"
        
        "## ⚡ Impactos e Compatibilidade\n\n"
        "[Se aplicável: Breaking changes, migrações, impactos em outros sistemas, documentações a atualizar]\n\n"
        
        "## ⚠️ Observações\n\n"
        "[Pontos de atenção, riscos, dependências ou considerações importantes]\n\n"
        
        "## 📊 Métricas de Sucesso\n\n"
        "[Se aplicável: SLAs/SLOs, logs/monitoramento, alertas, como medir sucesso]\n\n"
        
        "## ✔️ Critérios de Aceite\n\n"
        "- [ ] [Critério verificável 1]\n"
        "- [ ] [Critério verificável 2]\n"
        "- [ ] [Critério verificável 3]\n"
    )

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
                "description": "⚠️ OBRIGATÓRIO CHAMAR PRIMEIRO ⚠️ Lista todos os projetos GitLab do grupo CRM (incluindo subgrupos recursivamente). SEMPRE use esta tool ANTES de criar uma issue para o usuário escolher o projeto correto.",
                "inputSchema": {
                    "type": "object",
                    "properties": {},
                    "required": []
                }
            },
            {
                "name": "create_gitlab_issue",
                "description": "Cria uma nova issue no GitLab com título e descrição fornecidos. ⚠️ IMPORTANTE: NUNCA use esta tool sem antes chamar 'list_gitlab_projects' e pedir para o usuário escolher o projeto. O GitHub Copilot deve gerar o título e descrição antes de chamar esta tool.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "project_name": {
                            "type": "string",
                            "description": "Nome EXATO do projeto escolhido pelo usuário da lista (ex: 'Acompanhamento', 'Atividades'). OBRIGATÓRIO."
                        },
                        "title": {
                            "type": "string",
                            "description": "Título completo da issue incluindo prefixo [US], [TD] ou [BUG] se aplicável. OBRIGATÓRIO."
                        },
                        "description": {
                            "type": "string",
                            "description": "Descrição completa da issue em Markdown seguindo o template padrão. OBRIGATÓRIO."
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
                    "required": ["project_name", "title", "description"]
                }
            },
            {
                "name": "get_issue_template",
                "description": "Retorna o template padrão para criação de issues (User Stories, Bugs, Débito Técnico) incluindo seções para Objetivo, Contexto, Contratos de API (Request/Response), Dependências, Tarefas, Impactos e Compatibilidade, Observações, Métricas de Sucesso e Critérios de Aceite. Ao gerar issues, avalie o contexto e inclua apenas seções relevantes - nem toda US precisa de todas as seções.",
                "inputSchema": {
                    "type": "object",
                    "properties": {},
                    "required": []
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
        elif tool_name == "get_issue_template":
            return handle_get_template()
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
    
    result = f"📁 **Projetos disponíveis em '{DEFAULT_GROUP}' (recursivo):**\n\n"
    
    for i, proj in enumerate(projects, 1):
        path_display = proj.get('path_with_namespace', proj['path'])
        result += f"{i}. **{proj['name']}**\n"
        result += f"   Path: `{path_display}`\n"
        if proj.get('description'):
            desc = proj['description'][:100] + '...' if len(proj['description']) > 100 else proj['description']
            result += f"   Descrição: {desc}\n"
        result += "\n"
    
    result += f"\n✅ Total: {len(projects)} projetos encontrados"
    
    return {
        "content": [{"type": "text", "text": result}],
        "isError": False
    }

def handle_create_issue(arguments: dict) -> dict:
    """Cria issue no GitLab"""
    project_name = arguments["project_name"]
    title = arguments["title"]
    description = arguments["description"]
    assignee = arguments.get("assignee", DEFAULT_ASSIGNEE)
    labels = arguments.get("labels", ["Grupo Panvel :: Analyze", "User Story"])
    
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

def handle_get_template() -> dict:
    """Retorna template de issue"""
    template = get_issue_template()
    
    result = (
        "📋 **Template padrão para Issues GitLab:**\n\n"
        "Use este formato para criar User Stories, Bugs ou Débito Técnico.\n"
        "Inclui seção de **Contratos de API** (Request/Response) para endpoints.\n\n"
        f"```markdown\n{template}\n```\n\n"
        "💡 **Prefixos:**\n"
        "- `[US] -` para User Stories\n"
        "- `[BUG] -` para Bugs\n"
        "- `[TD] -` para Débito Técnico\n\n"
        "� **Orientações por seção:**\n\n"
        "**📡 Contratos de API:**\n"
        "- Para **endpoints novos**: Sugira contratos completos de Request e Response\n"
        "- Para **endpoints existentes**: Sugira apenas as propriedades/objetos novos\n"
        "- Se não aplicável: Pode omitir a seção\n\n"
        
        "**🔗 Dependências:**\n"
        "- Incluir apenas se houver integrações externas, pré-requisitos ou dependências significativas\n"
        "- Para mudanças simples/isoladas: Pode omitir\n\n"
        
        "**⚡ Impactos e Compatibilidade:**\n"
        "- Incluir se houver breaking changes, migrações ou impactos em outros sistemas\n"
        "- Para features novas sem breaking change: Pode omitir ou simplificar\n\n"
        
        "**📊 Métricas de Sucesso:**\n"
        "- Incluir para features críticas ou que exigem SLA/monitoramento específico\n"
        "- Para bugs simples ou refactors internos: Pode omitir\n\n"
        
        "✅ **Regra geral**: Avalie o contexto e inclua apenas seções relevantes. Nem toda US precisa de todas as seções!"
    )
    
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
