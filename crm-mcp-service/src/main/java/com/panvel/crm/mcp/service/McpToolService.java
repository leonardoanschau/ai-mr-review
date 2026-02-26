package com.panvel.crm.mcp.service;

import com.panvel.crm.mcp.config.GitLabProperties;
import com.panvel.crm.mcp.model.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.gitlab4j.api.GitLabApiException;
import org.gitlab4j.api.models.Issue;
import org.springframework.stereotype.Service;

import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class McpToolService {

    private final GitLabService gitLabService;
    private final OpenAIService openAIService;
    private final GitLabProperties gitLabProperties;

    public List<Tool> listTools() {
        List<Tool> tools = new ArrayList<>();

        // Tool 1: list_gitlab_projects
        tools.add(Tool.builder()
                .name("list_gitlab_projects")
                .description("Lista todos os projetos GitLab do grupo CRM configurado")
                .inputSchema(Tool.InputSchema.builder()
                        .type("object")
                        .properties(new HashMap<>())
                        .required(new String[]{})
                        .build())
                .build());

        // Tool 2: create_gitlab_issue
        Map<String, Tool.Property> createIssueProps = new HashMap<>();
        createIssueProps.put("project_id", Tool.Property.builder()
                .type("string")
                .description("ID do projeto GitLab")
                .build());
        createIssueProps.put("title", Tool.Property.builder()
                .type("string")
                .description("Título da issue")
                .build());
        createIssueProps.put("description", Tool.Property.builder()
                .type("string")
                .description("Descrição da issue em Markdown")
                .build());
        createIssueProps.put("assignee", Tool.Property.builder()
                .type("string")
                .description("Username do responsável (opcional)")
                .build());
        createIssueProps.put("label", Tool.Property.builder()
                .type("string")
                .description("Label da issue (opcional, padrão: " + gitLabProperties.getDefaultBacklogLabel() + ")")
                .build());

        tools.add(Tool.builder()
                .name("create_gitlab_issue")
                .description("Cria uma nova issue no GitLab com os dados fornecidos")
                .inputSchema(Tool.InputSchema.builder()
                        .type("object")
                        .properties(createIssueProps)
                        .required(new String[]{"project_id", "title", "description"})
                        .build())
                .build());

        // Tool 3: generate_issue_content
        Map<String, Tool.Property> generateProps = new HashMap<>();
        generateProps.put("prompt", Tool.Property.builder()
                .type("string")
                .description("Prompt descrevendo a issue desejada")
                .build());

        tools.add(Tool.builder()
                .name("generate_issue_content")
                .description("Gera conteúdo para uma issue usando IA (título e descrição)")
                .inputSchema(Tool.InputSchema.builder()
                        .type("object")
                        .properties(generateProps)
                        .required(new String[]{"prompt"})
                        .build())
                .build());

        return tools;
    }

    public ToolResult callTool(String toolName, Map<String, Object> arguments) {
        try {
            log.info("Calling tool: {} with arguments: {}", toolName, arguments);

            switch (toolName) {
                case "list_gitlab_projects":
                    return listGitLabProjects();
                    
                case "create_gitlab_issue":
                    return createGitLabIssue(arguments);
                    
                case "generate_issue_content":
                    return generateIssueContent(arguments);
                    
                default:
                    return errorResult("Unknown tool: " + toolName);
            }
        } catch (Exception e) {
            log.error("Error calling tool {}: {}", toolName, e.getMessage(), e);
            return errorResult("Error: " + e.getMessage());
        }
    }

    private ToolResult listGitLabProjects() throws GitLabApiException {
        List<GitLabProject> projects = gitLabService.listProjectsFromGroup();
        
        StringBuilder result = new StringBuilder("Projects in group '" + gitLabProperties.getDefaultGroup() + "':\n\n");
        for (GitLabProject project : projects) {
            result.append(String.format("- %s (ID: %d)\n", project.getName(), project.getId()));
            if (project.getDescription() != null && !project.getDescription().isEmpty()) {
                result.append(String.format("  Description: %s\n", project.getDescription()));
            }
        }
        
        return successResult(result.toString());
    }

    private ToolResult createGitLabIssue(Map<String, Object> arguments) throws GitLabApiException {
        Long projectId = Long.valueOf(arguments.get("project_id").toString());
        String title = (String) arguments.get("title");
        String description = (String) arguments.get("description");
        String assignee = (String) arguments.getOrDefault("assignee", gitLabProperties.getDefaultAssignee());
        String label = (String) arguments.getOrDefault("label", gitLabProperties.getDefaultBacklogLabel());

        Issue issue = gitLabService.createIssue(projectId, title, description, assignee, label);
        
        String result = String.format(
            "✅ Issue criada com sucesso!\n\n" +
            "- Título: %s\n" +
            "- Issue ID: #%d\n" +
            "- Projeto: %s\n" +
            "- URL: %s\n" +
            "- Assignee: %s\n" +
            "- Label: %s",
            issue.getTitle(),
            issue.getIid(),
            projectId,
            issue.getWebUrl(),
            assignee,
            label
        );
        
        return successResult(result);
    }

    private ToolResult generateIssueContent(Map<String, Object> arguments) {
        String prompt = (String) arguments.get("prompt");
        String content = openAIService.generateIssueContent(prompt);
        return successResult(content);
    }

    private ToolResult successResult(String text) {
        return ToolResult.builder()
                .content(List.of(ToolResult.Content.builder()
                        .type("text")
                        .text(text)
                        .build()))
                .isError(false)
                .build();
    }

    private ToolResult errorResult(String errorMessage) {
        return ToolResult.builder()
                .content(List.of(ToolResult.Content.builder()
                        .type("text")
                        .text(errorMessage)
                        .build()))
                .isError(true)
                .build();
    }
}
