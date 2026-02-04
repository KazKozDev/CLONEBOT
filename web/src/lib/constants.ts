export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
export const TEXT_MODEL_ID = process.env.NEXT_PUBLIC_TEXT_MODEL_ID || 'ollama/gpt-oss:20b';
export const VISION_MODEL_ID = process.env.NEXT_PUBLIC_VISION_MODEL_ID || 'ollama/qwen3-vl:4b';

export const EVENTS = {
  RUN_QUEUED: 'run.queued',
  RUN_STARTED: 'run.started',
  RUN_COMPLETED: 'run.completed',
  RUN_ERROR: 'run.error',
  RUN_CANCELLED: 'run.cancelled',
  CONTEXT_START: 'context.start',
  CONTEXT_COMPLETE: 'context.complete',
  MODEL_START: 'model.start',
  MODEL_DELTA: 'model.delta',
  MODEL_COMPLETE: 'model.complete',
  TOOL_START: 'tool.start',
  TOOL_COMPLETE: 'tool.complete',
  TOOL_ERROR: 'tool.error',
} as const;
