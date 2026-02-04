/**
 * Ollama Adapter
 * Local models with NDJSON streaming, tools support
 */

import type {
  ProviderAdapter,
  ProviderConfig,
  ProviderRequest,
  Delta,
  ModelInfo,
  ModelCapabilities,
  OllamaConfig,
} from '../types';
import { listModelsByProvider, toModelInfo } from '../model-registry';

// ============================================================================
// Ollama API Types
// ============================================================================

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  images?: string[];  // base64 encoded
  tool_calls?: Array<{
    id: string;
    function: {
      name: string;
      arguments: unknown;
    };
  }>;
  tool_call_id?: string;
}

interface OllamaTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: object;
  };
}

interface OllamaStreamChunk {
  model: string;
  created_at: string;
  message?: {
    role: string;
    content: string;
    thinking?: string;
    tool_calls?: Array<{
      id: string;
      function: {
        index?: number;
        name: string;
        arguments: unknown;
      };
    }>;
  };
  done: boolean;
  done_reason?: string;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

// ============================================================================
// Ollama Provider Adapter
// ============================================================================

export class OllamaAdapter implements ProviderAdapter {
  name = 'ollama';
  displayName = 'Ollama (Local)';
  type: 'cloud' | 'local' = 'local';

  private baseUrl: string = 'http://localhost:11434';
  private defaultModel = 'gpt-oss:20b';

  // ============================================================================
  // Configuration
  // ============================================================================

  configure(config: ProviderConfig): void {
    const ollamaConfig = config.credentials as OllamaConfig | undefined;

    this.baseUrl = ollamaConfig?.baseUrl || this.baseUrl;
    this.defaultModel = ollamaConfig?.defaultModel || this.defaultModel;
  }

  async validateCredentials(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
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
    const modelIds = listModelsByProvider('ollama');
    return modelIds
      .map(id => toModelInfo(id, true))  // Always available if Ollama is running
      .filter((info): info is ModelInfo => info !== null);
  }

  getCapabilities(model: string): ModelCapabilities | null {
    const fullId = `ollama/${model}`;
    const info = toModelInfo(fullId);
    return info?.capabilities || null;
  }

  supportsModel(model: string): boolean {
    const modelIds = listModelsByProvider('ollama');
    return modelIds.some(id => id.endsWith(model));
  }

  // ============================================================================
  // Main Completion Method
  // ============================================================================

  async *complete(request: ProviderRequest): AsyncIterable<Delta> {
    const body = this.buildRequestBody(request);

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: request.signal,
      });

      if (!response.ok) {
        yield* this.handleErrorResponse(response);
        return;
      }

      // Parse NDJSON stream
      yield* this.parseNDJSONStream(response.body!);
    } catch (error: any) {
      if (error.name === 'AbortError') {
        yield {
          type: 'error',
          error: {
            code: 'REQUEST_ABORTED',
            message: 'Request was aborted',
            provider: 'ollama',
            retryable: false,
          },
        };
      } else {
        yield {
          type: 'error',
          error: {
            code: 'NETWORK_ERROR',
            message: error.message,
            provider: 'ollama',
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
      messages: this.convertMessages(request.messages, request.systemPrompt),
      stream: true,
    };

    // Tools
    if (request.tools && request.tools.length > 0) {
      body.tools = this.convertTools(request.tools);
    }

    // Generation parameters
    const options: any = {};

    if (request.parameters.temperature !== undefined) {
      options.temperature = request.parameters.temperature;
    }
    if (request.parameters.topP !== undefined) {
      options.top_p = request.parameters.topP;
    }
    if (request.parameters.topK !== undefined) {
      options.top_k = request.parameters.topK;
    }
    if (request.parameters.stopSequences) {
      options.stop = request.parameters.stopSequences;
    }

    if (Object.keys(options).length > 0) {
      body.options = options;
    }

    // JSON mode
    if ((request.parameters as any).jsonMode) {
      body.format = 'json';
    }

    return body;
  }

  private convertMessages(messages: any[], systemPrompt?: string): OllamaMessage[] {
    const converted: OllamaMessage[] = [];

    // Add system message first if present
    if (systemPrompt) {
      converted.push({
        role: 'system',
        content: systemPrompt,
      });
    }

    // Convert other messages
    for (const msg of messages) {
      const role: OllamaMessage['role'] =
        msg.role === 'assistant'
          ? 'assistant'
          : msg.role === 'system'
            ? 'system'
            : 'user';

      if (Array.isArray(msg.content)) {
        const textBlocks = msg.content.filter((block: any) => block?.type === 'text');
        const toolUseBlocks = msg.content.filter((block: any) => block?.type === 'tool_use');
        const toolResultBlocks = msg.content.filter((block: any) => block?.type === 'tool_result');

        const textContent = textBlocks.map((b: any) => b.text).join('\n');
        if (textContent || role === 'assistant' || role === 'user') {
          const baseMessage: OllamaMessage = {
            role,
            content: textContent || '',
          };

          const images = this.extractImages(msg.content);
          if (images.length > 0) {
            baseMessage.images = images;
          }

          if (toolUseBlocks.length > 0 && role === 'assistant') {
            baseMessage.tool_calls = toolUseBlocks.map((block: any) => ({
              id: block.id,
              function: {
                name: block.name,
                arguments: block.input ?? {},
              },
            }));
          }

          converted.push(baseMessage);
        }

        for (const block of toolResultBlocks) {
          converted.push({
            role: 'tool',
            content: typeof block.content === 'string' ? block.content : JSON.stringify(block.content),
            tool_call_id: block.toolUseId,
          });
        }

        continue;
      }

      const ollamaMsg: OllamaMessage = {
        role,
        content: this.extractText(msg.content),
      };

      // Extract images
      const images = this.extractImages(msg.content);
      if (images.length > 0) {
        ollamaMsg.images = images;
      }

      converted.push(ollamaMsg);
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

  private extractImages(content: unknown): string[] {
    if (!Array.isArray(content)) return [];

    const imageBlocks = content.filter(block => block.type === 'image');
    return imageBlocks.map(block => block.source.data);
  }

  private convertTools(tools: any[]): OllamaTool[] {
    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  // ============================================================================
  // NDJSON Stream Parsing
  // ============================================================================

  private async *parseNDJSONStream(stream: ReadableStream<Uint8Array>): AsyncIterable<Delta> {
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
          if (!line.trim()) continue;

          try {
            const chunk: OllamaStreamChunk = JSON.parse(line);
            yield* this.convertChunkToDeltas(chunk);
          } catch (error) {
            // Skip invalid JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private *convertChunkToDeltas(chunk: OllamaStreamChunk): Iterable<Delta> {
    const toolCalls = chunk.message?.tool_calls;
    const hasToolCalls = Array.isArray(toolCalls) && toolCalls.length > 0;

    // Content
    if (chunk.message?.content) {
      yield { type: 'text', text: chunk.message.content };
    }

    // Tool calls (Ollama returns them in message.tool_calls)
    if (hasToolCalls) {
      for (const call of toolCalls!) {
        const toolCallId = call.id;
        const toolName = call.function?.name;
        if (!toolCallId || !toolName) continue;

        yield { type: 'tool_use_start', id: toolCallId, name: toolName };

        // Ollama returns fully-parsed arguments as an object
        const argsJson = JSON.stringify(call.function?.arguments ?? {});
        yield { type: 'tool_use_delta', id: toolCallId, input: argsJson };

        yield { type: 'tool_use_end', id: toolCallId };
      }
    }

    // Done
    if (chunk.done) {
      yield {
        type: 'done',
        usage: {
          inputTokens: chunk.prompt_eval_count || 0,
          outputTokens: chunk.eval_count || 0,
        },
        stopReason: hasToolCalls ? 'tool_use' : 'end_turn',
      };
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
      errorData = { error: response.statusText };
    }

    const error = errorData.error || errorData;
    yield {
      type: 'error',
      error: {
        code: typeof error === 'string' ? 'OLLAMA_ERROR' : (error.code || 'UNKNOWN_ERROR'),
        message: typeof error === 'string' ? error : (error.message || 'Unknown error'),
        provider: 'ollama',
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
      const response = await fetch(`${this.baseUrl}/api/tags`, {
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
