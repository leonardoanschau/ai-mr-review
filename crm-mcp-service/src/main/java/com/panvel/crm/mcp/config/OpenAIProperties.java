package com.panvel.crm.mcp.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Data
@Configuration
@ConfigurationProperties(prefix = "openai")
public class OpenAIProperties {
    private String apiKey;
    private String model = "gpt-4o";
    private double temperature = 0.7;
    private int timeout = 90;
}
