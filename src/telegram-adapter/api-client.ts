/**
 * Telegram Bot API HTTP Client
 * 
 * Handles all HTTP communication with Telegram Bot API
 */

import https from 'https';
import http from 'http';
import { URL } from 'url';
import { TelegramApiResponse, TelegramApiError } from './types';

export interface ApiClientConfig {
  token: string;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
}

export class TelegramApiClient {
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly retryDelay: number;

  constructor(config: ApiClientConfig) {
    this.baseUrl = `https://api.telegram.org/bot${config.token}`;
    this.timeout = config.timeout ?? 30000;
    this.maxRetries = config.maxRetries ?? 3;
    this.retryDelay = config.retryDelay ?? 1000;
  }

  /**
   * Make an API call to Telegram Bot API
   */
  async call<T = any>(method: string, params?: Record<string, any>): Promise<T> {
    const url = `${this.baseUrl}/${method}`;
    
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.makeRequest<T>(url, params);
        
        if (!response.ok) {
          throw new TelegramApiError(
            response.description ?? 'Unknown Telegram API error',
            response.error_code,
            response.description,
            response.parameters?.retry_after
          );
        }
        
        return response.result as T;
      } catch (error) {
        lastError = error as Error;
        
        // Don't retry on non-transient errors
        if (error instanceof TelegramApiError) {
          if (!this.isTransientError(error)) {
            throw error;
          }
          
          // Handle rate limiting
          if (error.errorCode === 429 && error.retryAfter) {
            await this.delay(error.retryAfter * 1000);
            continue;
          }
        }
        
        // Exponential backoff for retries
        if (attempt < this.maxRetries) {
          await this.delay(this.retryDelay * Math.pow(2, attempt));
        }
      }
    }
    
    throw lastError ?? new Error('Max retries exceeded');
  }

  /**
   * Upload files with multipart/form-data
   */
  async upload<T = any>(
    method: string, 
    params: Record<string, any>,
    files: Record<string, Buffer | string>
  ): Promise<T> {
    const url = `${this.baseUrl}/${method}`;
    
    const boundary = this.generateBoundary();
    const body = this.buildMultipartBody(params, files, boundary);
    
    const response = await this.makeRequest<T>(url, body, {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    });
    
    if (!response.ok) {
      throw new TelegramApiError(
        response.description ?? 'Unknown Telegram API error',
        response.error_code,
        response.description
      );
    }
    
    return response.result as T;
  }

  /**
   * Make HTTP request
   */
  private makeRequest<T>(
    url: string, 
    body?: any,
    headers?: Record<string, string>
  ): Promise<TelegramApiResponse<T>> {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const isHttps = urlObj.protocol === 'https:';
      const httpModule = isHttps ? https : http;
      
      const requestBody = body instanceof Buffer 
        ? body 
        : body 
          ? JSON.stringify(body) 
          : undefined;
      
      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
          ...(requestBody ? { 'Content-Length': Buffer.byteLength(requestBody) } : {}),
        },
        timeout: this.timeout,
      };
      
      const req = httpModule.request(urlObj, options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const response = JSON.parse(data) as TelegramApiResponse<T>;
            resolve(response);
          } catch (error) {
            reject(new Error(`Failed to parse response: ${data}`));
          }
        });
      });
      
      req.on('error', (error) => {
        reject(error);
      });
      
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      
      if (requestBody) {
        req.write(requestBody);
      }
      
      req.end();
    });
  }

  /**
   * Check if error is transient and should be retried
   */
  private isTransientError(error: TelegramApiError): boolean {
    if (!error.errorCode) return false;
    
    // Retry on rate limit, server errors, and network errors
    return (
      error.errorCode === 429 || // Too Many Requests
      error.errorCode >= 500    // Server errors
    );
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate multipart boundary
   */
  private generateBoundary(): string {
    return `----TelegramBotBoundary${Date.now()}${Math.random().toString(36)}`;
  }

  /**
   * Build multipart/form-data body
   */
  private buildMultipartBody(
    params: Record<string, any>,
    files: Record<string, Buffer | string>,
    boundary: string
  ): Buffer {
    const parts: Buffer[] = [];
    
    // Add regular parameters
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) continue;
      
      parts.push(Buffer.from(`--${boundary}\r\n`));
      parts.push(Buffer.from(`Content-Disposition: form-data; name="${key}"\r\n\r\n`));
      parts.push(Buffer.from(`${JSON.stringify(value)}\r\n`));
    }
    
    // Add files
    for (const [key, file] of Object.entries(files)) {
      parts.push(Buffer.from(`--${boundary}\r\n`));
      
      const filename = typeof file === 'string' ? 'file' : key;
      parts.push(Buffer.from(
        `Content-Disposition: form-data; name="${key}"; filename="${filename}"\r\n`
      ));
      parts.push(Buffer.from('Content-Type: application/octet-stream\r\n\r\n'));
      
      if (typeof file === 'string') {
        parts.push(Buffer.from(file));
      } else {
        parts.push(file);
      }
      
      parts.push(Buffer.from('\r\n'));
    }
    
    parts.push(Buffer.from(`--${boundary}--\r\n`));
    
    return Buffer.concat(parts);
  }
}
