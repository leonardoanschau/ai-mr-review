package com.panvel.crm.mcp.config;

import com.theokanning.openai.service.OpenAiService;
import org.gitlab4j.api.GitLabApi;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

@Configuration
public class ClientConfig {

    @Bean
    public GitLabApi gitLabApi(GitLabProperties properties) {
        return new GitLabApi(properties.getApiUrl(), properties.getToken());
    }

    @Bean
    public OpenAiService openAiService(OpenAIProperties properties) {
        return new OpenAiService(properties.getApiKey(), Duration.ofSeconds(properties.getTimeout()));
    }
}
