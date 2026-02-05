/**
 * Embeddings Client
 * 
 * Generates embeddings using local Hugging Face Transformers (via Xenova) OR Ollama.
 * Default is local execution using 'Xenova/all-MiniLM-L6-v2'.
 */

import { pipeline, env } from '@xenova/transformers';
import type { RAGConfig } from './types';

// Skip local model checks for quicker startup
env.allowLocalModels = false;
env.useBrowserCache = false;

// =============================================================================
// Embeddings Client
// =============================================================================

export class EmbeddingsClient {
    private baseUrl: string;
    private modelName: string;
    private dimension: number = 384; // all-MiniLM-L6-v2 default
    private pipe: any = null;
    private provider: 'local' | 'ollama';

    constructor(config?: Partial<Pick<RAGConfig, 'ollamaUrl' | 'embeddingModel'>>) {
        this.baseUrl = config?.ollamaUrl ?? 'http://localhost:11434';

        // Check if model name implies Ollama or Local
        const requestedModel = config?.embeddingModel ?? 'Xenova/all-MiniLM-L6-v2';

        if (requestedModel.startsWith('ollama:') || requestedModel === 'nomic-embed-text' || requestedModel === 'mxbai-embed-large') {
            this.provider = 'ollama';
            this.modelName = requestedModel.replace('ollama:', '');
        } else {
            this.provider = 'local';
            // Output simpler name for UI, but use full repo ID
            if (requestedModel === 'all-minilm') {
                this.modelName = 'Xenova/all-MiniLM-L6-v2';
            } else {
                this.modelName = requestedModel;
            }
        }
    }

    /**
     * Check availability / Load model
     */
    async isAvailable(): Promise<boolean> {
        if (this.provider === 'local') {
            try {
                if (!this.pipe) {
                    await this.ensureModel();
                }
                return true;
            } catch (e) {
                console.error('Local embedding model check failed:', e);
                return false;
            }
        } else {
            // Ollama check
            try {
                const response = await fetch(`${this.baseUrl}/api/tags`);
                return response.ok;
            } catch {
                return false;
            }
        }
    }

    /**
     * Ensure model is loaded (Local) or pulled (Ollama)
     */
    async ensureModel(): Promise<boolean> {
        if (this.provider === 'local') {
            if (this.pipe) return true;

            try {
                console.log(`Loading local embedding model: ${this.modelName}...`);
                this.pipe = await pipeline('feature-extraction', this.modelName);
                console.log('✓ Model loaded');
                return true;
            } catch (error) {
                console.error('Failed to load local model:', error);
                return false;
            }
        } else {
            // Ollama pull logic (simplified)
            return true;
        }
    }

    /**
     * Generate embedding for a single text
     */
    async embed(text: string): Promise<number[]> {
        if (this.provider === 'local') {
            if (!this.pipe) await this.ensureModel();

            // Generate embedding
            const output = await this.pipe(text, { pooling: 'mean', normalize: true });
            // output is a Tensor, get data
            const embedding = Array.from(output.data) as number[];

            this.dimension = embedding.length;
            return embedding;
        } else {
            // Ollama API
            const response = await fetch(`${this.baseUrl}/api/embeddings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.modelName,
                    prompt: text,
                }),
            });

            if (!response.ok) throw new Error('Ollama embedding failed');
            const data = await response.json() as any;
            return data.embedding;
        }
    }

    /**
     * Generate embeddings for multiple texts (batched)
     */
    async embedBatch(texts: string[], batchSize: number = 10): Promise<number[][]> {
        const embeddings: number[][] = [];

        // For local, we can process sequentially or find a way to batch if supported
        // Sequential is safer for memory in Node.js for now
        for (const text of texts) {
            const emb = await this.embed(text);
            embeddings.push(emb);
        }

        return embeddings;
    }

    /**
     * Get embedding dimension
     */
    getDimension(): number {
        return this.dimension;
    }

    /**
     * Get model name
     */
    getModel(): string {
        return this.modelName;
    }
}

// =============================================================================
// Vector Operations (Unchanged)
// =============================================================================

export function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function dotProduct(a: number[], b: number[]): number {
    let result = 0;
    for (let i = 0; i < a.length; i++) result += a[i] * b[i];
    return result;
}

export function normalize(v: number[]): number[] {
    let norm = 0;
    for (const x of v) norm += x * x;
    norm = Math.sqrt(norm);
    if (norm === 0) return v;
    return v.map(x => x / norm);
}

export function findTopK(
    queryVector: number[],
    vectors: number[][],
    k: number,
    minScore: number = 0
): Array<{ index: number; score: number }> {
    const scores = vectors.map((v, index) => ({
        index,
        score: cosineSimilarity(queryVector, v),
    }));

    return scores
        .filter(s => s.score >= minScore)
        .sort((a, b) => b.score - a.score)
        .slice(0, k);
}
