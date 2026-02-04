/**
 * Google Adapter
 * Gemini models with NDJSON streaming, tools, JSON mode, grounding
 */

import type {
  ProviderAdapter,
  ProviderConfig,
  ProviderRequest,
  Delta,
  ModelInfo,
  ModelCapabilities,
  GoogleConfig,
} from '../types';
import { listModelsByProvider, toModelInfo } from '../model-registry';

// ============================================================================
// Google API Types
// ============================================================================

interface GoogleContent {
  role: 'user' | 'model';
  parts: GooglePart[];
}

type GooglePart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { functionCall: { name: string; args: object } }
  | { functionResponse: { name: string; response: object } };

interface GoogleTool {
  functionDeclarations: Array<{
    name: string;
    description: string;
    parameters: object;
  }>;
}

interface GoogleStreamResponse {
  candidates?: Array<{
    content?: {
      role: string;
      parts: GooglePart[];
    };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

// ============================================================================
// Google Provider Adapter
// ============================================================================

export class GoogleAdapter implements ProviderAdapter {
  name = 'google';
  displayName = 'Google (Gemini)';
  type: 'cloud' | 'local' = 'cloud';

  private apiKey: string | null = null;
  private baseUrl: string = 'https://generativelanguage.googleapis.com/v1beta';
  private defaultModel = 'gemini-3';

  // ============================================================================
  // Configuration
  // ============================================================================

  configure(config: ProviderConfig): void {
    const googleConfig = config.credentials as GoogleConfig | undefined;

    this.apiKey = googleConfig?.apiKey || null;
    this.baseUrl = googleConfig?.baseUrl || this.baseUrl;
    this.defaultModel = googleConfig?.defaultModel || this.defaultModel;
  }

  async validateCredentials(): Promise<boolean> {
    if (!this.apiKey) return false;

    try {
      const response = await fetch(`${this.baseUrl}/models?key=${this.apiKey}`, {
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
    const modelIds = listModelsByProvider('google');
    return modelIds
      .map(id => toModelInfo(id, this.apiKey !== null))
      .filter((info): info is ModelInfo => info !== null);
  }

  getCapabilities(model: string): ModelCapabilities | null {
    const fullId = `google/${model}`;
    const info = toModelInfo(fullId);
    return info?.capabilities || null;
  }

  supportsModel(model: string): boolean {
    const modelIds = listModelsByProvider('google');
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
          message: 'Google API key not configured',
          provider: 'google',
          retryable: false,
        },
      };
      return;
    }

    const body = this.buildRequestBody(request);
    const modelPath = `models/${request.model}`;

    try {
      const response = await fetch(
        `${this.baseUrl}/${modelPath}:streamGenerateContent?key=${this.apiKey}&alt=sse`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: request.signal,
        }
      );

      if (!response.ok) {
        yield* this.handleErrorResponse(response);
        return;
      }

      // Parse NDJSON stream (Google uses SSE format with data: prefix)
      yield* this.parseNDJSONStream(response.body!);
    } catch (error: any) {
      if (error.name === 'AbortError') {
        yield {
          type: 'error',
          error: {
            code: 'REQUEST_ABORTED',
            message: 'Request was aborted',
            provider: 'google',
            retryable: false,
          },
        };
      } else {
        yield {
          type: 'error',
          error: {
            code: 'NETWORK_ERROR',
            message: error.message,
            provider: 'google',
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
      contents: this.convertMessages(request.messages),
      generationConfig: this.buildGenerationConfig(request),
    };

    // System instruction (Gemini 1.5+)
    if (request.systemPrompt) {
      body.systemInstruction = {
        parts: [{ text: request.systemPrompt }],
      };
    }

    // Tools
    if (request.tools && request.tools.length > 0) {
      body.tools = [this.convertTools(request.tools)];
    }

    // Grounding (Google-specific)
    if ((request.parameters as any).groundingEnabled) {
      body.tools = body.tools || [];
      body.tools.push({
        googleSearchRetrieval: {},
      });
    }

    return body;
  }

  private buildGenerationConfig(request: ProviderRequest): object {
    const config: any = {
      maxOutputTokens: request.parameters.maxTokens || 8192,
    };

    if (request.parameters.temperature !== undefined) {
      config.temperature = request.parameters.temperature;
    }
    if (request.parameters.topP !== undefined) {
      config.topP = request.parameters.topP;
    }
    if (request.parameters.topK !== undefined) {
      config.topK = request.parameters.topK;
    }
    if (request.parameters.stopSequences) {
      config.stopSequences = request.parameters.stopSequences;
    }

    // JSON mode
    if ((request.parameters as any).jsonMode) {
      config.responseMimeType = 'application/json';
    }

    // JSON schema
    if ((request.parameters as any).jsonSchema) {
      config.responseMimeType = 'application/json';
      config.responseSchema = (request.parameters as any).jsonSchema;
    }

    return config;
  }

  private convertMessages(messages: any[]): GoogleContent[] {
    const converted: GoogleContent[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        // System messages handled separately
        continue;
      }

      const role = msg.role === 'assistant' ? 'model' : 'user';
      const parts = this.convertContent(msg.content);

      converted.push({ role, parts });
    }

    return converted;
  }

  private convertContent(content: unknown): GooglePart[] {
    if (typeof content === 'string') {
      return [{ text: content }];
    }

    if (Array.isArray(content)) {
      return content.map(block => {
        switch (block.type) {
          case 'text':
            return { text: block.text };

          case 'image':
            return {
              inlineData: {
                mimeType: block.source.mediaType || 'image/jpeg',
                data: block.source.data,
              },
            };

          case 'tool_use':
            return {
              functionCall: {
                name: block.name,
                args: block.input,
              },
            };

          case 'tool_result':
            return {
              functionResponse: {
                name: block.toolUseId,
                response: JSON.parse(block.content),
              },
            };

          default:
            return { text: JSON.stringify(block) };
        }
      });
    }

    return [{ text: String(content) }];
  }

  private convertTools(tools: any[]): GoogleTool {
    return {
      functionDeclarations: tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      })),
    };
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
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const response: GoogleStreamResponse = JSON.parse(data);
              yield* this.convertResponseToDeltas(response);
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

  private *convertResponseToDeltas(response: GoogleStreamResponse): Iterable<Delta> {
    if (!response.candidates || response.candidates.length === 0) {
      return;
    }

    const candidate = response.candidates[0];
    const content = candidate.content;

    if (content?.parts) {
      for (const part of content.parts) {
        if ('text' in part) {
          yield { type: 'text', text: part.text };
        } else if ('functionCall' in part) {
          const fc = part.functionCall;
          const toolId = 'tool_' + Date.now();

          yield {
            type: 'tool_use_start',
            id: toolId,
            name: fc.name,
          };

          yield {
            type: 'tool_use_delta',
            id: toolId,
            input: JSON.stringify(fc.args),
          };

          yield {
            type: 'tool_use_end',
            id: toolId,
          };
        }
      }
    }

    // Finish
    if (candidate.finishReason) {
      const usage = response.usageMetadata || {
        promptTokenCount: 0,
        candidatesTokenCount: 0,
        totalTokenCount: 0,
      };

      yield {
        type: 'done',
        usage: {
          inputTokens: usage.promptTokenCount,
          outputTokens: usage.candidatesTokenCount,
        },
        stopReason: this.convertFinishReason(candidate.finishReason),
      };
    }
  }

  private convertFinishReason(reason: string): any {
    switch (reason) {
      case 'STOP':
        return 'end_turn';
      case 'MAX_TOKENS':
        return 'max_tokens';
      case 'SAFETY':
        return 'error';
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
        provider: 'google',
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
}
