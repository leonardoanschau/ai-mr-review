package com.panvel.crm.mcp.service;

import com.panvel.crm.mcp.config.GitLabProperties;
import com.panvel.crm.mcp.model.GitLabProject;
import io.github.resilience4j.retry.annotation.Retry;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.gitlab4j.api.GitLabApi;
import org.gitlab4j.api.GitLabApiException;
import org.gitlab4j.api.models.Issue;
import org.gitlab4j.api.models.Project;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class GitLabService {

    private final GitLabApi gitLabApi;
    private final GitLabProperties properties;

    @Cacheable("projects")
    @Retry(name = "gitlab")
    public List<GitLabProject> listProjectsFromGroup() throws GitLabApiException {
        log.info("Fetching projects from group: {}", properties.getDefaultGroup());
        
        List<Project> projects = gitLabApi.getGroupApi()
                .getProjects(properties.getDefaultGroup());
        
        return projects.stream()
                .map(p -> GitLabProject.builder()
                        .id(p.getId())
                        .name(p.getName())
                        .path(p.getPath())
                        .description(p.getDescription())
                        .build())
                .collect(Collectors.toList());
    }

    @Retry(name = "gitlab")
    public Issue createIssue(Long projectId, String title, String description, 
                            String assignee, String label) throws GitLabApiException {
        log.info("Creating issue in project {}: {}", projectId, title);
        
        // Create issue with title and description using the correct API signature
        Issue created = gitLabApi.getIssuesApi().createIssue(
            projectId.toString(), 
            title, 
            description
        );
        
        log.info("Issue created successfully: #{}", created.getIid());
        
        // Try to update with assignee and labels in a separate call
        if ((assignee != null && !assignee.isEmpty()) || (label != null && !label.isEmpty())) {
            try {
                Long assigneeId = null;
                if (assignee != null && !assignee.isEmpty()) {
                    try {
                        org.gitlab4j.api.models.User user = gitLabApi.getUserApi().getUser(assignee);
                        if (user != null) {
                            assigneeId = user.getId();
                        }
                    } catch (Exception e) {
                        log.warn("Failed to get user {}: {}", assignee, e.getMessage());
                    }
                }
                
                // Update issue with assignee and/or labels
                gitLabApi.getIssuesApi().updateIssue(
                    projectId.toString(),
                    created.getIid(),
                    null,  // title
                    null,  // description
                    null,  // confidential
                    assigneeId != null ? List.of(assigneeId) : null,  // assigneeIds
                    null,  // milestoneId
                    label,  // labels
                    null,  // stateEvent
                    null,  // updatedAt
                    null   // dueDate
                );
                
                log.info("Issue updated with assignee/label");
            } catch (Exception e) {
                log.warn("Failed to update issue with assignee/label: {}", e.getMessage());
            }
        }
        
        return created;
    }

    public Project getProject(Long projectId) throws GitLabApiException {
        return gitLabApi.getProjectApi().getProject(projectId);
    }
}
