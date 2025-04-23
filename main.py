import requests
import os

# Configure suas variáveis
GITLAB_TOKEN = os.getenv("GITLAB_TOKEN")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
GITLAB_API_URL = "http://gitlab.dimed.com.br/api/v4"
PROJECT_ID = "381"
MR_ID = "1197"  # conforme sua URL

HEADERS = {
    "PRIVATE-TOKEN": GITLAB_TOKEN
}

def get_mr_changes():
    url = "http://gitlab.dimed.com.br/api/v4/projects/381/merge_requests/1197/changes"
    resp = requests.get(url, headers=HEADERS)
    resp.raise_for_status()
    return resp.json()["changes"]

def ask_chatgpt(file_diff):
    prompt = (
        "Você é um revisor de código experiente em projetos que utilizam Java 21, 17 e 11 como backend, assim como spring-boot e angular para o front-end.\n"
        "Seu trabalho é analisar o código e sugerir melhorias, correções e boas práticas.\n"
        "Você deve analisar pontos importantes e não sugerir melhorias supérfluas:\n"
        "Ao sugerir melhorias, dê exemplos se possível, mas não se extenda muito.\n"
        "Seja direto e objetivo, evitando rodeios.\n"
        "Avalie o seguinte diff de código considerando os seguintes pontos:\n"
        "- Não sugira comentários no código\n"
        "- Sugira criações de testes unitários\n"
        "- Sugira criações de testes de integração\n"
        "- Sugira separação de responsabilidade em métodos extensos\n"
        "- Clareza e legibilidade do código\n"
        "- Estrutura e organização do código\n"
        "- Uso adequado de nomes de variáveis e funções\n"
        "- Aderência aos princípios SOLID\n"
        "- Aderência aos princípios DRY (Don't Repeat Yourself) e KISS (Keep It Simple, Stupid)\n"
        "- Aderência aos princípios de Clean Architecture\n"
        "- Aderência aos princípios de Clean Code\n"
        "- Quando avaliar back-end sugerir aderência aos padrões (Controller, Facade, Service, Repository)\n"
        "- Uso adequado de padrões de projeto (Design Patterns) quando aplicável\n"
        '- Uso adequado de injeção de dependência\n'
        "- Uso adequado de abstrações e interfaces\n"
        "- Uso adequado de tratamento de erros e exceções\n"
        "- Uso adequado de logging e monitoramento\n"
        "- Uso adequado de segurança e proteção de dados\n"
        "- Uso adequado de testes automatizados\n"
        "- Uso do padrão de projeto strategy e observer quando possível\n"
        "- Uso adequado de ORM (Object-Relational Mapping) e consultas SQL\n"
        "- Uso adequado de cache e otimização de consultas\n"
        "- Uso adequado de filas e processamento assíncrono\n"
        "- Uso adequado de APIs e integração com serviços externos\n"
        "- Uso adequado de versionamento de API\n"       
        "- Performance e eficiência do código\n"
        "- Princípios de Domain Driven Design (DDD)\n"
        "- Aplicação rigorosa dos princípios de Clean Code (legibilidade, simplicidade, nomes claros, funções pequenas, etc)\n"
        "Performance é prioridade máxima: aponte qualquer oportunidade de otimização.\n"
        "Seja extremamente rigoroso na aplicação dos princípios de Clean Code.\n"
        "Identifique claramente violações dos padrões Controller, Facade, Service, Repository e de Domain Driven Design.\n"
        "Indique oportunidades de refatoração para melhor aderência a esses padrões.\n"
        "Se possível, forneça exemplos objetivos e curtos para cada sugestão."
        f"{file_diff}\n"
        "Faça uma análise criteriosa e, se possível, sugira exemplos de melhorias."
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
                {"role": "system", "content": "Você é um revisor de código experiente, direto e detalhista."},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.2
        }
    )
    response.raise_for_status()
    return response.json()["choices"][0]["message"]["content"]

def main():
    print(f"🔎 Buscando alterações do MR {MR_ID}...")
    changes = get_mr_changes()
    print(f"📄 {len(changes)} arquivos encontrados.\n")

    for change in changes:
        file_path = change["new_path"]
        diff = change["diff"]

        print(f"➡️ Arquivo: {file_path}")
        analysis = ask_chatgpt(diff)
        print(f"🧠 Análise da IA para `{file_path}`:\n{analysis}\n{'-'*80}")

if __name__ == "__main__":
    main()