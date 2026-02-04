/**
 * llama.cpp Adapter
 * Local models via llama.cpp server (OpenAI-compatible API)
 */

import type {
  ProviderAdapter,
  ProviderConfig,
  ProviderRequest,
  Delta,
  ModelInfo,
  ModelCapabilities,
  LlamaCppConfig,
} from '../types';
import { listModelsByProvider, toModelInfo } from '../model-registry';

// ============================================================================
// llama.cpp uses OpenAI-compatible API
// ============================================================================

interface LlamaCppMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LlamaCppStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
    };
    finish_reason?: string | null;
  }>;
}

// ============================================================================
// llama.cpp Provider Adapter
// ============================================================================

export class LlamaCppAdapter implements ProviderAdapter {
  name = 'llamacpp';
  displayName = 'llama.cpp (Local)';
  type: 'cloud' | 'local' = 'local';

  private baseUrl: string = 'http://localhost:8080';

  // ============================================================================
  // Configuration
  // ============================================================================

  configure(config: ProviderConfig): void {
    const llamacppConfig = config.credentials as LlamaCppConfig | undefined;

    this.baseUrl = llamacppConfig?.baseUrl || this.baseUrl;
  }

  async validateCredentials(): Promise<boolean> {
    try {
      // llama.cpp exposes /health endpoint
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
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
    const modelIds = listModelsByProvider('llamacpp');
    return modelIds
      .map(id => toModelInfo(id, true))  // Always available if llama.cpp is running
      .filter((info): info is ModelInfo => info !== null);
  }

  getCapabilities(model: string): ModelCapabilities | null {
    const fullId = `llamacpp/${model}`;
    const info = toModelInfo(fullId);
    return info?.capabilities || null;
  }

  supportsModel(model: string): boolean {
    // llama.cpp runs one model at a time, identified as "local"
    return model === 'local';
  }

  // ============================================================================
  // Main Completion Method
  // ============================================================================

  async *complete(request: ProviderRequest): AsyncIterable<Delta> {
    const body = this.buildRequestBody(request);

    try {
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: request.signal,
      });

      if (!response.ok) {
        yield* this.handleErrorResponse(response);
        return;
      }

      // Parse SSE stream (OpenAI-compatible)
      yield* this.parseSSEStream(response.body!);
    } catch (error: any) {
      if (error.name === 'AbortError') {
        yield {
          type: 'error',
          error: {
            code: 'REQUEST_ABORTED',
            message: 'Request was aborted',
            provider: 'llamacpp',
            retryable: false,
          },
        };
      } else {
        yield {
          type: 'error',
          error: {
            code: 'NETWORK_ERROR',
            message: error.message,
            provider: 'llamacpp',
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
      model: 'local',  // llama.cpp doesn't use model name
      messages: this.convertMessages(request.messages, request.systemPrompt),
      stream: true,
      max_tokens: request.parameters.maxTokens || 2048,
    };

    // Generation parameters
    if (request.parameters.temperature !== undefined) {
      body.temperature = request.parameters.temperature;
    }
    if (request.parameters.topP !== undefined) {
      body.top_p = request.parameters.topP;
    }
    if (request.parameters.stopSequences) {
      body.stop = request.parameters.stopSequences;
    }

    // JSON mode (via grammar)
    if ((request.parameters as any).jsonMode) {
      body.response_format = { type: 'json_object' };
    }

    return body;
  }

  private convertMessages(messages: any[], systemPrompt?: string): LlamaCppMessage[] {
    const converted: LlamaCppMessage[] = [];

    // Add system message first if present
    if (systemPrompt) {
      converted.push({
        role: 'system',
        content: systemPrompt,
      });
    }

    // Convert other messages
    for (const msg of messages) {
      converted.push({
        role: msg.role === 'assistant' ? 'assistant' : msg.role === 'system' ? 'system' : 'user',
        content: this.extractText(msg.content),
      });
    }

    return converted;
  }

  private extractText(content: unknown): string {
    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      const textBlocks = content.filter(block => block.type === 'text');
      return textBlocks.map(block => block.text).join('\n');
    }

    return String(content);
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
              const chunk: LlamaCppStreamChunk = JSON.parse(data);
              yield* this.convertChunkToDeltas(chunk);
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

  private *convertChunkToDeltas(chunk: LlamaCppStreamChunk): Iterable<Delta> {
    const choice = chunk.choices[0];
    if (!choice) return;

    const { delta, finish_reason } = choice;

    // Text content
    if (delta.content) {
      yield { type: 'text', text: delta.content };
    }

    // Finish
    if (finish_reason) {
      yield {
        type: 'done',
        usage: {
          inputTokens: 0,  // llama.cpp doesn't always provide usage
          outputTokens: 0,
        },
        stopReason: this.convertFinishReason(finish_reason),
      };
    }
  }

  private convertFinishReason(reason: string): any {
    switch (reason) {
      case 'stop':
        return 'end_turn';
      case 'length':
        return 'max_tokens';
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
        code: error.code || 'UNKNOWN_ERROR',
        message: error.message || 'Unknown error',
        provider: 'llamacpp',
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
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  async dispose(): Promise<void> {
    // No cleanup needed
  }
}
