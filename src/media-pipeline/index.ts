/**
 * Media Pipeline Module
 * 
 * System for processing incoming media files:
 * - Images: description, OCR
 * - Audio: transcription
 * - Video: understanding
 * - Documents: text extraction
 */

export * from './types';
export * from './MediaPipeline';
export * from './detector';
export * from './validator';
export * from './converter';
export * from './cache';
export * from './provider-chain';

// Providers
export * from './providers/base';
export * from './providers/openai-audio';
export * from './providers/groq-audio';
export * from './providers/cli-audio';
export * from './providers/openai-vision';
export * from './providers/anthropic-vision';
export * from './providers/ollama-vision';
export * from './providers/document';
