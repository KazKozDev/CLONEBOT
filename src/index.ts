/**
 * CLONEBOT - Complete Agent System
 * 
 * Main entry point for the agent system.
 */

// Module 1: Message Bus
export { MessageBus } from './message-bus';

// Module 2: Session Store
export { SessionStore } from './session-store';

// Module 4: Model Adapter
export { ModelAdapter } from './model-adapter';

// Module 5: Tool Executor
export { ToolExecutor } from './tool-executor';

// Module 6: Context Assembler
export { ContextAssembler } from './context-assembler';

// Module 7: Agent Loop
export { AgentLoop, DEFAULT_CONFIG as DEFAULT_AGENT_CONFIG } from './agent-loop';
export type {
  RunRequest,
  RunOptions,
  RunHandle,
  RunResult,
  RunState,
  StopReason,
  AgentEvent,
  AgentLoopConfig,
  AgentLoopDependencies,
  HookName,
  HookHandler,
} from './agent-loop/types';

// Module 8: Gateway Server
export { GatewayServer, DEFAULT_GATEWAY_CONFIG } from './gateway-server';
export type { GatewayConfig, GatewayDependencies } from './gateway-server';

// Module 9: Telegram Channel Adapter
export { TelegramAdapter } from './telegram-adapter';
export type {
  TelegramAdapterConfig,
  BotInfo,
  ParsedMessage,
  ParsedCallback,
  SentMessage,
  MessageOptions,
  MediaSource,
  PairingRequest,
} from './telegram-adapter';

// Version
export const VERSION = '1.0.0';
