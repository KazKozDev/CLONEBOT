/**
 * Project RAG Service
 * 
 * Main service for semantic search within project files.
 * Integrates chunking, embeddings, and search.
 */

import type {
    TextChunk,
    IndexedFile,
    SearchResult,
    SearchOptions,
    RAGContext,
    RAGConfig,
    ProjectIndexStatus,
    IndexingStatus,
    ProjectRAGIndex,
} from './types';
import { DEFAULT_RAG_CONFIG } from './types';
import { TextChunker, generateContentHash, estimateTokenCount } from './chunker';
import { EmbeddingsClient, cosineSimilarity, findTopK } from './embeddings';
import { ProjectRAGStore, getRAGStore } from './store';

// =============================================================================
// Project RAG Service
// =============================================================================

export class ProjectRAGService {
    private config: RAGConfig;
    private chunker: TextChunker;
    private embeddings: EmbeddingsClient;
    private store: ProjectRAGStore;

    // Indexing state per project
    private indexingStatus: Map<string, ProjectIndexStatus> = new Map();

    constructor(config?: Partial<RAGConfig>, dataDir?: string) {
        this.config = { ...DEFAULT_RAG_CONFIG, ...config };

        this.chunker = new TextChunker({
            chunkSize: this.config.chunkSize,
            chunkOverlap: this.config.chunkOverlap,
        });

        this.embeddings = new EmbeddingsClient({
            ollamaUrl: this.config.ollamaUrl,
            embeddingModel: this.config.embeddingModel,
        });

        this.store = getRAGStore(dataDir);
    }

    // =========================================================================
    // Initialization
    // =========================================================================

    /**
     * Check if RAG service is available
     */
    async isAvailable(): Promise<boolean> {
        return this.embeddings.isAvailable();
    }

    /**
     * Ensure embedding model is available
     */
    async ensureReady(): Promise<boolean> {
        return this.embeddings.ensureModel();
    }

    /**
     * Get current embedding model name
     */
    getModelName(): string {
        return this.embeddings.getModel();
    }

    // =========================================================================
    // File Indexing
    // =========================================================================

    /**
     * Index a single file for a project
     */
    async indexFile(
        projectId: string,
        fileId: string,
        fileName: string,
        content: string
    ): Promise<IndexingStatus> {
        const status: IndexingStatus = {
            fileId,
            fileName,
            status: 'processing',
            progress: 0,
        };

        try {
            // Ensure embedding model is ready
            await this.ensureReady();

            // Check if re-indexing is needed
            const contentHash = generateContentHash(content);
            if (!this.store.needsReindex(projectId, fileId, contentHash)) {
                status.status = 'completed';
                status.progress = 100;
                return status;
            }

            // Save file to disk
            this.store.saveFile(projectId, fileId, fileName, content);
            status.progress = 10;

            // Chunk the document
            const chunks = this.chunker.chunkDocument(fileId, fileName, content);
            status.progress = 30;

            if (chunks.length === 0) {
                status.status = 'completed';
                status.progress = 100;
                status.chunksCreated = 0;
                return status;
            }

            // Generate embeddings
            const chunkTexts = chunks.map(c => c.content);
            const embeddings = await this.embeddings.embedBatch(chunkTexts);
            status.progress = 80;

            // Create file metadata
            const file: IndexedFile = {
                id: fileId,
                name: fileName,
                size: content.length,
                chunkCount: chunks.length,
                indexedAt: new Date().toISOString(),
                contentHash,
            };

            // Ensure index exists
            let index = this.store.loadIndex(projectId);
            if (!index) {
                index = this.store.createIndex(
                    projectId,
                    this.embeddings.getModel(),
                    this.embeddings.getDimension()
                );
                this.store.saveIndex(index);
            }

            // Add to index
            this.store.addFileChunks(projectId, file, chunks, embeddings);

            status.status = 'completed';
            status.progress = 100;
            status.chunksCreated = chunks.length;

            return status;
        } catch (error: any) {
            status.status = 'error';
            status.error = error.message;
            return status;
        }
    }

    /**
     * Index multiple files for a project
     */
    async indexFiles(
        projectId: string,
        files: Array<{ id: string; name: string; content: string }>
    ): Promise<ProjectIndexStatus> {
        const projectStatus: ProjectIndexStatus = {
            projectId,
            isIndexing: true,
            files: [],
            totalChunks: 0,
            totalFiles: 0,
        };

        this.indexingStatus.set(projectId, projectStatus);

        try {
            // Ensure embedding model is ready
            const ready = await this.ensureReady();
            if (!ready) {
                throw new Error('Embedding model not available');
            }

            // Index each file
            for (const file of files) {
                const status = await this.indexFile(
                    projectId,
                    file.id,
                    file.name,
                    file.content
                );
                projectStatus.files.push(status);

                if (status.status === 'completed') {
                    projectStatus.totalChunks += status.chunksCreated || 0;
                    projectStatus.totalFiles++;
                }
            }

            projectStatus.isIndexing = false;
            projectStatus.lastIndexed = new Date().toISOString();

        } catch (error: any) {
            projectStatus.isIndexing = false;
            // Mark all pending files as error
            for (const status of projectStatus.files) {
                if (status.status === 'pending') {
                    status.status = 'error';
                    status.error = error.message;
                }
            }
        }

        this.indexingStatus.set(projectId, projectStatus);
        return projectStatus;
    }

    /**
     * Remove a file from the index
     */
    async removeFile(projectId: string, fileId: string, fileName: string): Promise<void> {
        this.store.removeFileChunks(projectId, fileId);
        this.store.deleteFile(projectId, fileId, fileName);
    }

    /**
     * Delete entire project index
     */
    async deleteProjectIndex(projectId: string): Promise<boolean> {
        return this.store.deleteIndex(projectId);
    }

    // =========================================================================
    // Search
    // =========================================================================

    /**
     * Search for relevant chunks in a project
     */
    async search(
        projectId: string,
        query: string,
        options?: SearchOptions
    ): Promise<SearchResult[]> {
        const index = this.store.loadIndex(projectId);
        if (!index || index.chunks.length === 0) {
            return [];
        }

        const topK = options?.topK ?? this.config.defaultTopK;
        const minScore = options?.minScore ?? this.config.defaultMinScore;

        // Generate query embedding
        const queryEmbedding = await this.embeddings.embed(query);

        // Filter embeddings by file if needed
        let searchIndices: number[];
        let searchEmbeddings: number[][];

        if (options?.fileIds && options.fileIds.length > 0) {
            const fileIdSet = new Set(options.fileIds);
            searchIndices = [];
            searchEmbeddings = [];

            for (let i = 0; i < index.chunks.length; i++) {
                if (fileIdSet.has(index.chunks[i].fileId)) {
                    searchIndices.push(i);
                    searchEmbeddings.push(index.embeddings[i]);
                }
            }
        } else {
            searchIndices = index.chunks.map((_, i) => i);
            searchEmbeddings = index.embeddings;
        }

        // Find top-k
        const topResults = findTopK(queryEmbedding, searchEmbeddings, topK, minScore);

        // Map back to chunks
        const results: SearchResult[] = topResults.map((result, rank) => ({
            chunk: index.chunks[searchIndices[result.index]],
            score: result.score,
            rank: rank + 1,
        }));

        return results;
    }

    /**
     * Get formatted context for LLM from search results
     */
    async getContext(
        projectId: string,
        query: string,
        options?: SearchOptions
    ): Promise<RAGContext> {
        const results = await this.search(projectId, query, options);

        if (results.length === 0) {
            return {
                context: '',
                sources: [],
                tokenCount: 0,
                query,
            };
        }

        // Build context string with token limit
        let context = '';
        let tokenCount = 0;
        const usedResults: SearchResult[] = [];

        for (const result of results) {
            const chunkContext = this.formatChunkContext(result);
            const chunkTokens = estimateTokenCount(chunkContext);

            if (tokenCount + chunkTokens > this.config.maxContextTokens) {
                break;
            }

            context += chunkContext + '\n\n';
            tokenCount += chunkTokens;
            usedResults.push(result);
        }

        return {
            context: context.trim(),
            sources: usedResults,
            tokenCount,
            query,
        };
    }

    /**
     * Format a chunk for context
     */
    private formatChunkContext(result: SearchResult): string {
        const chunk = result.chunk;
        const score = (result.score * 100).toFixed(1);

        let header = `📄 ${chunk.fileName}`;
        if (chunk.metadata?.section) {
            header += ` > ${chunk.metadata.section}`;
        }
        if (chunk.metadata?.lineStart && chunk.metadata?.lineEnd) {
            header += ` (lines ${chunk.metadata.lineStart}-${chunk.metadata.lineEnd})`;
        }
        header += ` [${score}% match]`;

        return `${header}\n${'─'.repeat(40)}\n${chunk.content}`;
    }

    // =========================================================================
    // Status
    // =========================================================================

    /**
     * Get indexing status for a project
     */
    getIndexingStatus(projectId: string): ProjectIndexStatus | null {
        return this.indexingStatus.get(projectId) || null;
    }

    /**
     * Get index info for a project
     */
    getIndexInfo(projectId: string): {
        exists: boolean;
        chunkCount: number;
        fileCount: number;
        lastUpdated?: string;
    } {
        return this.store.getIndexStatus(projectId);
    }

    /**
     * Check if a file is indexed
     */
    isFileIndexed(projectId: string, fileId: string): boolean {
        const index = this.store.loadIndex(projectId);
        if (!index) return false;
        return index.files.some(f => f.id === fileId);
    }
}

// =============================================================================
// Singleton
// =============================================================================

let _service: ProjectRAGService | null = null;

export function getProjectRAGService(config?: Partial<RAGConfig>, dataDir?: string): ProjectRAGService {
    if (!_service) {
        _service = new ProjectRAGService(config, dataDir);
    }
    return _service;
}

export function createProjectRAGService(config?: Partial<RAGConfig>, dataDir?: string): ProjectRAGService {
    return new ProjectRAGService(config, dataDir);
}
