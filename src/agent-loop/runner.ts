/**
 * Agent Loop Runner
 * 
 * Core orchestration logic for agent execution.
 */

import type {
  RunRequest,
  RunOptions,
  RunHandle,
  RunResult,
  RunState,
  StopReason,
  AgentLoopDependencies,
  AgentEvent,
  ToolCall,
  ToolResult,
  ModelResponse,
} from './types';

import { generateRunId } from './run-id-generator';
import { stateMachine } from './state-machine';
import { SessionLockManager } from './session-lock';
import { QueueManager } from './queue';
import { EventStream } from './event-stream';
import { TurnManager } from './turn-manager';
import { ToolCallParser } from './tool-parser';
import { RunContextBuilder } from './run-context';
import { CancellationHandler } from './cancellation';
import { RetryHandler } from './retry';
import { HooksManager } from './hooks';

// ============================================================================
// Runner
// ============================================================================

export class AgentRunner {
  private deps: AgentLoopDependencies;
  private locks: SessionLockManager;
  private queue: QueueManager;
  private cancellation: CancellationHandler;
  private retry: RetryHandler;
  private hooks: HooksManager;
  private parser: ToolCallParser;

  constructor(
    deps: AgentLoopDependencies,
    options: Partial<RunOptions> = {}
  ) {
    this.deps = deps;
    this.locks = new SessionLockManager();
    this.queue = new QueueManager(options.maxConcurrentRuns ?? 10);
    this.cancellation = new CancellationHandler();
    this.retry = new RetryHandler(options.retry);
    this.hooks = new HooksManager();
    this.parser = new ToolCallParser();
  }

  /**
   * Execute run
   */
  async execute(request: RunRequest, options: Partial<RunOptions> = {}): Promise<RunHandle> {
    // Generate run ID
    const runId = generateRunId();

    // Resolve session ID
    const sessionId = request.sessionId ?? 'default';

    // Create event stream
    const events = new EventStream();

    // Create abort signal
    const signal = this.cancellation.create(runId);

    // Create handle
    const handle: RunHandle = {
      runId,
      sessionId,
      state: 'pending',
      events,
      cancel: () => this.cancel(runId),
    };

    // Start execution
    this.executeRun(runId, sessionId, request, options, events, signal)
      .catch(error => {
        console.error('Run execution error:', error);
      });

    return handle;
  }

  /**
   * Execute run (internal)
   */
  private async executeRun(
    runId: string,
    sessionId: string,
    request: RunRequest,
    options: Partial<RunOptions>,
    events: EventStream,
    signal: AbortSignal
  ): Promise<void> {
    let state: RunState = 'pending';
    const contextBuilder = new RunContextBuilder(runId, sessionId);

    try {
      // Create session if not exists or ensure it exists
      // For now assuming session exists or managed by store

      // Save User Message proactively to SessionStore
      // First, get the last message ID to use as parentId
      const sessionData = await this.loadSession(sessionId);
      let lastMessageId: string | null = null;
      if (sessionData.messages && sessionData.messages.length > 0) {
        lastMessageId = sessionData.messages[sessionData.messages.length - 1].id;
      }

      const userMsg = await this.deps.sessionStore.append(sessionId, {
        role: 'user',
        content: request.message,
        type: 'user',
        parentId: lastMessageId
      });
      lastMessageId = userMsg.id;

      // Hook: beforeRun
      await this.hooks.execute('beforeRun', { runId, sessionId });

      // Queue run
      this.queue.enqueue(runId, sessionId, request.priority ?? 0);
      state = stateMachine.transition(state, 'queued');
      await events.emit({ type: 'run.queued', runId, position: this.queue.getPosition(runId) ?? 0 });

      // Wait for capacity
      await this.waitForCapacity(runId);
      this.cancellation.throwIfCancelled(runId);

      // Acquire session lock
      const lock = await this.locks.acquire(sessionId, runId);

      try {
        // Start run
        state = stateMachine.transition(state, 'running');
        await events.emit({ type: 'run.started', runId });

        // Load session
        const session = await this.loadSession(sessionId);

        // Override session user ID if provided explicitly in context options
        // This ensures profile tools use the correct user scope
        if (request.contextOptions && typeof request.contextOptions.userId === 'string') {
          session.userId = request.contextOptions.userId;
        }

        contextBuilder.setSession(session);

        // Assemble context
        const context = await this.assembleContext(session, request, contextBuilder, events);
        this.cancellation.throwIfCancelled(runId);

        // Hook: afterContextAssembly
        await this.hooks.execute('afterContextAssembly', { context });

        // Execute turns
        const result = await this.executeTurns(
          runId,
          session,
          context,
          request,
          options,
          contextBuilder,
          events,
          signal,
          lastMessageId // Pass the user message ID as parent for subsequent messages
        );

        // Complete run
        state = stateMachine.transition(state, 'completed');
        const finalContext = contextBuilder.build();

        await events.emit({
          type: 'run.completed',
          runId,
          result: {
            runId,
            sessionId,
            state: 'completed',
            stopReason: result.stopReason,
            message: result.message,
            usage: result.usage,
            context: finalContext,
          },
        });

        // Hook: afterRun
        await this.hooks.execute('afterRun', { context: finalContext });

      } finally {
        lock.release();
        this.queue.complete(runId);
      }

    } catch (error) {
      const err = error as Error;

      // Check if cancelled
      if (signal.aborted) {
        state = stateMachine.transition(state, 'cancelled');
        await events.emit({ type: 'run.cancelled', runId, reason: err.message });
      } else {
        state = stateMachine.transition(state, 'failed');
        await events.emit({ type: 'run.error', runId, error: err.message });

        // Hook: onError
        await this.hooks.execute('onError', { error: err, phase: 'execution' });
      }

      throw err;

    } finally {
      events.close();
      this.cancellation.cleanup(runId);
      this.retry.reset(runId);
    }
  }

  /**
   * Wait for queue capacity
   */
  private async waitForCapacity(runId: string): Promise<void> {
    while (!this.queue.isRunning(runId) && this.queue.isQueued(runId)) {
      const dequeued = this.queue.dequeue();
      if (dequeued?.runId === runId) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * Load session
   */
  private async loadSession(sessionId: string): Promise<any> {
    const messages = await this.deps.sessionStore.getMessages(sessionId);
    const metadata = this.deps.sessionStore.getMetadata(sessionId);

    // Extract userId from metadata or from sessionId format
    let userId = metadata?.userId;
    if (!userId) {
      // Try to extract from telegram format: telegram:chatId:userId
      const telegramMatch = sessionId.match(/telegram:(\d+):(\d+)/);
      if (telegramMatch) {
        userId = `telegram:${telegramMatch[2]}`; // Use telegram:userId format
      } else {
        userId = 'web-user'; // Single user for all web UI sessions
      }
    }

    return {
      id: sessionId,
      userId,
      messages: messages || []
    };
  }

  /**
   * Assemble context
   */
  private async assembleContext(
    session: any,
    request: RunRequest,
    contextBuilder: RunContextBuilder,
    events: EventStream
  ): Promise<any> {
    await events.emit({ type: 'context.start' });

    const start = Date.now();

    // Extract userId from session metadata or use sessionId as fallback
    const userId = session.userId || session.id;

    const context = await this.deps.contextAssembler.assemble(
      session.id,
      'default', // agentId
      {
        ...request.contextOptions,
        userId, // Add userId for profile context
      }
    );
    const duration = Date.now() - start;

    contextBuilder.recordContextAssembly(duration);
    await events.emit({ type: 'context.complete', context });

    return context;
  }

  /**
   * Execute turns
   */
  private async executeTurns(
    runId: string,
    session: any,
    context: any,
    request: RunRequest,
    options: Partial<RunOptions>,
    contextBuilder: RunContextBuilder,
    events: EventStream,
    signal: AbortSignal,
    lastMessageId: string | null
  ): Promise<{ stopReason: StopReason; message?: string; usage?: any }> {
    const turnManager = new TurnManager(
      options.maxTurns ?? 10,
      options.maxToolRounds ?? 5
    );

    let currentContext = context;
    let accumulatedText = '';

    while (true) {
      this.cancellation.throwIfCancelled(runId);

      // Check turn limits
      const { continue: canContinue, reason } = turnManager.canContinue();
      if (!canContinue) {
        return { stopReason: 'max_turns', message: reason };
      }

      turnManager.startTurn();

      // Call model
      const modelResponse = await this.callModel(
        currentContext,
        contextBuilder,
        events,
        signal
      );

      accumulatedText += modelResponse.content ?? '';

      // Check for tool calls
      if (!this.parser.hasToolCalls(modelResponse)) {
        // No more tool calls - done
        await this.saveToSession(session, accumulatedText, lastMessageId);

        return {
          stopReason: 'stop',
          message: accumulatedText,
          usage: modelResponse.usage,
        };
      }

      // Execute tools
      turnManager.startToolRound();
      const toolCalls = this.parser.parse(modelResponse);

      const toolResults = await this.executeTools(
        toolCalls,
        contextBuilder,
        events,
        signal,
        runId,
        session.id,
        session // Add session parameter
      );

      // Update context with tool results
      currentContext = {
        ...currentContext,
        messages: [
          ...currentContext.messages,
          {
            role: 'assistant',
            content: [
              ...(modelResponse.content
                ? [{ type: 'text', text: modelResponse.content }]
                : []),
              ...toolCalls.map(tc => ({
                type: 'tool_use',
                id: tc.id,
                name: tc.name,
                input: tc.arguments,
              })),
            ],
          },
          ...toolResults.map(tr => {
            let content: any;
            const res = tr.result as any;

            // Handle enhanced result with potential screenshot
            if (typeof res === 'object' && res !== null && 'data' in res && res.data?.screenshot) {
              content = [
                { type: 'text', text: res.content || JSON.stringify(res) },
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    mediaType: 'image/png',
                    data: res.data.screenshot
                  }
                }
              ];
            } else if (typeof res === 'object' && res !== null && 'content' in res && 'data' in res) {
              // Enhanced result without screenshot (just unwrap content)
              content = res.content;
            } else {
              // Standard result
              content = typeof res === 'string' ? res : JSON.stringify(res);
            }

            return {
              role: 'user' as const,
              content: [
                {
                  type: 'tool_result',
                  toolUseId: tr.toolCallId,
                  content: content,
                  isError: Boolean(res?.error),
                },
              ],
            };
          }),
        ],
      };
    }
  }

  /**
   * Call model
   */
  private async callModel(
    context: any,
    contextBuilder: RunContextBuilder,
    events: EventStream,
    signal: AbortSignal
  ): Promise<ModelResponse> {
    // Hook: beforeModelCall
    await this.hooks.execute('beforeModelCall', { context });

    await events.emit({ type: 'model.start' });

    const start = Date.now();
    let response: ModelResponse | null = null;

    // Stream response
    const stream = this.deps.modelAdapter.stream({
      model: context.parameters.modelId ?? 'ollama/gpt-oss:20b',
      systemPrompt: context.systemPrompt,
      messages: context.messages,
      tools: context.tools,
      signal,
    });

    let content = '';

    for await (const chunk of stream) {
      if (chunk.type === 'content') {
        content += chunk.delta;
        await events.emit({ type: 'model.delta', delta: chunk.delta });
      } else if (chunk.type === 'thinking') {
        await events.emit({ type: 'model.thinking', delta: chunk.delta });
      } else if (chunk.type === 'response') {
        response = chunk;
      }
    }

    const duration = Date.now() - start;
    contextBuilder.recordModelCall(duration, response?.usage);

    if (!response) {
      throw new Error('Model did not return a response');
    }

    await events.emit({ type: 'model.complete', response });

    // Hook: afterModelCall
    await this.hooks.execute('afterModelCall', { response });

    return response;
  }

  /**
   * Execute tools
   */
  private async executeTools(
    toolCalls: ToolCall[],
    contextBuilder: RunContextBuilder,
    events: EventStream,
    signal: AbortSignal,
    runId: string,
    sessionId: string,
    session: any // Add session parameter
  ): Promise<ToolResult[]> {
    const results: ToolResult[] = [];

    for (const tc of toolCalls) {
      this.cancellation.throwIfCancelled('');

      await events.emit({
        type: 'tool.start',
        toolCallId: tc.id,
        toolName: tc.name,
        arguments: tc.arguments,
      });

      // Hook: beforeToolExecution
      await this.hooks.execute('beforeToolExecution', {
        toolName: tc.name,
        arguments: tc.arguments,
      });

      const start = Date.now();

      try {
        const permissionsRaw = (process.env.TOOL_PERMISSIONS ?? '').trim();
        const permissionList = (permissionsRaw.length > 0
          ? permissionsRaw
          : 'network,execute,read,write')
          .split(',')
          .map(p => p.trim())
          .filter(Boolean);

        const executionContext = this.deps.toolExecutor.createContext({
          sessionId,
          userId: session.userId || sessionId, // Add userId for profile tools
          runId,
          toolCallId: tc.id,
          signal,
          permissions: permissionList,
        });

        const result = await this.deps.toolExecutor.execute(
          tc.name,
          tc.arguments,
          executionContext
        );

        const duration = Date.now() - start;
        contextBuilder.recordToolExecution(duration, tc.name, true);

        const toolResult: ToolResult = {
          toolCallId: tc.id,
          result: result.data ? { content: result.content, data: result.data } : result.content,
        };

        results.push(toolResult);

        await events.emit({
          type: 'tool.complete',
          toolCallId: tc.id,
          result: toolResult,
        });

        // Hook: afterToolExecution
        await this.hooks.execute('afterToolExecution', {
          toolName: tc.name,
          result: toolResult,
        });

      } catch (error) {
        const err = error as Error;
        const duration = Date.now() - start;
        contextBuilder.recordToolExecution(duration, tc.name, false);

        await events.emit({
          type: 'tool.error',
          toolCallId: tc.id,
          error: err.message,
        });

        // Return error as result
        results.push({
          toolCallId: tc.id,
          result: { error: err.message },
        });
      }
    }

    return results;
  }

  /**
   * Save to session
   */
  private async saveToSession(
    session: any,
    assistantMessage: string,
    parentId: string | null
  ): Promise<void> {
    await this.deps.sessionStore.append(session.id, {
      role: 'assistant',
      content: assistantMessage,
      type: 'assistant',
      parentId: parentId
    });
  }

  /**
   * Cancel run
   */
  cancel(runId: string): void {
    this.cancellation.cancel(runId, 'User cancelled');
    this.queue.remove(runId);
  }

  /**
   * Register hook
   */
  onHook(name: string, handler: any): void {
    this.hooks.on(name as any, handler);
  }
}
