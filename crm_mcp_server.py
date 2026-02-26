#!/usr/bin/env python3
"""
Varejo CRM MCP Server
Servidor MCP com ferramentas para o time Varejo CRM.
Inclui: GitLab Issue Creator, e mais ferramentas em desenvolvimento.
"""

import json
import sys
import os
from typing import Any
import requests

# ============================================================================
# Configurações e Constantes
# ============================================================================

GITLAB_TOKEN = os.getenv("GITLAB_TOKEN")
GITLAB_API_URL = os.getenv("GITLAB_API_URL", "http://gitlab.dimed.com.br/api/v4")
DEFAULT_GROUP = os.getenv("GITLAB_DEFAULT_GROUP", "grupopanvel/varejo/crm")
DEFAULT_ASSIGNEE = os.getenv("GITLAB_DEFAULT_ASSIGNEE", "lanschau")

HEADERS = {"PRIVATE-TOKEN": GITLAB_TOKEN}

# Constantes para configurações de API
MAX_PROJECTS_PER_PAGE = 100
MAX_DESCRIPTION_LENGTH = 100
MAX_PROJECTS_TO_DISPLAY = 10
MAX_MATCHES_TO_DISPLAY = 5
REQUEST_TIMEOUT_SECONDS = 30

# Constantes do protocolo JSON-RPC
JSONRPC_VERSION = "2.0"
ERROR_PARSE_ERROR = -32700
ERROR_METHOD_NOT_FOUND = -32601
ERROR_INTERNAL_ERROR = -32603

# Constantes do protocolo MCP
MCP_PROTOCOL_VERSION = "2024-11-05"

# ============================================================================
# Funções de Log
# ============================================================================

def log_error(message: str):
    """Log de erro para stderr (não interfere com MCP stdout)"""
    print(f"ERROR: {message}", file=sys.stderr)

def log_info(message: str):
    """Log informativo para stderr (não interfere com MCP stdout)"""
    print(f"INFO: {message}", file=sys.stderr)

# ============================================================================
# Template de Issues
# ============================================================================

def _build_template_section(title: str, emoji: str, content: str) -> str:
    """Constrói uma seção do template"""
    return f"## {emoji} {title}\n\n{content}\n\n"

def _get_template_objective() -> str:
    """Retorna seção de Objetivo"""
    return _build_template_section(
        "Objetivo", "🎯",
        "[Descrever claramente O QUE será feito e PARA QUÊ em 2-3 linhas]"
    )

def _get_template_context() -> str:
    """Retorna seção de Contexto"""
    return _build_template_section(
        "Contexto", "📌",
        "[Descrever a situação atual, problema ou necessidade em 2-3 linhas]"
    )

def _get_template_api_contracts() -> str:
    """Retorna seção de Contratos de API"""
    request_example = "```json\n{\n  // Estrutura do request, se aplicável\n}\n```"
    response_example = "```json\n{\n  // Estrutura do response, se aplicável\n}\n```"
    content = f"### Request\n{request_example}\n\n### Response\n{response_example}"
    return _build_template_section("Contratos de API", "📡", content)

def _get_template_dependencies() -> str:
    """Retorna seção de Dependências"""
    return _build_template_section(
        "Dependências", "🔗",
        "[Se aplicável: Listar serviços externos, outras USs/tasks pré-requisito, bibliotecas, acessos necessários]"
    )

def _get_template_tasks() -> str:
    """Retorna seção de Tarefas"""
    tasks = "- [ ] [Tarefa técnica específica 1]\n- [ ] [Tarefa técnica específica 2]\n- [ ] [Tarefa técnica específica 3]"
    return _build_template_section("Tarefas", "✅", tasks)

def _get_template_impacts() -> str:
    """Retorna seção de Impactos"""
    return _build_template_section(
        "Impactos e Compatibilidade", "⚡",
        "[Se aplicável: Breaking changes, migrações, impactos em outros sistemas, documentações a atualizar]"
    )

def _get_template_observations() -> str:
    """Retorna seção de Observações"""
    return _build_template_section(
        "Observações", "⚠️",
        "[Pontos de atenção, riscos, dependências ou considerações importantes]"
    )

def _get_template_metrics() -> str:
    """Retorna seção de Métricas"""
    return _build_template_section(
        "Métricas de Sucesso", "📊",
        "[Se aplicável: SLAs/SLOs, logs/monitoramento, alertas, como medir sucesso]"
    )

def _get_template_acceptance_criteria() -> str:
    """Retorna seção de Critérios de Aceite"""
    criteria = "- [ ] [Critério verificável 1]\n- [ ] [Critério verificável 2]\n- [ ] [Critério verificável 3]"
    return _build_template_section("Critérios de Aceite", "✔️", criteria)

def get_issue_template() -> str:
    """Retorna o template completo para issues"""
    return (
        _get_template_objective() +
        _get_template_context() +
        _get_template_api_contracts() +
        _get_template_dependencies() +
        _get_template_tasks() +
        _get_template_impacts() +
        _get_template_observations() +
        _get_template_metrics() +
        _get_template_acceptance_criteria()
    ).rstrip()

# ============================================================================
# Funções de Integração com GitLab API
# ============================================================================

def _make_gitlab_request(url: str, method: str = "GET", **kwargs) -> requests.Response:
    """Faz requisição para API do GitLab com tratamento de erro"""
    try:
        if method == "GET":
            response = requests.get(url, headers=HEADERS, timeout=REQUEST_TIMEOUT_SECONDS, **kwargs)
        elif method == "POST":
            response = requests.post(url, headers=HEADERS, timeout=REQUEST_TIMEOUT_SECONDS, **kwargs)
        else:
            raise ValueError(f"Método HTTP não suportado: {method}")
        
        response.raise_for_status()
        return response
    except requests.exceptions.RequestException as e:
        log_error(f"Erro na requisição GitLab: {url} - {e}")
        raise

def get_user_id(username: str) -> int:
    """Busca ID do usuário no GitLab pelo username"""
    log_info(f"Buscando ID do usuário: {username}")
    
    url = f"{GITLAB_API_URL}/users"
    response = _make_gitlab_request(url, params={"username": username})
    users = response.json()
    
    if not users:
        error_msg = f"Usuário '{username}' não encontrado no GitLab"
        log_error(error_msg)
        raise ValueError(error_msg)
    
    user_id = users[0]["id"]
    log_info(f"Usuário '{username}' encontrado com ID: {user_id}")
    return user_id

def _encode_group_path(group_path: str) -> str:
    """Encode do path do grupo para URL"""
    from urllib.parse import quote
    return quote(group_path, safe='')

def _sort_projects_by_path(projects: list[dict]) -> list[dict]:
    """Ordena projetos pelo path"""
    return sorted(projects, key=lambda p: p.get('path_with_namespace', ''))

def get_projects_from_group(group_path: str) -> list[dict]:
    """Lista todos os projetos do grupo incluindo subgrupos recursivamente"""
    log_info(f"Buscando projetos do grupo: {group_path}")
    
    encoded_group = _encode_group_path(group_path)
    url = f"{GITLAB_API_URL}/groups/{encoded_group}/projects"
    
    params = {
        "per_page": MAX_PROJECTS_PER_PAGE,
        "include_subgroups": "true"
    }
    
    response = _make_gitlab_request(url, params=params)
    projects = response.json()
    
    if not projects:
        error_msg = f"Nenhum projeto encontrado no grupo '{group_path}'"
        log_error(error_msg)
        raise ValueError(error_msg)
    
    sorted_projects = _sort_projects_by_path(projects)
    log_info(f"Encontrados {len(sorted_projects)} projetos no grupo '{group_path}'")
    return sorted_projects

def _find_exact_project_match(project_name: str, projects: list[dict]) -> dict | None:
    """Busca projeto por nome exato"""
    for project in projects:
        if (project['name'].lower() == project_name.lower() or 
            project['path'].lower() == project_name.lower()):
            return project
    return None

def _find_partial_project_matches(project_name: str, projects: list[dict]) -> list[dict]:
    """Busca projetos por nome parcial"""
    return [
        project for project in projects 
        if (project_name.lower() in project['name'].lower() or 
            project_name.lower() in project['path'].lower())
    ]

def _format_project_list(projects: list[dict], limit: int) -> str:
    """Formata lista de projetos para exibição"""
    return ', '.join([project['name'] for project in projects[:limit]])

def find_project_by_name(project_name: str, group_path: str) -> dict:
    """Busca projeto por nome no grupo especificado"""
    log_info(f"Buscando projeto: {project_name}")
    
    projects = get_projects_from_group(group_path)
    
    # Tenta busca exata primeiro
    exact_match = _find_exact_project_match(project_name, projects)
    if exact_match:
        log_info(f"Projeto '{project_name}' encontrado (match exato)")
        return exact_match
    
    # Busca parcial
    partial_matches = _find_partial_project_matches(project_name, projects)
    
    if len(partial_matches) == 1:
        log_info(f"Projeto '{project_name}' encontrado (match parcial)")
        return partial_matches[0]
    
    if len(partial_matches) > 1:
        available = _format_project_list(partial_matches, MAX_MATCHES_TO_DISPLAY)
        error_msg = f"Múltiplos projetos encontrados com '{project_name}': {available}"
        log_error(error_msg)
        raise ValueError(error_msg)
    
    # Nenhum match
    available = _format_project_list(projects, MAX_PROJECTS_TO_DISPLAY)
    error_msg = f"Projeto '{project_name}' não encontrado. Disponíveis: {available}"
    log_error(error_msg)
    raise ValueError(error_msg)

def _build_issue_data(title: str, description: str, assignee_id: int, labels: list[str]) -> dict:
    """Constrói payload para criação de issue"""
    return {
        "title": title,
        "description": description,
        "assignee_ids": [assignee_id],
        "labels": labels
    }

def create_issue(project_id: int, title: str, description: str, assignee_id: int, labels: list[str]) -> dict:
    """Cria issue no GitLab"""
    log_info(f"Criando issue no projeto ID {project_id}: {title}")
    
    url = f"{GITLAB_API_URL}/projects/{project_id}/issues"
    data = _build_issue_data(title, description, assignee_id, labels)
    
    response = _make_gitlab_request(url, method="POST", json=data)
    issue = response.json()
    
    log_info(f"Issue criada com sucesso: #{issue['iid']} - {issue['web_url']}")
    return issue

# ============================================================================
# MCP Protocol - Tools Definition
# ============================================================================

def _create_list_projects_tool() -> dict:
    """Cria definição da tool list_gitlab_projects"""
    return {
        "name": "list_gitlab_projects",
        "description": "⚠️ OBRIGATÓRIO CHAMAR PRIMEIRO ⚠️ Lista todos os projetos GitLab do grupo CRM (incluindo subgrupos recursivamente). SEMPRE use esta tool ANTES de criar uma issue para o usuário escolher o projeto correto.",
        "inputSchema": {
            "type": "object",
            "properties": {},
            "required": []
        }
    }

def _create_create_issue_tool() -> dict:
    """Cria definição da tool create_gitlab_issue"""
    return {
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
    }

def _create_get_template_tool() -> dict:
    """Cria definição da tool get_gitlab_issue_template"""
    return {
        "name": "get_gitlab_issue_template",
        "description": "Retorna o template padrão para criação de issues no GitLab (User Stories, Bugs, Débito Técnico) incluindo seções para Objetivo, Contexto, Contratos de API (Request/Response), Dependências, Tarefas, Impactos e Compatibilidade, Observações, Métricas de Sucesso e Critérios de Aceite. Ao gerar issues, avalie o contexto e inclua apenas seções relevantes - nem toda US precisa de todas as seções.",
        "inputSchema": {
            "type": "object",
            "properties": {},
            "required": []
        }
    }

def handle_list_tools() -> dict:
    """Retorna lista de tools disponíveis no MCP"""
    log_info("Listando tools disponíveis")
    
    return {
        "tools": [
            _create_list_projects_tool(),
            _create_create_issue_tool(),
            _create_get_template_tool()
        ]
    }

# ============================================================================
# MCP Protocol - Tool Handlers
# ============================================================================

def _create_error_response(message: str) -> dict:
    """Cria resposta de erro para MCP"""
    return {
        "content": [{"type": "text", "text": f"❌ Erro: {message}"}],
        "isError": True
    }

def _create_success_response(text: str) -> dict:
    """Cria resposta de sucesso para MCP"""
    return {
        "content": [{"type": "text", "text": text}],
        "isError": False
    }

def handle_call_tool(tool_name: str, arguments: dict) -> dict:
    """Executa uma tool do MCP"""
    log_info(f"Executando tool: {tool_name}")
    
    try:
        if tool_name == "list_gitlab_projects":
            return handle_list_projects()
        elif tool_name == "create_gitlab_issue":
            return handle_create_issue(arguments)
        elif tool_name == "get_gitlab_issue_template":
            return handle_get_template()
        else:
            log_error(f"Tool desconhecida: {tool_name}")
            return _create_error_response(f"Tool desconhecida: {tool_name}")
    except Exception as e:
        log_error(f"Erro ao executar tool {tool_name}: {e}")
        return _create_error_response(str(e))

def _format_project_info(index: int, project: dict) -> str:
    """Formata informações de um projeto para exibição"""
    path_display = project.get('path_with_namespace', project['path'])
    
    result = f"{index}. **{project['name']}**\n"
    result += f"   Path: `{path_display}`\n"
    
    if project.get('description'):
        description = project['description']
        if len(description) > MAX_DESCRIPTION_LENGTH:
            description = description[:MAX_DESCRIPTION_LENGTH] + '...'
        result += f"   Descrição: {description}\n"
    
    return result + "\n"

def _format_projects_list(projects: list[dict]) -> str:
    """Formata lista completa de projetos"""
    result = f"📁 **Projetos disponíveis em '{DEFAULT_GROUP}' (recursivo):**\n\n"
    
    for index, project in enumerate(projects, 1):
        result += _format_project_info(index, project)
    
    result += f"\n✅ Total: {len(projects)} projetos encontrados"
    return result

def handle_list_projects() -> dict:
    """Handler para listar projetos do GitLab"""
    log_info("Listando projetos do GitLab")
    
    projects = get_projects_from_group(DEFAULT_GROUP)
    formatted_list = _format_projects_list(projects)
    
    log_info(f"Lista de projetos gerada com sucesso ({len(projects)} projetos)")
    return _create_success_response(formatted_list)

def _extract_issue_arguments(arguments: dict) -> tuple[str, str, str, str, list[str]]:
    """Extrai e valida argumentos para criação de issue"""
    project_name = arguments["project_name"]
    title = arguments["title"]
    description = arguments["description"]
    assignee = arguments.get("assignee", DEFAULT_ASSIGNEE)
    labels = arguments.get("labels", ["Grupo Panvel :: Analyze", "User Story"])
    
    return project_name, title, description, assignee, labels

def _format_issue_result(issue: dict, project: dict, assignee: str, labels: list[str]) -> str:
    """Formata resultado da criação de issue"""
    return (
        f"✅ Issue criada com sucesso!\n\n"
        f"🔗 **URL:** {issue['web_url']}\n"
        f"🆔 **ID:** #{issue['iid']}\n"
        f"📌 **Título:** {issue['title']}\n"
        f"📂 **Projeto:** {project['name']}\n"
        f"👤 **Assignee:** {assignee}\n"
        f"🏷️ **Labels:** {', '.join(labels)}"
    )

def handle_create_issue(arguments: dict) -> dict:
    """Handler para criar issue no GitLab"""
    log_info("Iniciando criação de issue")
    
    # Extrai argumentos
    project_name, title, description, assignee, labels = _extract_issue_arguments(arguments)
    
    # Busca projeto
    project = find_project_by_name(project_name, DEFAULT_GROUP)
    log_info(f"Projeto encontrado: {project['name']} (ID: {project['id']})")
    
    # Busca usuário
    assignee_id = get_user_id(assignee)
    
    # Cria issue
    issue = create_issue(project['id'], title, description, assignee_id, labels)
    
    # Formata resultado
    result = _format_issue_result(issue, project, assignee, labels)
    
    log_info(f"Issue criada com sucesso: #{issue['iid']}")
    return _create_success_response(result)

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

# ============================================================================
# MCP Protocol - Message Processing
# ============================================================================

def handle_initialize(params: dict) -> dict:
    """Responde à inicialização do MCP"""
    log_info("Inicializando servidor MCP")
    
    return {
        "protocolVersion": MCP_PROTOCOL_VERSION,
        "capabilities": {
            "tools": {}
        },
        "serverInfo": {
            "name": "varejo-crm-mcp",
            "version": "1.0.0"
        }
    }

def _create_json_rpc_response(message_id, result) -> dict:
    """Cria resposta JSON-RPC"""
    return {
        "jsonrpc": JSONRPC_VERSION,
        "id": message_id,
        "result": result
    }

def _create_json_rpc_error(message_id, code: int, message: str) -> dict:
    """Cria erro JSON-RPC"""
    return {
        "jsonrpc": JSONRPC_VERSION,
        "id": message_id,
        "error": {
            "code": code,
            "message": message
        }
    }

def process_message(message: dict) -> dict | None:
    """Processa mensagem MCP e roteia para handler apropriado"""
    method = message.get("method")
    params = message.get("params", {})
    message_id = message.get("id")
    
    log_info(f"Processando mensagem: {method}")
    
    # Notificações (sem id) não precisam de resposta
    if message_id is None and method and method.startswith("notifications/"):
        log_info(f"Notificação recebida (sem resposta necessária): {method}")
        return None
    
    if method == "initialize":
        result = handle_initialize(params)
    elif method == "tools/list":
        result = handle_list_tools()
    elif method == "tools/call":
        tool_name = params.get("name")
        arguments = params.get("arguments", {})
        result = handle_call_tool(tool_name, arguments)
    else:
        log_error(f"Método não encontrado: {method}")
        return _create_json_rpc_error(
            message_id,
            ERROR_METHOD_NOT_FOUND,
            f"Method not found: {method}"
        )
    
    return _create_json_rpc_response(message_id, result)

# ============================================================================
# Main Loop
# ============================================================================

def _validate_environment():
    """Valida variáveis de ambiente necessárias"""
    if not GITLAB_TOKEN:
        log_error("ERRO: GITLAB_TOKEN não configurado")
        sys.exit(1)
    
    log_info(f"Variáveis de ambiente carregadas: API URL = {GITLAB_API_URL}")
    log_info(f"Grupo padrão: {DEFAULT_GROUP}, Assignee padrão: {DEFAULT_ASSIGNEE}")

def _process_stdin_line(line: str):
    """Processa uma linha do stdin"""
    line = line.strip()
    if not line:
        return
    
    message = json.loads(line)
    response = process_message(message)
    
    # Envia resposta no stdout (apenas se não for notificação)
    if response is not None:
        print(json.dumps(response), flush=True)

def _handle_json_decode_error(error: json.JSONDecodeError):
    """Trata erro de parse JSON"""
    log_error(f"Erro ao parsear JSON: {error}")
    error_response = _create_json_rpc_error(
        None,
        ERROR_PARSE_ERROR,
        "Parse error"
    )
    print(json.dumps(error_response), flush=True)

def _handle_unexpected_error(error: Exception):
    """Trata erro inesperado"""
    log_error(f"Erro inesperado: {error}")
    error_response = _create_json_rpc_error(
        None,
        ERROR_INTERNAL_ERROR,
        f"Internal error: {str(error)}"
    )
    print(json.dumps(error_response), flush=True)

def main():
    """Main loop do MCP server - lê stdin e processa mensagens JSON-RPC"""
    log_info("=" * 60)
    log_info("Varejo CRM MCP Server iniciado")
    log_info(f"Protocolo MCP: {MCP_PROTOCOL_VERSION}")
    log_info("=" * 60)
    
    # Valida ambiente
    _validate_environment()
    
    # Loop principal: lê mensagens do stdin e responde no stdout
    for line in sys.stdin:
        try:
            _process_stdin_line(line)
        except json.JSONDecodeError as e:
            _handle_json_decode_error(e)
        except Exception as e:
            _handle_unexpected_error(e)

if __name__ == "__main__":
    main()
