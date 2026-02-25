# ai-mr-review

## Descrição do Projeto

O **ai-mr-review** é uma ferramenta automatizada para revisão de código em solicitações de merge (Merge Requests) no GitLab. Ele utiliza a API do OpenAI para fornecer análises detalhadas e sugestões de melhorias com base nas alterações realizadas no código. O foco principal é garantir aderência a boas práticas de desenvolvimento, como Clean Code, DDD, e padrões arquiteturais (Controller, Facade, Service e Repository), além de priorizar performance e simplicidade.

## Funcionalidades

- **Análise de Alterações**: Busca as alterações realizadas em uma Merge Request específica no GitLab.
- **Revisão Automatizada**: Envia o diff das alterações para o ChatGPT, que retorna sugestões específicas e acionáveis.
- **Comentários Diretos no GitLab**: Adiciona comentários diretamente nas linhas relevantes do código alterado, com base nas sugestões fornecidas pela IA.
- **Foco em Boas Práticas**: As análises priorizam performance, clareza, simplicidade e aderência aos padrões do time.

## Tecnologias Utilizadas

- **Python**: Linguagem principal do projeto.
- **GitLab API**: Para buscar informações sobre as Merge Requests e adicionar comentários.
- **OpenAI API**: Para realizar a análise automatizada das alterações no código.
- **unidiff**: Biblioteca para manipulação de diffs e identificar linhas adicionadas.

## Como Funciona

1. **Configuração**: O projeto utiliza variáveis de ambiente para configurar os tokens de acesso ao GitLab e OpenAI.
2. **Busca de Alterações**: As alterações de uma Merge Request são obtidas através da API do GitLab.
3. **Análise com IA**: O diff das alterações é enviado para o ChatGPT, que retorna sugestões detalhadas.
4. **Comentários no GitLab**: As sugestões são adicionadas diretamente como comentários na Merge Request.

## Pré-requisitos

- Python 3.8 ou superior.
- Tokens de acesso para as APIs do GitLab e OpenAI configurados nas variáveis de ambiente `GITLAB_TOKEN` e `OPENAI_API_KEY`.

## Como Executar

1. Clone o repositório:
    ```bash
    git clone <URL_DO_REPOSITORIO>
    cd ai-mr-review
    ```

2. Instale as dependências:
    ```bash
    pip install -r requirements.txt
    ```

3. Configure as variáveis de ambiente:
    ```bash
    export GITLAB_TOKEN=<seu_token_gitlab>
    export OPENAI_API_KEY=<seu_token_openai>
    ```

4. Execute o script principal:
    ```bash
    python main.py
    ```

## Contribuição

Contribuições são bem-vindas! Sinta-se à vontade para abrir issues ou enviar pull requests.

## Licença

Este projeto está licenciado sob a [MIT License](LICENSE).
# ai-mr-review