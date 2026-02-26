package com.panvel.crm.mcp.controller;

import com.panvel.crm.mcp.model.McpRequest;
import com.panvel.crm.mcp.model.McpResponse;
import com.panvel.crm.mcp.model.Tool;
import com.panvel.crm.mcp.model.ToolResult;
import com.panvel.crm.mcp.service.McpToolService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/mcp")
@RequiredArgsConstructor
public class McpController {

    private final McpToolService toolService;

    @Value("${mcp.server.name}")
    private String serverName;

    @Value("${mcp.server.version}")
    private String serverVersion;

    @PostMapping("/v1/messages")
    public ResponseEntity<McpResponse> handleMessage(@RequestBody McpRequest request) {
        log.info("Received MCP request - method: {}, id: {}", request.getMethod(), request.getRequestId());

        try {
            Object result;
            
            switch (request.getMethod()) {
                case "initialize":
                    result = handleInitialize();
                    break;
                    
                case "tools/list":
                    result = handleToolsList();
                    break;
                    
                case "tools/call":
                    result = handleToolsCall(request.getParams());
                    break;
                    
                default:
                    return ResponseEntity.ok(McpResponse.builder()
                            .jsonrpc("2.0")
                            .requestId(request.getRequestId())
                            .error(McpResponse.McpError.builder()
                                    .code(-32601)
                                    .message("Method not found: " + request.getMethod())
                                    .build())
                            .build());
            }

            return ResponseEntity.ok(McpResponse.builder()
                    .jsonrpc("2.0")
                    .requestId(request.getRequestId())
                    .result(result)
                    .build());
                    
        } catch (Exception e) {
            log.error("Error processing MCP request: {}", e.getMessage(), e);
            
            return ResponseEntity.ok(McpResponse.builder()
                    .jsonrpc("2.0")
                    .requestId(request.getRequestId())
                    .error(McpResponse.McpError.builder()
                            .code(-32603)
                            .message("Internal error: " + e.getMessage())
                            .build())
                    .build());
        }
    }

    private Map<String, Object> handleInitialize() {
        Map<String, Object> serverInfo = new HashMap<>();
        serverInfo.put("name", serverName);
        serverInfo.put("version", serverVersion);
        
        Map<String, Object> capabilities = new HashMap<>();
        capabilities.put("tools", Map.of("listChanged", false));
        
        Map<String, Object> result = new HashMap<>();
        result.put("protocolVersion", "2024-11-05");
        result.put("serverInfo", serverInfo);
        result.put("capabilities", capabilities);
        
        return result;
    }

    private Map<String, Object> handleToolsList() {
        List<Tool> tools = toolService.listTools();
        Map<String, Object> result = new HashMap<>();
        result.put("tools", tools);
        return result;
    }

    private ToolResult handleToolsCall(McpRequest.Params params) {
        if (params == null || params.getName() == null) {
            throw new IllegalArgumentException("Tool name is required");
        }
        
        return toolService.callTool(params.getName(), params.getArguments());
    }

    @GetMapping("/health")
    public ResponseEntity<Map<String, String>> health() {
        Map<String, String> status = new HashMap<>();
        status.put("status", "UP");
        status.put("server", serverName);
        status.put("version", serverVersion);
        return ResponseEntity.ok(status);
    }
}
