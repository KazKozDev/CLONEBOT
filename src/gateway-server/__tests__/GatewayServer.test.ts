/**
 * GatewayServer Facade Tests
 */

import http from 'http';
import WebSocket, { type RawData } from 'ws';
import { GatewayServer, DEFAULT_GATEWAY_CONFIG } from '../GatewayServer';
import type { RunHandle, AgentEvent } from '../../agent-loop/types';

function httpGetJson(
  host: string,
  port: number,
  path: string
): Promise<{ statusCode: number; body: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        method: 'GET',
        host,
        port,
        path,
        headers: {
          Accept: 'application/json',
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(Buffer.from(c)));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          const parsed = text ? JSON.parse(text) : null;
          resolve({ statusCode: res.statusCode || 0, body: parsed });
        });
      }
    );

    req.on('error', reject);
    req.end();
  });
}

function wsOpen(url: string, protocol: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, protocol);

    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };

    const onOpen = () => {
      cleanup();
      resolve(ws);
    };

    const cleanup = () => {
      ws.off('error', onError);
      ws.off('open', onOpen);
    };

    ws.on('error', onError);
    ws.on('open', onOpen);
  });
}

function wsExpectError(url: string, protocol: string): Promise<void> {
  return new Promise((resolve) => {
    const ws = new WebSocket(url, protocol);
    ws.on('error', () => {
      try {
        ws.close();
      } catch {
        // ignore
      }
      resolve();
    });

    ws.on('open', () => {
      // If it opened, it's an error for this helper.
      ws.close();
      throw new Error('Expected WebSocket connection to fail');
    });
  });
}

function wsWaitForJson(
  ws: WebSocket,
  predicate: (msg: any) => boolean,
  timeoutMs: number = 1500
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for WebSocket message'));
    }, timeoutMs);

    const onMessage = (data: RawData) => {
      try {
        const parsed = JSON.parse(data.toString());
        if (predicate(parsed)) {
          cleanup();
          resolve(parsed);
        }
      } catch {
        // ignore
      }
    };

    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };

    const cleanup = () => {
      clearTimeout(timer);
      ws.off('message', onMessage);
      ws.off('error', onError);
    };

    ws.on('message', onMessage);
    ws.on('error', onError);
  });
}

function httpPostJson(
  host: string,
  port: number,
  path: string,
  body: any
): Promise<{ statusCode: number; body: any }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      {
        method: 'POST',
        host,
        port,
        path,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          Accept: 'application/json',
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(Buffer.from(c)));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          const parsed = text ? JSON.parse(text) : null;
          resolve({ statusCode: res.statusCode || 0, body: parsed });
        });
      }
    );

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function httpGetText(
  host: string,
  port: number,
  path: string,
  abortAfterBytes?: number,
  headers: Record<string, string> = {}
): Promise<{ statusCode: number; text: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        method: 'GET',
        host,
        port,
        path,
        headers: {
          Accept: 'text/event-stream',
          ...headers,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let total = 0;

        res.on('data', (c) => {
          const buf = Buffer.from(c);
          chunks.push(buf);
          total += buf.length;

          if (typeof abortAfterBytes === 'number' && total >= abortAfterBytes) {
            req.destroy();
            const text = Buffer.concat(chunks).toString('utf8');
            resolve({ statusCode: res.statusCode || 0, text });
          }
        });

        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({ statusCode: res.statusCode || 0, text });
        });
      }
    );

    req.on('error', (err) => {
      // destroy() triggers ECONNRESET sometimes; treat as success if we got data
      if ((err as any)?.code === 'ECONNRESET') {
        resolve({ statusCode: 200, text: '' });
        return;
      }
      reject(err);
    });

    req.end();
  });
}

function createMockRunHandle(runId: string, sessionId: string): RunHandle {
  async function* gen(): AsyncIterable<AgentEvent> {
    yield { type: 'run.started', runId };
    yield { type: 'model.delta', delta: 'Hello' };
    yield { type: 'run.completed', runId, result: { runId, sessionId, state: 'completed', stopReason: 'stop', context: {
      runId,
      sessionId,
      startedAt: Date.now(),
      turns: { turns: 1, toolRounds: 0, maxTurns: 10, maxToolRounds: 5 },
      metrics: {
        contextAssembly: { duration: 0 },
        modelCalls: [],
        toolExecutions: [],
        persistence: { duration: 0 },
        total: { duration: 0 },
      },
    } } };
  }

  return {
    runId,
    sessionId,
    state: 'pending',
    events: gen(),
    cancel: () => {},
  };
}

function createMockLongRunHandle(runId: string, sessionId: string, delayMs: number): RunHandle {
  async function* gen(): AsyncIterable<AgentEvent> {
    yield { type: 'run.started', runId };

    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, delayMs);
      t.unref?.();
    });

    yield { type: 'run.completed', runId, result: { runId, sessionId, state: 'completed', stopReason: 'stop', context: {
      runId,
      sessionId,
      startedAt: Date.now(),
      turns: { turns: 1, toolRounds: 0, maxTurns: 10, maxToolRounds: 5 },
      metrics: {
        contextAssembly: { duration: 0 },
        modelCalls: [],
        toolExecutions: [],
        persistence: { duration: 0 },
        total: { duration: 0 },
      },
    } } };
  }

  return {
    runId,
    sessionId,
    state: 'pending',
    events: gen(),
    cancel: () => {},
  };
}

describe('GatewayServer', () => {
  let server: GatewayServer;
  let address: { host: string; port: number };
  let agentLoop: any;
  let sessionStore: any;
  let toolExecutor: any;

  beforeEach(async () => {
    let runCounter = 0;

    agentLoop = {
      execute: jest.fn(async ({ message }: { message: string }) => {
        runCounter += 1;
        return createMockRunHandle(`run_test_${runCounter}`, 'default');
      }),
    };

    sessionStore = {
      getAllSessionIds: jest.fn(() => ['sess-1']),
      getAllKeys: jest.fn(() => ['user:alice']),
      getSessionId: jest.fn((key: string) => (key === 'user:alice' ? 'sess-1' : undefined)),
      getSessionKeys: jest.fn((sessionId: string) => (sessionId === 'sess-1' ? ['user:alice'] : [])),
      getMetadata: jest.fn((sessionId: string) => (
        sessionId === 'sess-1'
          ? { sessionId: 'sess-1', createdAt: 1, updatedAt: 2, messageCount: 0 }
          : undefined
      )),
      getMessages: jest.fn(async () => []),
      getLinearHistory: jest.fn(async () => []),
      deleteSession: jest.fn(async () => {}),
    };

    toolExecutor = {
      list: jest.fn(() => [
        {
          name: 'echo',
          description: 'Echo',
          parameters: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] },
        },
      ]),
      introspect: jest.fn((name: string) => (
        name === 'echo'
          ? {
              definition: { name: 'echo', description: 'Echo', parameters: { type: 'object' } },
              registered: new Date(),
              executionCount: 0,
              averageDuration: 0,
            }
          : null
      )),
      validate: jest.fn((_name: string, _params: unknown) => ({ valid: true })),
      createContext: jest.fn((opts: any) => ({
        sessionId: opts.sessionId,
        runId: opts.runId,
        toolCallId: opts.toolCallId,
        permissions: new Set(opts.permissions ?? []),
        sandboxMode: !!opts.sandboxMode,
        workingDirectory: opts.workingDirectory ?? process.cwd(),
        env: opts.env ?? {},
        signal: opts.signal ?? new AbortController().signal,
        timeout: opts.timeout ?? 1000,
        log: () => {},
        emitProgress: () => {},
        invokeTool: async () => ({ success: false, content: 'not implemented' }),
      })),
      execute: jest.fn(async (_name: string, _params: unknown, _ctx: any) => ({ success: true, content: 'ok' })),
    };

    server = new GatewayServer(
      {
        ...DEFAULT_GATEWAY_CONFIG,
        host: '127.0.0.1',
        port: 0,
      },
      { agentLoop, sessionStore, toolExecutor }
    );

    await server.start();

    const addr = server.getAddress();
    if (!addr) throw new Error('Server did not bind');
    address = addr;
  });

  afterEach(async () => {
    await server.stop({ graceful: true, timeout: 2000 });
  });

  it('serves /api/v1/health', async () => {
    const res = await httpGetJson(address.host, address.port, '/api/v1/health');

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('version');
    expect(res.body).toHaveProperty('uptime');
    expect(res.body).toHaveProperty('checks');
  });

  it('accepts WebSocket upgrades on /ws with openclaw-v1', async () => {
    const ws = await wsOpen(`ws://${address.host}:${address.port}/ws`, 'openclaw-v1');
    ws.close();
  });

  it('rejects WebSocket upgrades on other paths', async () => {
    await wsExpectError(`ws://${address.host}:${address.port}/not-ws`, 'openclaw-v1');
  });

  it('starts a chat run via POST /api/v1/chat', async () => {
    const res = await httpPostJson(address.host, address.port, '/api/v1/chat', { message: 'hi' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ runId: 'run_test_1', sessionId: 'default' });
  });

  it('starts a chat run via WebSocket chat.send and auto-streams when stream=true', async () => {
    const ws = await wsOpen(`ws://${address.host}:${address.port}/ws`, 'openclaw-v1');

    const respP = wsWaitForJson(ws, (m) => m.type === 'response' && m.id === 'req-chat-1');
    const evtP = wsWaitForJson(ws, (m) => m.type === 'event' && m.channel === 'run' && m.event === 'run.started');

    ws.send(
      JSON.stringify({
        type: 'request',
        id: 'req-chat-1',
        channel: 'chat',
        action: 'send',
        payload: { message: 'hi', stream: true },
      })
    );

    const resp = await respP;
    expect(resp.success).toBe(true);
    expect(resp.payload).toHaveProperty('runId', 'run_test_1');

    const evt = await evtP;
    expect(evt).toHaveProperty('id', '1');

    ws.close();
  });

  it('streams run events via WebSocket run.subscribe', async () => {
    await httpPostJson(address.host, address.port, '/api/v1/chat', { message: 'hi' });

    const ws = await wsOpen(`ws://${address.host}:${address.port}/ws`, 'openclaw-v1');

    const respP = wsWaitForJson(ws, (m) => m.type === 'response' && m.id === 'req-1');
    const evtP = wsWaitForJson(ws, (m) => m.type === 'event' && m.channel === 'run' && m.event === 'run.started');

    ws.send(
      JSON.stringify({
        type: 'request',
        id: 'req-1',
        channel: 'run',
        action: 'subscribe',
        payload: { runId: 'run_test_1' },
      })
    );

    const resp = await respP;
    expect(resp.success).toBe(true);
    expect(resp.payload).toHaveProperty('runId', 'run_test_1');

    const evt = await evtP;
    expect(evt).toHaveProperty('id', '1');

    ws.close();
  });

  it('enforces max WS run subscriptions per connection', async () => {
    // Replace server with a stricter config for this test.
    await server.stop({ graceful: true, timeout: 2000 });

    // Use long-running runs so the first subscription remains active.
    let runCounter = 0;
    const longAgentLoop = {
      execute: jest.fn(async () => {
        runCounter += 1;
        return createMockLongRunHandle(`run_test_${runCounter}`, 'default', 1000);
      }),
    };

    server = new GatewayServer(
      {
        ...DEFAULT_GATEWAY_CONFIG,
        host: '127.0.0.1',
        port: 0,
        limits: {
          ...DEFAULT_GATEWAY_CONFIG.limits,
          maxWsSubscriptionsPerConnection: 1,
        },
      },
      { agentLoop: longAgentLoop, sessionStore, toolExecutor }
    );

    await server.start();
    const addr = server.getAddress();
    if (!addr) throw new Error('Server did not bind');
    address = addr;

    // Create two distinct runs
    await httpPostJson(address.host, address.port, '/api/v1/chat', { message: 'hi1' });
    await httpPostJson(address.host, address.port, '/api/v1/chat', { message: 'hi2' });

    const ws = await wsOpen(`ws://${address.host}:${address.port}/ws`, 'openclaw-v1');

    const ok1 = wsWaitForJson(ws, (m) => m.type === 'response' && m.id === 'sub-1');
    ws.send(JSON.stringify({ type: 'request', id: 'sub-1', channel: 'run', action: 'subscribe', payload: { runId: 'run_test_1' } }));
    const r1 = await ok1;
    expect(r1.success).toBe(true);

    const err2 = wsWaitForJson(ws, (m) => m.type === 'error' && m.id === 'sub-2');
    ws.send(JSON.stringify({ type: 'request', id: 'sub-2', channel: 'run', action: 'subscribe', payload: { runId: 'run_test_2' } }));
    const e2 = await err2;
    expect(e2.error).toHaveProperty('code', 'SUBSCRIPTION_LIMIT');

    ws.close();
  });

  it('streams events via SSE /api/v1/chat/:runId/stream', async () => {
    await httpPostJson(address.host, address.port, '/api/v1/chat', { message: 'hi' });

    const res = await httpGetText(
      address.host,
      address.port,
      '/api/v1/chat/run_test_1/stream',
      300
    );

    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('id: 1');
    // Should contain at least one SSE event header
    expect(res.text).toContain('event: run.started');
  });

  it('supports SSE reconnection via Last-Event-ID', async () => {
    await httpPostJson(address.host, address.port, '/api/v1/chat', { message: 'hi' });

    const first = await httpGetText(address.host, address.port, '/api/v1/chat/run_test_1/stream', 90);
    expect(first.statusCode).toBe(200);
    expect(first.text).toContain('id: 1');

    const second = await httpGetText(
      address.host,
      address.port,
      '/api/v1/chat/run_test_1/stream',
      undefined,
      { 'Last-Event-ID': '1' }
    );

    expect(second.statusCode).toBe(200);
    expect(second.text).not.toContain('id: 1');
    expect(second.text).toContain('id: 2');
  });

  it('serves sessions list', async () => {
    const res = await httpGetJson(address.host, address.port, '/api/v1/sessions');
    expect(res.statusCode).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.sessions[0]).toHaveProperty('sessionId', 'sess-1');
  });

  it('serves tools list and executes tool', async () => {
    const list = await httpGetJson(address.host, address.port, '/api/v1/tools');
    expect(list.statusCode).toBe(200);
    expect(list.body.tools).toHaveLength(1);
    expect(list.body.tools[0]).toHaveProperty('name', 'echo');

    const exec = await httpPostJson(
      address.host,
      address.port,
      '/api/v1/tools/echo/execute',
      { params: { message: 'hi' } }
    );
    expect(exec.statusCode).toBe(200);
    expect(exec.body).toHaveProperty('success', true);
  });
});
