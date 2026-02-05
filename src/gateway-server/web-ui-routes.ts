/**
 * Web UI API Routes
 * 
 * All HTTP API endpoints for the vanilla JS web UI.
 * Full integration with CLONEBOT modules:
 * - AgentLoop for chat
 * - UserProfileStore for long-term memory
 * - MemoryStore for system prompts
 */

import { randomUUID } from 'crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import * as path from 'path';
import type { GatewayServer } from './GatewayServer';
import { getDataStore, type Chat, type Project, type ProjectFile } from './data-store';
import type { AgentLoop } from '../agent-loop';
import type { UserProfileStore } from '../user-profile';
import type { MemoryStore } from '../memory-store';
import type { AgentLoopIntegration } from '../skill-registry/agent-loop-integration';
import { getProjectRAGService, type ProjectRAGService } from '../project-rag';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface OllamaModel {
    name: string;
    model: string;
    modified_at: string;
    size: number;
}

interface OllamaListResponse {
    models: OllamaModel[];
}

interface WebUIRoutesOptions {
    dataDir: string;
    agentLoop?: AgentLoop;
    userProfileStore?: UserProfileStore;
    memoryStore?: MemoryStore;
    skillIntegration?: AgentLoopIntegration;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

async function fetchOllamaModels(): Promise<string[]> {
    try {
        const res = await fetch('http://localhost:11434/api/tags');
        if (!res.ok) return [];
        const data = await res.json() as OllamaListResponse;
        return data.models?.map(m => m.name) || [];
    } catch {
        return [];
    }
}

async function generateChatTitle(message: string, model: string = 'qwen3:1.7b'): Promise<string> {
    try {
        const res = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                prompt: `Generate a very short title (3-5 words max, no quotes) for a chat that starts with this message:\n\n"${message.substring(0, 200)}"\n\nTitle:`,
                stream: false,
                options: { temperature: 0.3, num_predict: 20 }
            })
        });

        if (!res.ok) {
            return message.substring(0, 50);
        }

        const data = await res.json() as { response: string };
        return data.response?.trim().replace(/^["']|["']$/g, '').substring(0, 60) || message.substring(0, 50);
    } catch {
        return message.substring(0, 50);
    }
}

type SoulTraits = Record<string, number>;

interface SoulState {
    traits: SoulTraits;
    emotional_state: { mood: string; energy: number };
    stats: {
        total_interactions: number;
        positive_interactions: number;
        negative_interactions: number;
    };
    evolution_history: Array<{
        timestamp: string;
        interaction_count: number;
        changes: Record<string, string>;
    }>;
}

const DEFAULT_SOUL: SoulState = {
    traits: {
        friendliness: 0.7,
        creativity: 0.6,
        formality: 0.5,
        humor: 0.6,
        patience: 0.7,
        curiosity: 0.6,
        empathy: 0.8,
        confidence: 0.6,
    },
    emotional_state: {
        mood: 'neutral',
        energy: 0.7,
    },
    stats: {
        total_interactions: 0,
        positive_interactions: 0,
        negative_interactions: 0,
    },
    evolution_history: [],
};

function clamp01(value: number): number {
    return Math.min(1, Math.max(0, value));
}

function loadSoulState(dataDir: string): SoulState {
    const soulPath = path.join(dataDir, 'soul.json');
    try {
        if (existsSync(soulPath)) {
            const raw = readFileSync(soulPath, 'utf8');
            const parsed = JSON.parse(raw) as SoulState;
            return {
                ...DEFAULT_SOUL,
                ...parsed,
                traits: { ...DEFAULT_SOUL.traits, ...(parsed.traits || {}) },
                emotional_state: { ...DEFAULT_SOUL.emotional_state, ...(parsed.emotional_state || {}) },
                stats: { ...DEFAULT_SOUL.stats, ...(parsed.stats || {}) },
                evolution_history: parsed.evolution_history || [],
            };
        }
    } catch {
        // fall through to default
    }

    return { ...DEFAULT_SOUL, traits: { ...DEFAULT_SOUL.traits }, emotional_state: { ...DEFAULT_SOUL.emotional_state } };
}

function saveSoulState(dataDir: string, state: SoulState): void {
    const soulPath = path.join(dataDir, 'soul.json');
    if (!existsSync(dataDir)) {
        mkdirSync(dataDir, { recursive: true });
    }
    writeFileSync(soulPath, JSON.stringify(state, null, 2), 'utf8');
}

function evolveSoul(state: SoulState): void {
    const traitKeys = Object.keys(state.traits);
    if (traitKeys.length === 0) return;

    const evolutionIndex = Math.floor(state.stats.total_interactions / 50) - 1;
    if (evolutionIndex < 0) return;

    const traitKey = traitKeys[evolutionIndex % traitKeys.length];
    const delta = evolutionIndex % 2 === 0 ? 0.02 : -0.02;
    const previous = state.traits[traitKey] ?? 0.5;
    const next = clamp01(previous + delta);
    state.traits[traitKey] = next;

    state.evolution_history.push({
        timestamp: new Date().toISOString(),
        interaction_count: state.stats.total_interactions,
        changes: {
            [traitKey]: `${delta >= 0 ? '+' : ''}${delta.toFixed(2)} -> ${next.toFixed(2)}`,
        },
    });
}

function recordSoulInteraction(state: SoulState): void {
    state.stats.total_interactions += 1;
    if (state.stats.total_interactions % 50 === 0) {
        evolveSoul(state);
    }
}

function normalizeOllamaModel(model: string): string {
    if (!model) return 'gpt-oss:20b';
    if (model.includes('/')) {
        return model.split('/').pop() || model;
    }
    return model;
}

async function callOllamaChat(systemPrompt: string, userPrompt: string, model: string): Promise<string> {
    const ollamaRes = await fetch('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: normalizeOllamaModel(model),
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            stream: false
        })
    });

    if (!ollamaRes.ok) {
        const error = await ollamaRes.text();
        throw new Error(error || 'Ollama error');
    }

    const data = await ollamaRes.json() as { message?: { content?: string } };
    return data.message?.content || '';
}

const DEEP_THINKING_PROMPTS = {
    solver: `You are a confident expert analyst. Your task is to provide a clear, specific, well-reasoned answer to the given question.

CRITICAL: Strictly separate THINKING and FINAL. In THINKING you must NOT present final conclusions. No "therefore" as a final. THINKING ≠ ANSWER.

Use this invariant reasoning structure in THINKING:
1) Interpretation (what is really asked; explicit/implicit constraints)
2) Decomposition (subtasks + dependencies)
3) Hypotheses (options without choosing)
4) Checks (facts, contradictions, constraints)
5) Elimination (what was rejected and why)
6) Critical pass (what must be false for the answer to be wrong; alternative interpretations)
7) Checklist (confirm: understood, >=2 alternatives, rejected by reasons, constraints noted, no contradictions)

Mark each hypothesis with a label and basis, e.g. "H2: ... (basis: ... )". Avoid vague transitions like "obviously" or "likely" without basis; label as "assumption" if unverified.

Then provide FINAL: a cold answer only (result + applicability/limits). No reflection.

Be direct, substantive, and thorough.`,
    critic: `You are a critically-minded opponent. Your task is to find weaknesses, logical errors, unchecked assumptions, and overlooked alternatives in the response you're given.

Attack the reasoning structure:
- Are stages missing (interpretation, decomposition, hypotheses, checks, elimination, critical pass)?
- Are assumptions unlabeled or unsupported?
- Are there alternative interpretations of the question?
- Is the conclusion leaking into thinking?

Be specific about what's wrong and why it matters. Provide counterexamples and edge cases.`,
    arbiter: `You are a neutral arbiter. You have been presented with a discussion between an expert and a critic.

Your task is to:
1. Analyze both sides objectively
2. Determine which arguments held up and which were refuted
3. Synthesize the best insights from the discussion
4. Deliver a final, balanced verdict

Your FINAL must be cold and concise: result + applicability/limits. No reflection. No reasoning narrative.
`
};

function solverInitialPrompt(question: string): string {
    return `Question: ${question}\n\nProvide your answer.`;
}

function criticReviewPrompt(question: string, solverResponse: string): string {
    return `Question being discussed: ${question}\n\nThe expert gave this answer:\n---\n${solverResponse}\n---\n\nFind problems with this answer. What is missing? Where is the logic weak? What counterarguments exist? What alternatives were not considered?`;
}

function solverDefendPrompt(solverResponse: string, criticResponse: string): string {
    return `Your previous answer:\n---\n${solverResponse}\n---\n\nThe critic raised these objections:\n---\n${criticResponse}\n---\n\nRespond to this criticism. Defend your position or refine it based on the valid points raised.`;
}

function criticContinuePrompt(solverResponse: string): string {
    return `The discussion continues.\n\nThe expert responded to your criticism:\n---\n${solverResponse}\n---\n\nAre there still remaining problems? Anything else to add? If the response adequately addresses your concerns, acknowledge that.`;
}

function arbiterPrompt(question: string, transcript: string): string {
    return `Question: ${question}\n\nBelow is a debate between an expert and a critic:\n\n${transcript}\n\nAnalyze this discussion and provide the final, balanced answer to the original question. Incorporate the valid points from both sides.`;
}

// Direct Ollama call fallback (when AgentLoop not available)
async function streamOllamaChat(
    messages: Array<{ role: string; content: string; images?: string[] }>,
    model: string,
    res: any
): Promise<void> {
    const ollamaRes = await fetch('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model,
            messages,
            stream: true
        })
    });

    if (!ollamaRes.ok) {
        const error = await ollamaRes.text();
        res.status(500).json({ error: { code: 'OLLAMA_ERROR', message: error } });
        return;
    }

    res.header('Content-Type', 'application/x-ndjson');
    res.header('Cache-Control', 'no-cache');
    res.header('Connection', 'keep-alive');

    const reader = ollamaRes.body?.getReader();
    if (!reader) {
        res.status(500).json({ error: { code: 'STREAM_ERROR', message: 'Cannot read stream' } });
        return;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    const rawRes = res.raw;

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const data = JSON.parse(line);
                    if (data.message?.content) {
                        rawRes.write(JSON.stringify({ type: 'text', content: data.message.content }) + '\n');
                    }
                    if (data.done) {
                        rawRes.write(JSON.stringify({ type: 'done' }) + '\n');
                    }
                } catch {
                    // Ignore parse errors
                }
            }
        }
    } finally {
        rawRes.end();
    }
}

// -----------------------------------------------------------------------------
// Route Installation
// -----------------------------------------------------------------------------

export function installWebUIRoutes(server: GatewayServer, options: WebUIRoutesOptions | string): void {
    // Support old signature (dataDir as string) for backwards compatibility
    const opts: WebUIRoutesOptions = typeof options === 'string'
        ? { dataDir: options }
        : options;

    const { dataDir, agentLoop, userProfileStore, memoryStore, skillIntegration } = opts;
    const store = getDataStore(dataDir);

    // Initialize RAG service for semantic search
    const ragService = getProjectRAGService({ ollamaUrl: 'http://localhost:11434' }, dataDir);

    // Ensure RAG model is ready (pull if needed)
    ragService.ensureReady().catch(e => console.error('RAG init failed:', e));

    // -------------------------------------------------------------------------
    // Models API
    // -------------------------------------------------------------------------

    server.route('GET', '/api/models', async (_req, res) => {
        const models = await fetchOllamaModels();
        res.status(200).json({ models });
    });

    // -------------------------------------------------------------------------
    // Chat API (streaming) - Uses AgentLoop when available
    // -------------------------------------------------------------------------

    server.route('POST', '/api/chat', async (req, res) => {
        const body = req.body ?? {};
        const prompt = body.prompt;
        const model = body.model || 'gpt-oss:20b';
        const chatId = body.chatId;
        const userId = body.userId || 'default_user';
        const projectId = body.projectId;
        const messages = body.messages || [];
        const deepThinking = body.deepThinking || false;
        const images = body.images || [];

        if (!prompt || typeof prompt !== 'string') {
            res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'prompt is required' } });
            return;
        }

        try {
            const soulState = loadSoulState(dataDir);
            recordSoulInteraction(soulState);
            saveSoulState(dataDir, soulState);
        } catch {
            // ignore soul tracking errors
        }

        if (deepThinking) {
            try {
                res.header('Content-Type', 'application/x-ndjson');
                res.header('Cache-Control', 'no-cache');
                res.header('Connection', 'keep-alive');

                const rawRes = res.raw;

                const debateRounds = 2;

                let baseSystemPrompt = '';

                if (projectId) {
                    const project = store.getProject(projectId);
                    if (project?.systemPrompt) {
                        baseSystemPrompt += `${project.systemPrompt}\n\n`;
                    }
                }

                if (userProfileStore) {
                    try {
                        const userContext = await userProfileStore.buildUserContext(userId);
                        if (userContext) {
                            baseSystemPrompt += `User profile:\n${userContext}\n\n`;
                        }
                    } catch {
                        // ignore
                    }
                }

                const emitChunks = (text: string) => {
                    const chunkSize = 200;
                    for (let i = 0; i < text.length; i += chunkSize) {
                        rawRes.write(JSON.stringify({ type: 'content', content: text.slice(i, i + chunkSize) }) + '\n');
                    }
                };

                const transcript: Array<{ role: string; round: number; content: string }> = [];

                const runRole = async (role: 'solver' | 'critic' | 'arbiter', round: number, label: string, userPrompt: string) => {
                    rawRes.write(JSON.stringify({ type: 'round_start', role, round, label }) + '\n');

                    const systemPrompt = `${baseSystemPrompt}${DEEP_THINKING_PROMPTS[role]}`.trim();
                    const responseText = await callOllamaChat(systemPrompt, userPrompt, model);

                    emitChunks(responseText);

                    rawRes.write(JSON.stringify({
                        type: 'round_end',
                        role,
                        round,
                        full_content: responseText
                    }) + '\n');

                    transcript.push({ role, round, content: responseText });
                    return responseText;
                };

                const solverFirst = await runRole('solver', 1, 'Initial Analysis', solverInitialPrompt(prompt));

                let currentSolver = solverFirst;
                let currentCritic = '';

                for (let r = 1; r <= debateRounds; r += 1) {
                    const criticPrompt = r === 1
                        ? criticReviewPrompt(prompt, currentSolver)
                        : criticContinuePrompt(currentSolver);

                    currentCritic = await runRole('critic', r, `Critical Review ${r}`, criticPrompt);

                    if (r < debateRounds) {
                        currentSolver = await runRole('solver', r + 1, `Defense & Refinement ${r + 1}`, solverDefendPrompt(currentSolver, currentCritic));
                    }
                }

                const transcriptText = transcript
                    .map(entry => `${entry.role.toUpperCase()}:\n${entry.content}\n`)
                    .join('\n');

                const finalAnswer = await runRole('arbiter', debateRounds + 1, 'Final Synthesis', arbiterPrompt(prompt, transcriptText));

                rawRes.write(JSON.stringify({
                    type: 'done',
                    result: { final_answer: finalAnswer }
                }) + '\n');

                rawRes.end();
                return;
            } catch (error: any) {
                res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: error.message } });
                return;
            }
        }

        // If AgentLoop is available, use it for full integration
        if (agentLoop) {
            try {
                // Create session ID from chat/user
                const sessionId = chatId || `web_${userId}_${Date.now()}`;

                // Build context options
                // Format model for ollama: prefix with ollama/ if needed
                const modelId = model.includes('/') ? model : `ollama/${model}`;

                const contextOptions: any = {
                    source: 'webui',
                    userId,
                    modelId, // Use modelId for ContextAssembler
                    projectId,
                };

                // Add project system prompt if available
                if (projectId) {
                    const project = store.getProject(projectId);
                    if (project?.systemPrompt) {
                        contextOptions.systemPrompt = project.systemPrompt;
                    }

                    // Add RAG context from project files
                    try {
                        const ragContext = await ragService.getContext(projectId, prompt, { topK: 5 });
                        if (ragContext.context) {
                            contextOptions.ragContext = ragContext.context;
                            // Prepend RAG context to system prompt
                            const ragHeader = `\n\n--- Relevant context from project files ---\n${ragContext.context}\n--- End of context ---\n\n`;
                            contextOptions.systemPrompt = (contextOptions.systemPrompt || '') + ragHeader;
                        }
                    } catch (ragErr: any) {
                        console.warn('RAG context retrieval failed:', ragErr.message);
                    }
                }

                // Add user profile context if available
                if (userProfileStore) {
                    try {
                        const userContext = await userProfileStore.buildUserContext(userId);
                        if (userContext) {
                            contextOptions.userContext = userContext;
                        }
                    } catch (e) {
                        console.warn('Failed to build user context:', e);
                    }
                }

                // Process with skill integration if available
                if (skillIntegration) {
                    try {
                        const skillResult = await skillIntegration.processMessage(prompt, sessionId);
                        if (skillResult.activatedSkills.length > 0) {
                            contextOptions.activatedSkills = skillResult.activatedSkills;
                        }
                    } catch (e) {
                        console.warn('Skill processing failed:', e);
                    }
                }

                // Execute agent
                const handle = await agentLoop.execute({
                    message: prompt,
                    sessionId,
                    contextOptions,
                });

                // Set up streaming response
                res.header('Content-Type', 'application/x-ndjson');
                res.header('Cache-Control', 'no-cache');
                res.header('Connection', 'keep-alive');

                const rawRes = res.raw;

                // Stream events
                let finalAnswer = '';
                let thinkingStarted = false;
                let thinkingRound = 0;
                let sawThinking = false;

                const startThinkingRound = () => {
                    if (thinkingStarted) return;
                    thinkingStarted = true;
                    thinkingRound = 1;
                    rawRes.write(JSON.stringify({
                        type: 'round_start',
                        round: thinkingRound,
                        role: 'assistant',
                        label: 'Thinking'
                    }) + '\n');
                };

                for await (const event of handle.events) {
                    if (event.type === 'model.delta') {
                        finalAnswer += event.delta;
                        if (deepThinking) {
                            if (!sawThinking) {
                                startThinkingRound();
                                rawRes.write(JSON.stringify({ type: 'content', content: event.delta }) + '\n');
                            }
                        } else {
                            rawRes.write(JSON.stringify({ type: 'text', content: event.delta }) + '\n');
                        }
                    }

                    if (event.type === 'model.thinking') {
                        sawThinking = true;
                        startThinkingRound();
                        rawRes.write(JSON.stringify({ type: 'content', content: event.delta }) + '\n');
                    }

                    if (event.type === 'tool.start') {
                        rawRes.write(JSON.stringify({
                            type: 'tool_call',
                            name: event.toolName
                        }) + '\n');
                    }

                    if (event.type === 'tool.complete') {
                        const toolResult = event.result?.result;
                        let data: any = null;

                        if (toolResult && typeof toolResult === 'object' && 'data' in toolResult) {
                            data = (toolResult as { data?: any }).data ?? null;
                        }

                        if (data?.filename) {
                            const filename = data.filename as string;
                            rawRes.write(JSON.stringify({
                                type: 'artifact',
                                path: `/api/artifact/${filename}`,
                                title: filename,
                                artifactType: data.type
                            }) + '\n');
                        } else {
                            rawRes.write(JSON.stringify({
                                type: 'tool_complete',
                                tool: event.toolCallId,
                                result: toolResult
                            }) + '\n');
                        }
                    }

                    if (event.type === 'model.complete') {
                        if (deepThinking) {
                            if (thinkingStarted) {
                                rawRes.write(JSON.stringify({ type: 'round_end', round: thinkingRound }) + '\n');
                            }
                            rawRes.write(JSON.stringify({
                                type: 'done',
                                result: { final_answer: finalAnswer }
                            }) + '\n');
                        } else {
                            rawRes.write(JSON.stringify({ type: 'done' }) + '\n');
                        }
                    }

                    if (event.type === 'run.error') {
                        rawRes.write(JSON.stringify({
                            type: 'error',
                            message: String(event.error)
                        }) + '\n');
                    }
                }

                rawRes.end();
                return;

            } catch (error: any) {
                console.error('AgentLoop error:', error);
                // Fall back to direct Ollama call
            }
        }

        // Fallback: Direct Ollama call
        try {
            const ollamaMessages: Array<{ role: string; content: string; images?: string[] }> = [];

            // Add user profile context as system message if available
            if (userProfileStore) {
                try {
                    const userContext = await userProfileStore.buildUserContext(userId);
                    if (userContext) {
                        ollamaMessages.push({
                            role: 'system',
                            content: `User profile:\n${userContext}\n\nUse this information naturally in your responses.`
                        });
                    }
                } catch (e) {
                    console.warn('Failed to build user context:', e);
                }
            }

            // Add project system prompt and RAG context
            if (projectId) {
                const project = store.getProject(projectId);
                let projectContext = '';

                if (project?.systemPrompt) {
                    projectContext += project.systemPrompt;
                }

                // Add RAG context from project files
                try {
                    const ragContext = await ragService.getContext(projectId, prompt, { topK: 5 });
                    if (ragContext.context) {
                        projectContext += `\n\n--- Relevant context from project files ---\n${ragContext.context}\n--- End of context ---\n`;
                    }
                } catch (ragErr: any) {
                    console.warn('RAG context retrieval failed:', ragErr.message);
                }

                if (projectContext) {
                    ollamaMessages.push({ role: 'system', content: projectContext });
                }
            }

            // Add history
            for (const msg of messages) {
                if (msg.role === 'user' || msg.role === 'assistant') {
                    ollamaMessages.push({ role: msg.role, content: msg.content });
                }
            }

            // Add current message
            const userMessage: { role: string; content: string; images?: string[] } = {
                role: 'user',
                content: prompt
            };
            if (images.length > 0) {
                userMessage.images = images;
            }
            ollamaMessages.push(userMessage);

            await streamOllamaChat(ollamaMessages, model, res);
        } catch (error: any) {
            res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: error.message } });
        }
    });

    // -------------------------------------------------------------------------
    // Chats CRUD
    // -------------------------------------------------------------------------

    server.route('GET', '/api/chats', async (_req, res) => {
        const chats = store.listChats();
        const chatList = chats.map(c => ({
            id: c.id,
            title: c.title,
            updatedAt: c.updatedAt
        }));
        res.status(200).json({ chats: chatList });
    });

    server.route('POST', '/api/chats', async (req, res) => {
        const body = req.body ?? {};

        const chat: Chat = {
            id: body.id || `chat_${Date.now()}_${Math.floor(Math.random() * 9000 + 1000)}`,
            title: body.title || 'Новый чат',
            messages: body.messages || [],
            artifacts: body.artifacts || [],
            projectId: body.projectId || undefined,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        const saved = store.saveChat(chat);
        res.status(200).json({ chat: saved });
    });

    server.route('GET', '/api/chats/:chatId', async (req, res) => {
        const chatId = req.params.chatId;
        const chat = store.getChat(chatId);

        if (!chat) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Chat not found' } });
            return;
        }

        res.status(200).json(chat);
    });

    server.route('DELETE', '/api/chats/:chatId', async (req, res) => {
        const chatId = req.params.chatId;
        const deleted = store.deleteChat(chatId);

        if (!deleted) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Chat not found' } });
            return;
        }

        res.status(200).json({ success: true });
    });

    server.route('POST', '/api/chats/generate-title', async (req, res) => {
        const body = req.body ?? {};
        const userMessage = body.userMessage || body.message;

        if (!userMessage) {
            res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'userMessage is required' } });
            return;
        }

        const title = await generateChatTitle(userMessage);
        res.status(200).json({ title });
    });

    // -------------------------------------------------------------------------
    // Projects CRUD
    // -------------------------------------------------------------------------

    server.route('GET', '/api/projects', async (_req, res) => {
        const projects = store.listProjects();
        res.status(200).json({ projects });
    });

    server.route('POST', '/api/projects', async (req, res) => {
        const body = req.body ?? {};

        const project: Project = {
            id: body.id || `project_${Date.now()}`,
            name: body.name || 'New Project',
            description: body.description || '',
            systemPrompt: body.systemPrompt || '',
            color: body.color || '#d4a574',
            files: body.files || [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        const saved = store.saveProject(project);
        res.status(200).json({ project: saved });
    });

    server.route('GET', '/api/projects/:projectId', async (req, res) => {
        const projectId = req.params.projectId;
        const project = store.getProject(projectId);

        if (!project) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
            return;
        }

        res.status(200).json(project);
    });

    server.route('PUT', '/api/projects/:projectId', async (req, res) => {
        const projectId = req.params.projectId;
        const existing = store.getProject(projectId);

        if (!existing) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
            return;
        }

        const body = req.body ?? {};
        const updated: Project = {
            ...existing,
            name: body.name ?? existing.name,
            description: body.description ?? existing.description,
            systemPrompt: body.systemPrompt ?? existing.systemPrompt,
            color: body.color ?? existing.color,
            files: body.files ?? existing.files,
            updatedAt: new Date().toISOString()
        };

        const saved = store.saveProject(updated);
        res.status(200).json({ project: saved });
    });

    server.route('DELETE', '/api/projects/:projectId', async (req, res) => {
        const projectId = req.params.projectId;
        const deleted = store.deleteProject(projectId);

        if (!deleted) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
            return;
        }

        res.status(200).json({ success: true });
    });

    // -------------------------------------------------------------------------
    // Project Chat
    // -------------------------------------------------------------------------

    server.route('GET', '/api/projects/:projectId/chat', async (req, res) => {
        const projectId = req.params.projectId;
        const chats = store.loadChats().filter(c => c.projectId === projectId);
        const chat = chats[0];

        if (!chat) {
            const newChat: Chat = {
                id: `chat_${projectId}_${Date.now()}`,
                title: 'Project Chat',
                messages: [],
                artifacts: [],
                projectId,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            store.saveChat(newChat);
            res.status(200).json(newChat);
            return;
        }

        res.status(200).json(chat);
    });

    server.route('POST', '/api/projects/:projectId/chat', async (req, res) => {
        const projectId = req.params.projectId;
        const body = req.body ?? {};

        const chat: Chat = {
            id: body.id || `chat_${projectId}_${Date.now()}`,
            title: body.title || 'Project Chat',
            messages: body.messages || [],
            artifacts: body.artifacts || [],
            projectId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        const saved = store.saveChat(chat);
        res.status(200).json(saved);
    });

    // -------------------------------------------------------------------------
    // Project Files
    // -------------------------------------------------------------------------

    server.route('GET', '/api/projects/:projectId/files', async (req, res) => {
        const projectId = req.params.projectId;
        const project = store.getProject(projectId);

        if (!project) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
            return;
        }

        res.status(200).json({ files: project.files || [] });
    });

    server.route('POST', '/api/projects/:projectId/files', async (req, res) => {
        const projectId = req.params.projectId;
        const body = req.body ?? {};

        const file: ProjectFile = {
            id: body.id || `file_${Date.now()}`,
            name: body.name || 'Untitled',
            path: body.path || '',
            content: body.content,
            size: body.content ? body.content.length : 0,
            updatedAt: new Date().toISOString()
        };

        // Debug log
        if (body.content) {
            console.log(`[Upload] File ${file.name} content length: ${body.content.length}`);
        } else {
            console.log(`[Upload] File ${file.name} has NO content`);
        }

        const project = store.addProjectFile(projectId, file);

        if (!project) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
            return;
        }

        // RAG indexing in background (don't block response)
        if (file.content && typeof file.content === 'string') {
            console.log(`[RAG] Starting indexing for ${file.name}...`);
            ragService.indexFile(projectId, file.id, file.name, file.content)
                .then(status => {
                    console.log(`RAG indexed file ${file.name}: ${status.chunksCreated} chunks`);
                })
                .catch(err => {
                    console.warn(`RAG indexing failed for ${file.name}:`, err.message);
                });
        }

        res.status(200).json({ file, project });
    });

    server.route('DELETE', '/api/projects/:projectId/files/:fileId', async (req, res) => {
        const projectId = req.params.projectId;
        const fileId = req.params.fileId;

        // Get file info before removal for RAG cleanup
        const projectBefore = store.getProject(projectId);
        const fileToRemove = projectBefore?.files?.find(f => f.id === fileId);

        const project = store.removeProjectFile(projectId, fileId);

        if (!project) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
            return;
        }

        // Remove from RAG index
        if (fileToRemove) {
            ragService.removeFile(projectId, fileId, fileToRemove.name)
                .catch(err => console.warn('RAG removal failed:', err.message));
        }

        res.status(200).json({ success: true, project });
    });

    // -------------------------------------------------------------------------
    // Project RAG API
    // -------------------------------------------------------------------------

    // Get RAG index status for a project
    server.route('GET', '/api/projects/:projectId/rag/status', async (req, res) => {
        const projectId = req.params.projectId;
        const status = ragService.getIndexInfo(projectId);
        res.status(200).json(status);
    });

    // Search project files using semantic search
    server.route('POST', '/api/projects/:projectId/rag/search', async (req, res) => {
        const projectId = req.params.projectId;
        const body = req.body ?? {};
        const query = body.query;
        const topK = body.topK || 5;
        const minScore = body.minScore || 0.3;

        if (!query) {
            res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'query is required' } });
            return;
        }

        try {
            const results = await ragService.search(projectId, query, { topK, minScore });
            res.status(200).json({
                results: results.map(r => ({
                    chunk: {
                        id: r.chunk.id,
                        fileId: r.chunk.fileId,
                        fileName: r.chunk.fileName,
                        content: r.chunk.content,
                        metadata: r.chunk.metadata,
                    },
                    score: r.score,
                    rank: r.rank,
                })),
                query,
                totalResults: results.length,
            });
        } catch (error: any) {
            res.status(500).json({ error: { code: 'RAG_ERROR', message: error.message } });
        }
    });

    // Reindex all project files
    server.route('POST', '/api/projects/:projectId/rag/reindex', async (req, res) => {
        const projectId = req.params.projectId;
        const project = store.getProject(projectId);

        if (!project) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
            return;
        }

        const files = (project.files || [])
            .filter(f => f.content && typeof f.content === 'string')
            .map(f => ({ id: f.id, name: f.name, content: f.content as string }));

        if (files.length === 0) {
            res.status(200).json({ message: 'No files to index', indexed: 0 });
            return;
        }

        try {
            const status = await ragService.indexFiles(projectId, files);
            res.status(200).json({
                message: 'Indexing complete',
                indexed: status.totalFiles,
                chunks: status.totalChunks,
                files: status.files,
            });
        } catch (error: any) {
            res.status(500).json({ error: { code: 'RAG_ERROR', message: error.message } });
        }
    });

    // Check RAG service availability
    server.route('GET', '/api/rag/status', async (_req, res) => {
        const available = await ragService.isAvailable();
        res.status(200).json({ available, embeddingModel: ragService.getModelName() });
    });

    // -------------------------------------------------------------------------
    // Artifacts
    // -------------------------------------------------------------------------

    server.route('GET', '/api/artifact/:filename', async (req, res) => {
        const filename = req.params.filename;
        const content = store.getArtifact(filename);

        if (content === null) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Artifact not found' } });
            return;
        }

        res.status(200).json({ content });
    });

    server.route('GET', '/api/artifacts', async (_req, res) => {
        const artifacts = store.listArtifacts();
        res.status(200).json({ artifacts });
    });

    // -------------------------------------------------------------------------
    // Memory API - Using MemoryStore when available
    // -------------------------------------------------------------------------

    server.route('POST', '/api/memory/compact/:chatId', async (req, res) => {
        const chatId = req.params.chatId;
        // TODO: Implement actual compaction
        res.status(200).json({ success: true, removed_messages: 0 });
    });

    server.route('POST', '/api/memory/reset/:chatId', async (req, res) => {
        const chatId = req.params.chatId;
        const chat = store.getChat(chatId);

        if (chat) {
            chat.messages = [];
            chat.artifacts = [];
            store.saveChat(chat);
        }

        res.status(200).json({ success: true });
    });

    server.route('GET', '/api/memory/stats', async (_req, res) => {
        const chats = store.loadChats();
        res.status(200).json({
            sessions: chats.length,
            total_messages: chats.reduce((sum, c) => sum + c.messages.length, 0)
        });
    });

    server.route('POST', '/api/memory/cleanup', async (_req, res) => {
        res.status(200).json({ success: true, cleaned: 0 });
    });

    // -------------------------------------------------------------------------
    // Skills API
    // -------------------------------------------------------------------------

    const skillsDir = path.resolve('./skills');

    server.route('GET', '/api/skills', async (_req, res) => {
        if (!existsSync(skillsDir)) {
            res.status(200).json({ skills: [] });
            return;
        }

        try {
            const { readdirSync } = await import('fs');
            const files = readdirSync(skillsDir).filter(f => f.endsWith('.md'));
            const skills = files.map(f => ({
                name: f.replace('.md', ''),
                enabled: true
            }));
            res.status(200).json({ skills });
        } catch {
            res.status(200).json({ skills: [] });
        }
    });

    server.route('GET', '/api/skills/:name', async (req, res) => {
        const name = req.params.name;
        const filePath = path.join(skillsDir, `${name}.md`);

        if (!existsSync(filePath)) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Skill not found' } });
            return;
        }

        const content = readFileSync(filePath, 'utf-8');
        res.status(200).json({ name, content, enabled: true });
    });

    server.route('GET', '/api/skills/:name/invoke', async (req, res) => {
        const name = req.params.name;
        const filePath = path.join(skillsDir, `${name}.md`);

        if (!existsSync(filePath)) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Skill not found' } });
            return;
        }

        const content = readFileSync(filePath, 'utf-8');
        res.status(200).json({ name, content });
    });

    server.route('POST', '/api/skills', async (req, res) => {
        const body = req.body ?? {};
        const name = body.name;
        const content = body.content;

        if (!name || !content) {
            res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'name and content are required' } });
            return;
        }

        if (!existsSync(skillsDir)) {
            mkdirSync(skillsDir, { recursive: true });
        }

        const filePath = path.join(skillsDir, `${name}.md`);
        writeFileSync(filePath, content, 'utf-8');

        res.status(200).json({ name, content, enabled: true });
    });

    server.route('PUT', '/api/skills/:name', async (req, res) => {
        const name = req.params.name;
        const body = req.body ?? {};
        const content = body.content;

        if (!content) {
            res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'content is required' } });
            return;
        }

        const filePath = path.join(skillsDir, `${name}.md`);
        writeFileSync(filePath, content, 'utf-8');

        res.status(200).json({ name, content, enabled: true });
    });

    server.route('DELETE', '/api/skills/:name', async (req, res) => {
        const name = req.params.name;
        const filePath = path.join(skillsDir, `${name}.md`);

        if (!existsSync(filePath)) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Skill not found' } });
            return;
        }

        const { unlinkSync } = await import('fs');
        unlinkSync(filePath);

        res.status(200).json({ success: true });
    });

    server.route('POST', '/api/skills/:name/toggle', async (req, res) => {
        const name = req.params.name;
        res.status(200).json({ name, enabled: true });
    });

    // -------------------------------------------------------------------------
    // MCP Servers API
    // -------------------------------------------------------------------------

    const mcpConfigFile = path.join(dataDir, 'mcp-servers.json');

    function loadMcpServers(): any[] {
        if (!existsSync(mcpConfigFile)) return [];
        try {
            return JSON.parse(readFileSync(mcpConfigFile, 'utf-8'));
        } catch {
            return [];
        }
    }

    function saveMcpServers(servers: any[]): void {
        writeFileSync(mcpConfigFile, JSON.stringify(servers, null, 2), 'utf-8');
    }

    server.route('GET', '/api/mcp/servers', async (_req, res) => {
        const servers = loadMcpServers().map((server) => ({
            ...server,
            status: server.status || (server.enabled ? 'connected' : 'disconnected')
        }));
        res.status(200).json({ servers });
    });

    server.route('POST', '/api/mcp/servers', async (req, res) => {
        const body = req.body ?? {};
        const servers = loadMcpServers();

        const newServer = {
            id: body.id || `mcp_${Date.now()}`,
            name: body.name,
            transport: body.transport || 'stdio',
            command: body.command,
            args: body.args,
            url: body.url,
            env: body.env,
            enabled: true,
            status: 'connected'
        };

        servers.push(newServer);
        saveMcpServers(servers);

        res.status(200).json({ server: newServer });
    });

    server.route('DELETE', '/api/mcp/servers/:id', async (req, res) => {
        const id = req.params.id;
        let servers = loadMcpServers();
        servers = servers.filter(s => s.id !== id);
        saveMcpServers(servers);
        res.status(200).json({ success: true });
    });

    server.route('POST', '/api/mcp/servers/:id/toggle', async (req, res) => {
        const id = req.params.id;
        const servers = loadMcpServers();
        const mcpServer = servers.find(s => s.id === id);

        if (mcpServer) {
            mcpServer.enabled = !mcpServer.enabled;
            mcpServer.status = mcpServer.enabled ? 'connected' : 'disconnected';
            saveMcpServers(servers);
            res.status(200).json({ server: mcpServer });
        } else {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Server not found' } });
        }
    });

    // -------------------------------------------------------------------------
    // Soul API
    // -------------------------------------------------------------------------

    server.route('GET', '/api/soul', async (_req, res) => {
        const state = loadSoulState(dataDir);
        res.status(200).json({
            traits: state.traits,
            emotional_state: state.emotional_state,
            stats: state.stats,
            evolution_history: state.evolution_history,
        });
    });

    server.route('POST', '/api/soul/reset', async (_req, res) => {
        const state = loadSoulState(dataDir);
        const nextState: SoulState = {
            ...DEFAULT_SOUL,
            evolution_history: state.evolution_history,
        };
        saveSoulState(dataDir, nextState);
        res.status(200).json({ success: true });
    });

    // -------------------------------------------------------------------------
    // User Profile API - Full integration with UserProfileStore
    // -------------------------------------------------------------------------

    server.route('GET', '/api/user/:userId/profile', async (req, res) => {
        const userId = req.params.userId;

        if (userProfileStore) {
            try {
                const profile = await userProfileStore.getProfile(userId);
                let facts = await userProfileStore.recallFacts(userId, { limit: 50 });

                // Legacy migration: if user has no facts, try to import from web-user
                if (facts.length === 0 && userId !== 'web-user') {
                    try {
                        const legacyFacts = await userProfileStore.recallFacts('web-user', { limit: 50 });
                        if (legacyFacts.length > 0) {
                            profile.facts = legacyFacts.map(f => ({ ...f }));
                            await userProfileStore.saveProfile(profile);
                            facts = legacyFacts;
                        }
                    } catch {
                        // ignore legacy migration errors
                    }
                }

                res.status(200).json({
                    userId: profile.userId,
                    name: profile.name,
                    facts: facts.reduce((acc, f) => {
                        acc[f.id] = { content: f.content, category: f.category };
                        return acc;
                    }, {} as Record<string, { content: string; category: string }>),
                    preferences: profile.preferences,
                    metadata: profile.metadata
                });
                return;
            } catch (e) {
                console.warn('Failed to get user profile:', e);
            }
        }

        // Fallback
        res.status(200).json({
            userId,
            facts: {},
            preferences: {}
        });
    });

    server.route('POST', '/api/user/:userId/remember', async (req, res) => {
        const userId = req.params.userId;
        const body = req.body ?? {};
        const fact = body.fact;
        const category = body.category || 'personal';

        if (!fact) {
            res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'fact is required' } });
            return;
        }

        if (userProfileStore) {
            try {
                const savedFact = await userProfileStore.rememberFact(userId, fact, { category });
                res.status(200).json({ success: true, fact: savedFact });
                return;
            } catch (e: any) {
                res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: e.message } });
                return;
            }
        }

        res.status(200).json({ success: false, message: 'UserProfileStore not available' });
    });

    server.route('POST', '/api/user/:userId/forget', async (req, res) => {
        const userId = req.params.userId;
        const body = req.body ?? {};
        const factId = body.factId;

        if (!factId) {
            res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'factId is required' } });
            return;
        }

        if (userProfileStore) {
            try {
                const success = await userProfileStore.forgetFact(userId, factId);
                res.status(200).json({ success });
                return;
            } catch (e: any) {
                res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: e.message } });
                return;
            }
        }

        res.status(200).json({ success: false, message: 'UserProfileStore not available' });
    });
}
