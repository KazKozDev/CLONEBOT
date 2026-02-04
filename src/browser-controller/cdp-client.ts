/**
 * CDP Client
 * WebSocket client for Chrome DevTools Protocol communication
 */

import WebSocket = require('ws');
import { EventEmitter } from 'events';
import { CDPRequest, CDPResponse, CDPEvent, CDPMessage } from './types';

/**
 * CDP Client options
 */
export interface CDPClientOptions {
  /** WebSocket URL */
  url: string;
  /** Connection timeout (ms) */
  timeout?: number;
  /** Auto-reconnect on disconnect */
  autoReconnect?: boolean;
  /** Reconnection delay (ms) */
  reconnectDelay?: number;
  /** Maximum reconnection attempts */
  maxReconnectAttempts?: number;
}

/**
 * Pending request
 */
interface PendingRequest {
  resolve: (result: any) => void;
  reject: (error: Error) => void;
  method: string;
  timeout?: NodeJS.Timeout;
}

/**
 * CDP Client
 * Manages WebSocket connection to Chrome DevTools Protocol endpoint
 */
export class CDPClient extends EventEmitter {
  private ws?: WebSocket;
  private url: string;
  private timeout: number;
  private autoReconnect: boolean;
  private reconnectDelay: number;
  private maxReconnectAttempts: number;
  
  private messageId = 0;
  private pendingRequests = new Map<number, PendingRequest>();
  private reconnectAttempts = 0;
  private reconnectTimer?: NodeJS.Timeout;
  private isManualDisconnect = false;

  constructor(options: CDPClientOptions) {
    super();
    this.url = options.url;
    this.timeout = options.timeout ?? 30000;
    this.autoReconnect = options.autoReconnect ?? false;
    this.reconnectDelay = options.reconnectDelay ?? 1000;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 5;
  }

  /**
   * Connect to CDP endpoint
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
        
        const connectTimeout = setTimeout(() => {
          this.ws?.terminate();
          reject(new Error(`Connection timeout after ${this.timeout}ms`));
        }, this.timeout);

        this.ws.on('open', () => {
          clearTimeout(connectTimeout);
          this.reconnectAttempts = 0;
          this.isManualDisconnect = false;
          this.emit('connected');
          resolve();
        });

        this.ws.on('message', (data: WebSocket.Data) => {
          this.handleMessage(data);
        });

        this.ws.on('error', (error) => {
          clearTimeout(connectTimeout);
          this.emit('error', error);
          if (this.ws?.readyState === WebSocket.CONNECTING) {
            reject(error);
          }
        });

        this.ws.on('close', () => {
          clearTimeout(connectTimeout);
          this.handleClose();
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect from CDP endpoint
   */
  async disconnect(): Promise<void> {
    this.isManualDisconnect = true;
    this.autoReconnect = false;
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests.entries()) {
      if (pending.timeout) {
        clearTimeout(pending.timeout);
      }
      pending.reject(new Error('Client disconnected'));
      this.pendingRequests.delete(id);
    }

    if (this.ws) {
      return new Promise<void>((resolve) => {
        const cleanup = () => {
          this.ws = undefined;
          resolve();
        };

        if (this.ws!.readyState === WebSocket.CLOSED) {
          cleanup();
        } else {
          this.ws!.once('close', cleanup);
          this.ws!.close();
        }
      });
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Send CDP command
   */
  async send<T = any>(method: string, params?: any, sessionId?: string): Promise<T> {
    if (!this.isConnected()) {
      throw new Error('CDP client is not connected');
    }

    const id = ++this.messageId;
    const request: CDPRequest = { id, method };
    
    if (params !== undefined) {
      request.params = params;
    }
    
    if (sessionId !== undefined) {
      request.sessionId = sessionId;
    }

    return new Promise<T>((resolve, reject) => {
      // Set timeout for request
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, this.timeout);

      this.pendingRequests.set(id, {
        resolve,
        reject,
        method,
        timeout
      });

      try {
        this.ws!.send(JSON.stringify(request), (error) => {
          if (error) {
            clearTimeout(timeout);
            this.pendingRequests.delete(id);
            reject(error);
          }
        });
      } catch (error) {
        clearTimeout(timeout);
        this.pendingRequests.delete(id);
        reject(error);
      }
    });
  }

  /**
   * Handle incoming message
   */
  private handleMessage(data: WebSocket.Data): void {
    try {
      const message: CDPMessage = JSON.parse(data.toString());

      // Response to our request
      if ('id' in message) {
        this.handleResponse(message as CDPResponse);
      }
      // Event from browser
      else if ('method' in message) {
        this.handleEvent(message as CDPEvent);
      }
    } catch (error) {
      this.emit('error', new Error(`Failed to parse CDP message: ${error}`));
    }
  }

  /**
   * Handle CDP response
   */
  private handleResponse(response: CDPResponse): void {
    const pending = this.pendingRequests.get(response.id);
    
    if (!pending) {
      this.emit('error', new Error(`Received response for unknown request: ${response.id}`));
      return;
    }

    if (pending.timeout) {
      clearTimeout(pending.timeout);
    }
    
    this.pendingRequests.delete(response.id);

    if (response.error) {
      pending.reject(new Error(
        `CDP error (${response.error.code}): ${response.error.message}`
      ));
    } else {
      pending.resolve(response.result);
    }
  }

  /**
   * Handle CDP event
   */
  private handleEvent(event: CDPEvent): void {
    // Emit specific event
    this.emit('event', event);
    this.emit(`event:${event.method}`, event.params, event.sessionId);
  }

  /**
   * Handle connection close
   */
  private handleClose(): void {
    const wasConnected = this.ws !== undefined;
    this.ws = undefined;

    if (wasConnected) {
      this.emit('disconnected');
    }

    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests.entries()) {
      if (pending.timeout) {
        clearTimeout(pending.timeout);
      }
      pending.reject(new Error('Connection closed'));
    }
    this.pendingRequests.clear();

    // Auto-reconnect if enabled
    if (this.autoReconnect && !this.isManualDisconnect) {
      this.attemptReconnect();
    }
  }

  /**
   * Attempt to reconnect
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit('error', new Error(
        `Max reconnection attempts (${this.maxReconnectAttempts}) reached`
      ));
      return;
    }

    this.reconnectAttempts++;
    
    const delay = this.reconnectDelay * this.reconnectAttempts;
    
    this.emit('reconnecting', {
      attempt: this.reconnectAttempts,
      maxAttempts: this.maxReconnectAttempts,
      delay
    });

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
        this.emit('reconnected');
      } catch (error) {
        this.emit('error', new Error(`Reconnection failed: ${error}`));
        this.handleClose();
      }
    }, delay);
  }

  /**
   * Subscribe to CDP event
   */
  onEvent(method: string, handler: (params: any, sessionId?: string) => void): () => void {
    const eventName = `event:${method}`;
    this.on(eventName, handler);
    return () => this.off(eventName, handler);
  }

  /**
   * Get connection state
   */
  getState(): {
    connected: boolean;
    reconnecting: boolean;
    reconnectAttempts: number;
    pendingRequests: number;
  } {
    return {
      connected: this.isConnected(),
      reconnecting: this.reconnectTimer !== undefined,
      reconnectAttempts: this.reconnectAttempts,
      pendingRequests: this.pendingRequests.size
    };
  }
}
