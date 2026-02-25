package com.panvel.crm.mcp.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

import java.util.Map;

@Data
public class McpRequest {
    private String jsonrpc = "2.0";
    private String method;
    private Params params;
    
    @JsonProperty("id")
    private Object requestId;

    @Data
    public static class Params {
        private String name;
        private Map<String, Object> arguments;
    }
}
