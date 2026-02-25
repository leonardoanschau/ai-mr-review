package com.panvel.crm.mcp.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Data
@Configuration
@ConfigurationProperties(prefix = "gitlab")
public class GitLabProperties {
    private String apiUrl;
    private String token;
    private String defaultGroup;
    private String defaultAssignee;
    private String defaultBacklogLabel;
    private int timeout;
}
