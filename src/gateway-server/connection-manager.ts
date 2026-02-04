/**
 * Connection Manager
 * 
 * Tracks all active connections (HTTP, WebSocket, SSE)
 */

import type {
  Connection,
  ConnectionType,
  ConnectionMetadata,
  ConnectionStats,
  ConnectionFilter,
  WebSocketConnection,
} from './types';

export class ConnectionManager {
  private connections = new Map<string, Connection>();
  private connectionIdCounter = 0;

  /**
   * Add connection
   */
  add(type: ConnectionType, metadata: ConnectionMetadata, extra?: any): string {
    const id = `conn-${++this.connectionIdCounter}`;

    const connection: Connection = {
      id,
      type,
      metadata,
    };

    // Type-specific extras
    if (type === 'websocket' && extra?.ws) {
      connection.ws = extra.ws;
    } else if (type === 'sse' && extra?.sse) {
      connection.sse = extra.sse;
    } else if (type === 'http' && extra?.request && extra?.response) {
      connection.http = {
        request: extra.request,
        response: extra.response,
      };
    }

    this.connections.set(id, connection);
    return id;
  }

  /**
   * Remove connection
   */
  remove(id: string): boolean {
    return this.connections.delete(id);
  }

  /**
   * Get connection by ID
   */
  get(id: string): Connection | null {
    return this.connections.get(id) || null;
  }

  /**
   * List connections with optional filter
   */
  list(filter?: ConnectionFilter): Connection[] {
    const connections = Array.from(this.connections.values());
    
    if (!filter) {
      return connections;
    }

    return connections.filter(filter);
  }

  /**
   * Broadcast message to connections
   */
  broadcast(message: any, filter?: ConnectionFilter): void {
    const connections = filter ? this.list(filter) : this.list();

    for (const connection of connections) {
      if (connection.type === 'websocket' && connection.ws) {
        connection.ws.send(message);
      } else if (connection.type === 'sse' && connection.sse) {
        // SSE broadcast (will implement when SSE is ready)
      }
    }
  }

  /**
   * Get statistics
   */
  getStats(): ConnectionStats {
    const connections = this.list();
    
    const byType: Record<ConnectionType, number> = {
      http: 0,
      websocket: 0,
      sse: 0,
    };

    const perIp: Record<string, number> = {};
    let active = 0;

    for (const connection of connections) {
      byType[connection.type]++;

      const ip = connection.metadata.ip;
      perIp[ip] = (perIp[ip] || 0) + 1;

      // Check if active (for WebSocket)
      if (connection.type === 'websocket' && connection.ws?.isAlive()) {
        active++;
      } else if (connection.type !== 'websocket') {
        active++;
      }
    }

    return {
      total: connections.length,
      byType,
      active,
      perIp,
    };
  }

  /**
   * Disconnect connection
   */
  disconnect(id: string, reason?: string): void {
    const connection = this.get(id);
    if (!connection) {
      return;
    }

    if (connection.type === 'websocket' && connection.ws) {
      connection.ws.close(1000, reason);
    } else if (connection.type === 'sse' && connection.sse) {
      connection.sse.close();
    } else if (connection.type === 'http' && connection.http) {
      connection.http.response.end();
    }

    this.remove(id);
  }

  /**
   * Disconnect all connections
   */
  disconnectAll(reason?: string): void {
    for (const connection of this.connections.values()) {
      this.disconnect(connection.id, reason);
    }
  }

  /**
   * Cleanup stale connections
   */
  cleanupStale(maxIdleMs: number): number {
    const now = Date.now();
    let cleaned = 0;

    for (const connection of this.connections.values()) {
      const idleMs = now - connection.metadata.lastActivityAt;
      
      if (idleMs > maxIdleMs) {
        this.disconnect(connection.id, 'Idle timeout');
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Clear all connections
   */
  clear(): void {
    this.connections.clear();
  }
}

/**
 * Factory function
 */
export function createConnectionManager(): ConnectionManager {
  return new ConnectionManager();
}
