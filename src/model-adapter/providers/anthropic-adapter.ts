/**
 * Anthropic Adapter
 * Claude models with SSE streaming, tools, extended thinking
 */

import type {
  ProviderAdapter,
  ProviderConfig,
  ProviderRequest,
  Delta,
  ModelInfo,
  ModelCapabilities,
  AnthropicConfig,
} from '../types';
import { listModelsByProvider, toModelInfo } from '../model-registry';

// ============================================================================
// Anthropic API Types
// ============================================================================

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

interface AnthropicTool {
  name: string;
  description: string;
  input_schema: object;
}

interface AnthropicStreamEvent {
  type: string;
  [key: string]: unknown;
}

// ============================================================================
// Anthropic Provider Adapter
// ============================================================================

export class AnthropicAdapter implements ProviderAdapter {
  name = 'anthropic';
  displayName = 'Anthropic (Claude)';
  type: 'cloud' | 'local' = 'cloud';

  private apiKey: string | null = null;
  private baseUrl: string = 'https://api.anthropic.com/v1';
  private defaultModel = 'claude-sonnet-4-5-20251124';

  // ============================================================================
  // Configuration
  // ============================================================================

  configure(config: ProviderConfig): void {
    const anthropicConfig = config.credentials as AnthropicConfig | undefined;

    this.apiKey = anthropicConfig?.apiKey || null;
    this.baseUrl = anthropicConfig?.baseUrl || this.baseUrl;
    this.defaultModel = anthropicConfig?.defaultModel || this.defaultModel;
  }

  async validateCredentials(): Promise<boolean> {
    if (!this.apiKey) return false;

    try {
      // Simple health check: try to list models or make minimal request
      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  // ============================================================================
  // Model Operations
  // ============================================================================

  listModels(): ModelInfo[] {
    const modelIds = listModelsByProvider('anthropic');
    return modelIds
      .map(id => toModelInfo(id, this.apiKey !== null))
      .filter((info): info is ModelInfo => info !== null);
  }

  getCapabilities(model: string): ModelCapabilities | null {
    const fullId = `anthropic/${model}`;
    const info = toModelInfo(fullId);
    return info?.capabilities || null;
  }

  supportsModel(model: string): boolean {
    const modelIds = listModelsByProvider('anthropic');
    return modelIds.some(id => id.endsWith(model));
  }

  // ============================================================================
  // Main Completion Method
  // ============================================================================

  async *complete(request: ProviderRequest): AsyncIterable<Delta> {
    if (!this.apiKey) {
      yield {
        type: 'error',
        error: {
          code: 'MISSING_API_KEY',
          message: 'Anthropic API key not configured',
          provider: 'anthropic',
          retryable: false,
        },
      };
      return;
    }

    const body = this.buildRequestBody(request);

    try {
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
        signal: request.signal,
      });

      if (!response.ok) {
        yield* this.handleErrorResponse(response);
        return;
      }

      // Parse SSE stream
      yield* this.parseSSEStream(response.body!);
    } catch (error: any) {
      if (error.name === 'AbortError') {
        yield {
          type: 'error',
          error: {
            code: 'REQUEST_ABORTED',
            message: 'Request was aborted',
            provider: 'anthropic',
            retryable: false,
          },
        };
      } else {
        yield {
          type: 'error',
          error: {
            code: 'NETWORK_ERROR',
            message: error.message,
            provider: 'anthropic',
            retryable: true,
          },
        };
      }
    }
  }

  // ============================================================================
  // Request Building
  // ============================================================================

  private buildRequestBody(request: ProviderRequest): object {
    const body: any = {
      model: request.model,
      messages: this.convertMessages(request.messages),
      stream: true,
      max_tokens: request.parameters.maxTokens || 4096,
    };

    // System prompt
    if (request.systemPrompt) {
      body.system = request.systemPrompt;
    }

    // Tools
    if (request.tools && request.tools.length > 0) {
      body.tools = this.convertTools(request.tools);
    }

    // Generation parameters
    if (request.parameters.temperature !== undefined) {
      body.temperature = request.parameters.temperature;
    }
    if (request.parameters.topP !== undefined) {
      body.top_p = request.parameters.topP;
    }
    if (request.parameters.topK !== undefined) {
      body.top_k = request.parameters.topK;
    }
    if (request.parameters.stopSequences) {
      body.stop_sequences = request.parameters.stopSequences;
    }

    // Extended thinking (Anthropic-specific)
    if ((request.parameters as any).thinkingLevel) {
      body.thinking = {
        type: 'enabled',
        budget_tokens: (request.parameters as any).thinkingBudget || 5000,
      };
    }

    return body;
  }

  private convertMessages(messages: any[]): AnthropicMessage[] {
    return messages
      .filter(msg => msg.role !== 'system')
      .map(msg => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: this.convertContent(msg.content),
      }));
  }

  private convertContent(content: unknown): string | AnthropicContentBlock[] {
    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      return content.map(block => {
        switch (block.type) {
          case 'text':
            return { type: 'text', text: block.text };

          case 'image':
            return {
              type: 'image',
              source: {
                type: 'base64',
                media_type: block.source.mediaType || 'image/jpeg',
                data: block.source.data,
              },
            };

          case 'tool_use':
            return {
              type: 'tool_use',
              id: block.id,
              name: block.name,
              input: block.input,
            };

          case 'tool_result':
            let toolContent: string | AnthropicContentBlock[];
            if (Array.isArray(block.content)) {
              // Recursively convert content blocks if it's an array
              toolContent = block.content.map((b: any) => { 
                const converted = this.convertContent([b]); 
                return Array.isArray(converted) ? converted[0] : { type: 'text', text: String(converted) };
              }) as AnthropicContentBlock[];
            } else {
              toolContent = block.content as string;
            }
            
            return {
              type: 'tool_result',
              tool_use_id: block.toolUseId,
              content: toolContent,
              is_error: block.isError,
            };

          default:
            return block;
        }
      });
    }

    return String(content);
  }

  private convertTools(tools: any[]): AnthropicTool[] {
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    }));
  }

  // ============================================================================
  // SSE Stream Parsing
  // ============================================================================

  private async *parseSSEStream(stream: ReadableStream<Uint8Array>): AsyncIterable<Delta> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const event: AnthropicStreamEvent = JSON.parse(data);
              const delta = this.convertEventToDelta(event);
              if (delta) {
                yield delta;
              }
            } catch (error) {
              // Skip invalid JSON
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private convertEventToDelta(event: AnthropicStreamEvent): Delta | null {
    switch (event.type) {
      case 'content_block_start':
        if ((event as any).content_block?.type === 'tool_use') {
          return {
            type: 'tool_use_start',
            id: (event as any).content_block.id,
            name: (event as any).content_block.name,
          };
        }
        return null;

      case 'content_block_delta':
        const delta = (event as any).delta;

        if (delta.type === 'text_delta') {
          return { type: 'text', text: delta.text };
        }

        if (delta.type === 'input_json_delta') {
          return {
            type: 'tool_use_delta',
            id: (event as any).index?.toString() || 'unknown',
            input: delta.partial_json,
          };
        }

        if (delta.type === 'thinking_delta') {
          return { type: 'thinking', text: delta.thinking };
        }

        return null;

      case 'content_block_stop':
        // Tool use ended
        if ((event as any).content_block?.type === 'tool_use') {
          return {
            type: 'tool_use_end',
            id: (event as any).content_block.id,
          };
        }
        return null;

      case 'message_stop':
      case 'message_delta':
        if (event.type === 'message_delta' && (event as any).usage) {
          return {
            type: 'done',
            usage: this.convertUsage((event as any).usage),
            stopReason: this.convertStopReason((event as any).delta?.stop_reason),
          };
        }
        return null;

      default:
        return null;
    }
  }

  private convertUsage(usage: any): any {
    return {
      inputTokens: usage.input_tokens || 0,
      outputTokens: usage.output_tokens || 0,
      cacheReadTokens: usage.cache_read_input_tokens,
      cacheWriteTokens: usage.cache_creation_input_tokens,
    };
  }

  private convertStopReason(reason: string | undefined): any {
    switch (reason) {
      case 'end_turn':
        return 'end_turn';
      case 'tool_use':
        return 'tool_use';
      case 'max_tokens':
        return 'max_tokens';
      case 'stop_sequence':
        return 'stop_sequence';
      default:
        return 'end_turn';
    }
  }

  // ============================================================================
  // Error Handling
  // ============================================================================

  private async *handleErrorResponse(response: Response): AsyncIterable<Delta> {
    let errorData: any;
    try {
      errorData = await response.json();
    } catch {
      errorData = { error: { message: response.statusText } };
    }

    const error = errorData.error || {};
    yield {
      type: 'error',
      error: {
        code: error.type || 'UNKNOWN_ERROR',
        message: error.message || 'Unknown error',
        provider: 'anthropic',
        retryable: this.isRetryableStatus(response.status),
        statusCode: response.status,
        details: error,
      },
    };
  }

  private isRetryableStatus(status: number): boolean {
    return status === 429 || status >= 500;
  }

  // ============================================================================
  // Health
  // ============================================================================

  async healthCheck(): Promise<boolean> {
    return this.validateCredentials();
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  async dispose(): Promise<void> {
    // No cleanup needed
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': this.apiKey!,
    };
  }
}
