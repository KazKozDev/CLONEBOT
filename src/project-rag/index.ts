/**
 * Project RAG Module
 * 
 * Semantic search and RAG for project files.
 * Uses Ollama embeddings for vector similarity search.
 */

// Types
export type {
    TextChunk,
    ChunkMetadata,
    ChunkEmbedding,
    ProjectRAGIndex,
    IndexedFile,
    IndexStats,
    SearchResult,
    SearchOptions,
    RAGContext,
    RAGConfig,
    IndexingStatus,
    ProjectIndexStatus,
} from './types';

export { DEFAULT_RAG_CONFIG } from './types';

// Chunker
export { TextChunker, generateContentHash, estimateTokenCount } from './chunker';

// Embeddings
export {
    EmbeddingsClient,
    cosineSimilarity,
    dotProduct,
    normalize,
    findTopK,
} from './embeddings';

// Store
export { ProjectRAGStore, getRAGStore } from './store';

// Service
export {
    ProjectRAGService,
    getProjectRAGService,
    createProjectRAGService,
} from './ProjectRAGService';
