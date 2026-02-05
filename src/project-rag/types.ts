/**
 * Project RAG Types
 * 
 * Types for semantic search and RAG functionality per project.
 */

// =============================================================================
// Chunk Types
// =============================================================================

/**
 * A text chunk with metadata for RAG
 */
export interface TextChunk {
    /** Unique identifier for this chunk */
    id: string;

    /** Source file ID */
    fileId: string;

    /** Source file name */
    fileName: string;

    /** Chunk content */
    content: string;

    /** Character offset in original file */
    startOffset: number;

    /** Character end offset in original file */
    endOffset: number;

    /** Chunk index within the file */
    chunkIndex: number;

    /** Total chunks in the file */
    totalChunks: number;

    /** Approximate token count */
    tokenCount: number;

    /** Metadata extracted from content */
    metadata?: ChunkMetadata;
}

/**
 * Optional metadata for chunks
 */
export interface ChunkMetadata {
    /** Detected language (for code) */
    language?: string;

    /** Section/heading this chunk belongs to */
    section?: string;

    /** Line numbers in source file */
    lineStart?: number;
    lineEnd?: number;
}

// =============================================================================
// Embedding Types
// =============================================================================

/**
 * Vector embedding for a chunk
 */
export interface ChunkEmbedding {
    /** Chunk ID */
    chunkId: string;

    /** Embedding vector */
    vector: number[];

    /** Model used for embedding */
    model: string;

    /** Timestamp when created */
    createdAt: string;
}

/**
 * Project RAG index - stored per project
 */
export interface ProjectRAGIndex {
    /** Project ID */
    projectId: string;

    /** Index version for compatibility checks */
    version: number;

    /** Embedding model used */
    embeddingModel: string;

    /** Embedding dimension */
    dimension: number;

    /** All chunks */
    chunks: TextChunk[];

    /** All embeddings (parallel array to chunks) */
    embeddings: number[][];

    /** File metadata */
    files: IndexedFile[];

    /** Last update timestamp */
    updatedAt: string;

    /** Statistics */
    stats: IndexStats;
}

/**
 * Indexed file metadata
 */
export interface IndexedFile {
    /** File ID */
    id: string;

    /** File name */
    name: string;

    /** Original file size in bytes */
    size: number;

    /** Number of chunks */
    chunkCount: number;

    /** When file was indexed */
    indexedAt: string;

    /** Content hash for change detection */
    contentHash: string;
}

/**
 * Index statistics
 */
export interface IndexStats {
    /** Total number of chunks */
    totalChunks: number;

    /** Total number of files */
    totalFiles: number;

    /** Total tokens across all chunks */
    totalTokens: number;

    /** Average chunk size in tokens */
    avgChunkSize: number;
}

// =============================================================================
// Search Types
// =============================================================================

/**
 * Search result with relevance score
 */
export interface SearchResult {
    /** The chunk */
    chunk: TextChunk;

    /** Cosine similarity score (0-1) */
    score: number;

    /** Rank in results */
    rank: number;
}

/**
 * Search options
 */
export interface SearchOptions {
    /** Maximum number of results */
    topK?: number;

    /** Minimum similarity threshold (0-1) */
    minScore?: number;

    /** Filter by file IDs */
    fileIds?: string[];

    /** Include surrounding context */
    includeContext?: boolean;
}

/**
 * Context returned for LLM
 */
export interface RAGContext {
    /** Formatted context string for LLM */
    context: string;

    /** Source chunks used */
    sources: SearchResult[];

    /** Total tokens in context */
    tokenCount: number;

    /** Query that generated this context */
    query: string;
}

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * RAG configuration options
 */
export interface RAGConfig {
    /** Ollama base URL */
    ollamaUrl: string;

    /** Embedding model to use */
    embeddingModel: string;

    /** Target chunk size in tokens */
    chunkSize: number;

    /** Chunk overlap in tokens */
    chunkOverlap: number;

    /** Default number of results */
    defaultTopK: number;

    /** Default minimum score */
    defaultMinScore: number;

    /** Maximum context tokens */
    maxContextTokens: number;
}

/**
 * Default RAG configuration
 */
export const DEFAULT_RAG_CONFIG: RAGConfig = {
    ollamaUrl: 'http://localhost:11434',
    embeddingModel: 'all-minilm',
    chunkSize: 500,
    chunkOverlap: 50,
    defaultTopK: 5,
    defaultMinScore: 0.3,
    maxContextTokens: 4000,
};

// =============================================================================
// Status Types
// =============================================================================

/**
 * Indexing status for a file
 */
export interface IndexingStatus {
    fileId: string;
    fileName: string;
    status: 'pending' | 'processing' | 'completed' | 'error';
    progress: number;  // 0-100
    error?: string;
    chunksCreated?: number;
}

/**
 * Overall project indexing status
 */
export interface ProjectIndexStatus {
    projectId: string;
    isIndexing: boolean;
    files: IndexingStatus[];
    lastIndexed?: string;
    totalChunks: number;
    totalFiles: number;
}
