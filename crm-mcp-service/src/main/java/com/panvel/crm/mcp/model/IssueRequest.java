package com.panvel.crm.mcp.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class IssueRequest {
    private Long projectId;
    private String title;
    private String description;
    private String assignee;
    private String label;
}
