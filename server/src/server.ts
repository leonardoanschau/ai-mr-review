#!/usr/bin/env node
/**
 * GitLab MCP Server
 * Model Context Protocol server for GitLab integration
 */

import * as readline from 'readline';
import { GitLabApiClient } from './gitlab/api.js';
import { McpToolHandlers } from './mcp/handlers.js';
import { McpToolsDefinition } from './mcp/tools.js';
import {
  JSONRPC_VERSION,
  MCP_PROTOCOL_VERSION,
  ErrorCode,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcError,
  InitializeParams,
  InitializeResult,
} from './mcp/protocol.js';
import { ConfigManager, ConfigError } from './utils/config.js';
import { logger } from './utils/logger.js';

/**
 * MCP Server Main Class
 */
class McpServer {
  private handlers: McpToolHandlers;

  constructor() {
    // Validate configuration on startup
    try {
      ConfigManager.validateConfig();
      const config = ConfigManager.getConfig();
      
      // Initialize API client and handlers
      const api = new GitLabApiClient(config.apiUrl, config.token);
      this.handlers = new McpToolHandlers(api);
      
      logger.info('GitLab MCP Server initialized successfully');
    } catch (error) {
      if (error instanceof ConfigError) {
        logger.error('Configuration error', { error: error.message });
        process.exit(1);
      }
      throw error;
    }
  }

  /**
   * Create JSON-RPC success response
   */
  private createResponse(id: string | number | null, result: unknown): JsonRpcResponse {
    return {
      jsonrpc: JSONRPC_VERSION,
      id,
      result,
    };
  }

  /**
   * Create JSON-RPC error response
   */
  private createErrorResponse(
    id: string | number | null,
    code: number,
    message: string,
    data?: unknown
  ): JsonRpcResponse {
    const error: JsonRpcError = { code, message, data };
    return {
      jsonrpc: JSONRPC_VERSION,
      id,
      error,
    };
  }

  /**
   * Handle initialize request
   */
  private handleInitialize(params: InitializeParams): InitializeResult {
    logger.info('Handling initialize request', {
      clientName: params.clientInfo.name,
      protocolVersion: params.protocolVersion,
    });

    return {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {
        tools: {},
      },
      serverInfo: {
        name: 'gitlab-mcp-server',
        version: '1.0.0',
      },
    };
  }

  /**
   * Handle tools/list request
   */
  private handleListTools(): { tools: ReturnType<typeof McpToolsDefinition.getAllTools> } {
    logger.info('Handling tools/list request');
    return {
      tools: McpToolsDefinition.getAllTools(),
    };
  }

  /**
   * Handle tools/call request
   */
  private async handleCallTool(params: {
    name: string;
    arguments?: unknown;
  }): Promise<unknown> {
    const toolName = params.name;
    const args = params.arguments || {};

    logger.info(`Handling tools/call request for: ${toolName}`);
    return await this.handlers.handleToolCall(toolName, args);
  }

  /**
   * Process incoming JSON-RPC message
   */
  private async processMessage(message: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    const { id, method, params } = message;

    try {
      // Handle different methods
      let result: unknown;

      switch (method) {
        case 'initialize':
          result = this.handleInitialize(params as InitializeParams);
          break;

        case 'tools/list':
          result = this.handleListTools();
          break;

        case 'tools/call':
          result = await this.handleCallTool(
            params as { name: string; arguments?: unknown }
          );
          break;

        case 'notifications/initialized':
          // No response needed for notifications
          return null;

        default:
          logger.error(`Unknown method: ${method}`);
          return this.createErrorResponse(
            id === undefined ? null : id,
            ErrorCode.MethodNotFound,
            `Method not found: ${method}`
          );
      }

      return this.createResponse(id === undefined ? null : id, result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error processing method ${method}`, { error: errorMessage });

      return this.createErrorResponse(
        id === undefined ? null : id,
        ErrorCode.InternalError,
        errorMessage
      );
    }
  }

  /**
   * Handle incoming line from stdin
   */
  private async handleLine(line: string): Promise<void> {
    if (!line.trim()) {
      return;
    }

    try {
      const message = JSON.parse(line) as JsonRpcRequest;
      const response = await this.processMessage(message);

      if (response) {
        // Write response to stdout (JSON-RPC communication channel)
        process.stdout.write(JSON.stringify(response) + '\n');
      }
    } catch (error) {
      if (error instanceof SyntaxError) {
        logger.error('JSON parse error', { error: error.message, line });
        const errorResponse = this.createErrorResponse(
          null,
          ErrorCode.ParseError,
          'Parse error'
        );
        process.stdout.write(JSON.stringify(errorResponse) + '\n');
      } else {
        logger.error('Unexpected error processing message', { error });
      }
    }
  }

  /**
   * Start the server and listen for JSON-RPC messages on stdin
   */
  start(): void {
    logger.info('Starting GitLab MCP Server...');
    logger.info(`Protocol version: ${MCP_PROTOCOL_VERSION}`);

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    rl.on('line', async (line) => {
      await this.handleLine(line);
    });

    rl.on('close', () => {
      logger.info('Server shutting down');
      process.exit(0);
    });

    // Handle errors
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', { error: error.message });
      process.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled rejection', { reason });
      process.exit(1);
    });

    logger.info('Server started and listening for JSON-RPC messages on stdin');
  }
}

// Start the server
const server = new McpServer();
server.start();
