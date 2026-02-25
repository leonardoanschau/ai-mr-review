package com.panvel.crm.mcp.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class McpResponse {
    @Builder.Default
    private String jsonrpc = "2.0";
    
    @JsonProperty("id")
    private Object requestId;
    
    private Object result;
    private McpError error;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class McpError {
        private int code;
        private String message;
        private Object data;
    }
}
