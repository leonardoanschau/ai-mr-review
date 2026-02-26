package com.panvel.crm.mcp.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GitLabProject {
    private Long id;
    private String name;
    private String path;
    private String description;
}
