package com.panvel.crm.mcp.handler;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.panvel.crm.mcp.model.McpRequest;
import com.panvel.crm.mcp.model.McpResponse;
import com.panvel.crm.mcp.model.ToolResult;
import com.panvel.crm.mcp.service.McpToolService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.util.HashMap;
import java.util.Map;

@Slf4j
@Component
@RequiredArgsConstructor
public class McpWebSocketHandler extends TextWebSocketHandler {

    private final McpToolService toolService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${mcp.server.name}")
    private String serverName;

    @Value("${mcp.server.version}")
    private String serverVersion;

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        log.info("WebSocket connection established: {}", session.getId());
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        String payload = message.getPayload();
        log.info("Received WebSocket message: {}", payload);

        try {
            McpRequest request = objectMapper.readValue(payload, McpRequest.class);
            McpResponse response;

            switch (request.getMethod()) {
                case "initialize":
                    response = handleInitialize(request);
                    break;
                    
                case "tools/list":
                    response = handleToolsList(request);
                    break;
                    
                case "tools/call":
                    response = handleToolsCall(request);
                    break;
                    
                default:
                    response = McpResponse.builder()
                            .jsonrpc("2.0")
                            .requestId(request.getRequestId())
                            .error(McpResponse.McpError.builder()
                                    .code(-32601)
                                    .message("Method not found: " + request.getMethod())
                                    .build())
                            .build();
            }

            String responseJson = objectMapper.writeValueAsString(response);
            session.sendMessage(new TextMessage(responseJson));
            
        } catch (Exception e) {
            log.error("Error processing WebSocket message: {}", e.getMessage(), e);
            
            McpResponse errorResponse = McpResponse.builder()
                    .jsonrpc("2.0")
                    .error(McpResponse.McpError.builder()
                            .code(-32603)
                            .message("Internal error: " + e.getMessage())
                            .build())
                    .build();
                    
            String responseJson = objectMapper.writeValueAsString(errorResponse);
            session.sendMessage(new TextMessage(responseJson));
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        log.info("WebSocket connection closed: {} - Status: {}", session.getId(), status);
    }

    private McpResponse handleInitialize(McpRequest request) {
        Map<String, Object> serverInfo = new HashMap<>();
        serverInfo.put("name", serverName);
        serverInfo.put("version", serverVersion);
        
        Map<String, Object> capabilities = new HashMap<>();
        capabilities.put("tools", Map.of("listChanged", false));
        
        Map<String, Object> result = new HashMap<>();
        result.put("protocolVersion", "2024-11-05");
        result.put("serverInfo", serverInfo);
        result.put("capabilities", capabilities);

        return McpResponse.builder()
                .jsonrpc("2.0")
                .requestId(request.getRequestId())
                .result(result)
                .build();
    }

    private McpResponse handleToolsList(McpRequest request) {
        Map<String, Object> result = new HashMap<>();
        result.put("tools", toolService.listTools());

        return McpResponse.builder()
                .jsonrpc("2.0")
                .requestId(request.getRequestId())
                .result(result)
                .build();
    }

    private McpResponse handleToolsCall(McpRequest request) {
        if (request.getParams() == null || request.getParams().getName() == null) {
            return McpResponse.builder()
                    .jsonrpc("2.0")
                    .requestId(request.getRequestId())
                    .error(McpResponse.McpError.builder()
                            .code(-32602)
                            .message("Invalid params: tool name is required")
                            .build())
                    .build();
        }

        try {
            ToolResult toolResult = toolService.callTool(
                    request.getParams().getName(), 
                    request.getParams().getArguments()
            );

            return McpResponse.builder()
                    .jsonrpc("2.0")
                    .requestId(request.getRequestId())
                    .result(toolResult)
                    .build();
                    
        } catch (Exception e) {
            log.error("Error calling tool: {}", e.getMessage(), e);
            
            return McpResponse.builder()
                    .jsonrpc("2.0")
                    .requestId(request.getRequestId())
                    .error(McpResponse.McpError.builder()
                            .code(-32603)
                            .message("Tool execution failed: " + e.getMessage())
                            .build())
                    .build();
        }
    }
}
