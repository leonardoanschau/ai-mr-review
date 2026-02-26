package com.panvel.crm.mcp.service;

import com.panvel.crm.mcp.config.OpenAIProperties;
import com.theokanning.openai.completion.chat.ChatCompletionRequest;
import com.theokanning.openai.completion.chat.ChatMessage;
import com.theokanning.openai.completion.chat.ChatMessageRole;
import com.theokanning.openai.service.OpenAiService;
import io.github.resilience4j.retry.annotation.Retry;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.Arrays;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class OpenAIService {

    private final OpenAiService openAiService;
    private final OpenAIProperties properties;

    @Retry(name = "openai")
    public String generateIssueContent(String prompt) {
        log.info("Generating issue content with OpenAI");
        
        List<ChatMessage> messages = Arrays.asList(
            new ChatMessage(ChatMessageRole.SYSTEM.value(), 
                "Você é um assistente especializado em criar histórias de usuário e issues para GitLab. " +
                "Formate a resposta em Markdown com seções bem definidas."),
            new ChatMessage(ChatMessageRole.USER.value(), prompt)
        );

        ChatCompletionRequest request = ChatCompletionRequest.builder()
                .model(properties.getModel())
                .messages(messages)
                .temperature(properties.getTemperature())
                .build();

        String response = openAiService.createChatCompletion(request)
                .getChoices()
                .get(0)
                .getMessage()
                .getContent();
        
        log.info("Generated {} characters of content", response.length());
        return response;
    }
}
