/**
 * OpenAI Adapter
 * GPT models with SSE streaming, tools, JSON mode
 */

import type {
  ProviderAdapter,
  ProviderConfig,
  ProviderRequest,
  Delta,
  ModelInfo,
  ModelCapabilities,
  OpenAIConfig,
} from '../types';
import { listModelsByProvider, toModelInfo } from '../model-registry';

// ============================================================================
// OpenAI API Types
// ============================================================================

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: object;
  };
}

interface OpenAIStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ============================================================================
// OpenAI Provider Adapter
// ============================================================================

export class OpenAIAdapter implements ProviderAdapter {
  name = 'openai';
  displayName = 'OpenAI (GPT)';
  type: 'cloud' | 'local' = 'cloud';

  private apiKey: string | null = null;
  private organization: string | null = null;
  private baseUrl: string = 'https://api.openai.com/v1';
  private defaultModel = 'gpt5';

  // For tracking tool calls during streaming
  private toolCallsBuffer: Map<number, Partial<OpenAIToolCall>> = new Map();

  // ============================================================================
  // Configuration
  // ============================================================================

  configure(config: ProviderConfig): void {
    const openaiConfig = config.credentials as OpenAIConfig | undefined;

    this.apiKey = openaiConfig?.apiKey || null;
    this.organization = openaiConfig?.organization || null;
    this.baseUrl = openaiConfig?.baseUrl || this.baseUrl;
    this.defaultModel = openaiConfig?.defaultModel || this.defaultModel;
  }

  async validateCredentials(): Promise<boolean> {
    if (!this.apiKey) return false;

    try {
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
    const modelIds = listModelsByProvider('openai');
    return modelIds
      .map(id => toModelInfo(id, this.apiKey !== null))
      .filter((info): info is ModelInfo => info !== null);
  }

  getCapabilities(model: string): ModelCapabilities | null {
    const fullId = `openai/${model}`;
    const info = toModelInfo(fullId);
    return info?.capabilities || null;
  }

  supportsModel(model: string): boolean {
    const modelIds = listModelsByProvider('openai');
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
          message: 'OpenAI API key not configured',
          provider: 'openai',
          retryable: false,
        },
      };
      return;
    }

    const body = this.buildRequestBody(request);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
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
      this.toolCallsBuffer.clear();
      yield* this.parseSSEStream(response.body!);
    } catch (error: any) {
      if (error.name === 'AbortError') {
        yield {
          type: 'error',
          error: {
            code: 'REQUEST_ABORTED',
            message: 'Request was aborted',
            provider: 'openai',
            retryable: false,
          },
        };
      } else {
        yield {
          type: 'error',
          error: {
            code: 'NETWORK_ERROR',
            message: error.message,
            provider: 'openai',
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
      max_tokens: request.parameters.maxTokens || 4096,
    };

    // Tools
    if (request.tools && request.tools.length > 0) {
      body.tools = this.convertTools(request.tools);
      body.tool_choice = 'auto';
    }

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

    // JSON mode
    if ((request.parameters as any).jsonMode) {
      body.response_format = { type: 'json_object' };
    }

    // JSON schema (structured output)
    if ((request.parameters as any).jsonSchema) {
      body.response_format = {
        type: 'json_schema',
        json_schema: (request.parameters as any).jsonSchema,
      };
    }

    return body;
  }

  private convertMessages(messages: any[], systemPrompt?: string): OpenAIMessage[] {
    const converted: OpenAIMessage[] = [];

    // Add system message first if present
    if (systemPrompt) {
      converted.push({
        role: 'system',
        content: systemPrompt,
      });
    }

    // Convert other messages
    for (const msg of messages) {
      if (msg.role === 'system') {
        // System messages already handled
        converted.push({
          role: 'system',
          content: this.extractText(msg.content),
        });
      } else if (msg.role === 'assistant') {
        const toolCalls = this.extractToolCalls(msg.content);
        converted.push({
          role: 'assistant',
          content: this.extractText(msg.content),
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        });
      } else if (msg.role === 'tool') {
        // Tool result
        converted.push({
          role: 'tool',
          content: this.extractText(msg.content),
          tool_call_id: msg.tool_call_id,
        });
      } else {
        // User message
        converted.push({
          role: 'user',
          content: this.extractText(msg.content),
        });
      }
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

  private extractToolCalls(content: unknown): OpenAIToolCall[] {
    if (!Array.isArray(content)) return [];

    const toolUseBlocks = content.filter(block => block.type === 'tool_use');
    return toolUseBlocks.map(block => ({
      id: block.id,
      type: 'function',
      function: {
        name: block.name,
        arguments: JSON.stringify(block.input),
      },
    }));
  }

  private convertTools(tools: any[]): OpenAITool[] {
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
              const chunk: OpenAIStreamChunk = JSON.parse(data);
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

  private *convertChunkToDeltas(chunk: OpenAIStreamChunk): Iterable<Delta> {
    const choice = chunk.choices[0];
    if (!choice) return;

    const { delta, finish_reason } = choice;

    // Text content
    if (delta.content) {
      yield { type: 'text', text: delta.content };
    }

    // Tool calls
    if (delta.tool_calls) {
      for (const toolCallDelta of delta.tool_calls) {
        yield* this.handleToolCallDelta(toolCallDelta);
      }
    }

    // Finish
    if (finish_reason) {
      const usage = chunk.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

      yield {
        type: 'done',
        usage: {
          inputTokens: usage.prompt_tokens,
          outputTokens: usage.completion_tokens,
        },
        stopReason: this.convertFinishReason(finish_reason),
      };
    }
  }

  private *handleToolCallDelta(toolCallDelta: any): Iterable<Delta> {
    const index = toolCallDelta.index;
    let toolCall = this.toolCallsBuffer.get(index);

    // Start new tool call
    if (toolCallDelta.id) {
      toolCall = {
        id: toolCallDelta.id,
        type: 'function',
        function: { name: '', arguments: '' },
      };
      this.toolCallsBuffer.set(index, toolCall);

      // Yield start event (may not have name yet)
    }

    // Add function name
    if (toolCallDelta.function?.name && toolCall) {
      toolCall.function!.name = toolCallDelta.function.name;

      yield {
        type: 'tool_use_start',
        id: toolCall.id!,
        name: toolCall.function!.name,
      };
    }

    // Add function arguments
    if (toolCallDelta.function?.arguments && toolCall) {
      const argsDelta = toolCallDelta.function.arguments;
      toolCall.function!.arguments += argsDelta;

      yield {
        type: 'tool_use_delta',
        id: toolCall.id!,
        input: argsDelta,
      };
    }
  }

  private convertFinishReason(reason: string): any {
    switch (reason) {
      case 'stop':
        return 'end_turn';
      case 'tool_calls':
        return 'tool_use';
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
        code: error.code || error.type || 'UNKNOWN_ERROR',
        message: error.message || 'Unknown error',
        provider: 'openai',
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
    this.toolCallsBuffer.clear();
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
    };

    if (this.organization) {
      headers['OpenAI-Organization'] = this.organization;
    }

    return headers;
  }
}
