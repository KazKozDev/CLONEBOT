/**
 * Project RAG Store
 * 
 * Manages persistent storage of RAG indexes per project.
 * Stores chunks, embeddings, and metadata in project folders.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync, statSync } from 'fs';
import * as path from 'path';
import type {
    ProjectRAGIndex,
    TextChunk,
    IndexedFile,
    IndexStats,
    RAGConfig,
    DEFAULT_RAG_CONFIG,
} from './types';
import { generateContentHash } from './chunker';

// =============================================================================
// Constants
// =============================================================================

const INDEX_VERSION = 1;
const INDEX_FILENAME = 'rag-index.json';
const FILES_DIRNAME = 'files';

// =============================================================================
// RAG Store Class
// =============================================================================

export class ProjectRAGStore {
    private dataDir: string;
    private projectsDir: string;

    constructor(dataDir: string = './data') {
        this.dataDir = path.resolve(dataDir);
        this.projectsDir = path.join(this.dataDir, 'projects');
        this.ensureDirectories();
    }

    private ensureDirectories(): void {
        if (!existsSync(this.dataDir)) {
            mkdirSync(this.dataDir, { recursive: true });
        }
        if (!existsSync(this.projectsDir)) {
            mkdirSync(this.projectsDir, { recursive: true });
        }
    }

    /**
     * Get project RAG directory path
     */
    private getProjectDir(projectId: string): string {
        return path.join(this.projectsDir, projectId);
    }

    /**
     * Get project files directory path
     */
    private getFilesDir(projectId: string): string {
        return path.join(this.getProjectDir(projectId), FILES_DIRNAME);
    }

    /**
     * Get index file path
     */
    private getIndexPath(projectId: string): string {
        return path.join(this.getProjectDir(projectId), INDEX_FILENAME);
    }

    /**
     * Ensure project directories exist
     */
    ensureProjectDir(projectId: string): void {
        const projectDir = this.getProjectDir(projectId);
        const filesDir = this.getFilesDir(projectId);

        if (!existsSync(projectDir)) {
            mkdirSync(projectDir, { recursive: true });
        }
        if (!existsSync(filesDir)) {
            mkdirSync(filesDir, { recursive: true });
        }
    }

    // =========================================================================
    // Index Operations
    // =========================================================================

    /**
     * Load project RAG index
     */
    loadIndex(projectId: string): ProjectRAGIndex | null {
        const indexPath = this.getIndexPath(projectId);

        if (!existsSync(indexPath)) {
            return null;
        }

        try {
            const data = readFileSync(indexPath, 'utf-8');
            const index: ProjectRAGIndex = JSON.parse(data);

            // Version check
            if (index.version !== INDEX_VERSION) {
                console.warn(`Index version mismatch for ${projectId}, rebuilding...`);
                return null;
            }

            return index;
        } catch (error) {
            console.error(`Failed to load index for ${projectId}:`, error);
            return null;
        }
    }

    /**
     * Save project RAG index
     */
    saveIndex(index: ProjectRAGIndex): void {
        this.ensureProjectDir(index.projectId);
        const indexPath = this.getIndexPath(index.projectId);

        index.updatedAt = new Date().toISOString();
        index.stats = this.calculateStats(index);

        writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
    }

    /**
     * Create new empty index
     */
    createIndex(projectId: string, embeddingModel: string, dimension: number): ProjectRAGIndex {
        return {
            projectId,
            version: INDEX_VERSION,
            embeddingModel,
            dimension,
            chunks: [],
            embeddings: [],
            files: [],
            updatedAt: new Date().toISOString(),
            stats: {
                totalChunks: 0,
                totalFiles: 0,
                totalTokens: 0,
                avgChunkSize: 0,
            },
        };
    }

    /**
     * Delete project index and files
     */
    deleteIndex(projectId: string): boolean {
        const projectDir = this.getProjectDir(projectId);

        if (!existsSync(projectDir)) {
            return false;
        }

        try {
            // Remove all files recursively
            this.removeDirectoryRecursive(projectDir);
            return true;
        } catch (error) {
            console.error(`Failed to delete index for ${projectId}:`, error);
            return false;
        }
    }

    // =========================================================================
    // File Operations
    // =========================================================================

    /**
     * Save a project file to disk
     */
    saveFile(projectId: string, fileId: string, fileName: string, content: string | Buffer): string {
        this.ensureProjectDir(projectId);
        const filesDir = this.getFilesDir(projectId);

        // Use fileId as prefix to ensure uniqueness
        const safeFileName = `${fileId}_${this.sanitizeFileName(fileName)}`;
        const filePath = path.join(filesDir, safeFileName);

        if (typeof content === 'string') {
            writeFileSync(filePath, content, 'utf-8');
        } else {
            writeFileSync(filePath, content);
        }

        return filePath;
    }

    /**
     * Load a project file from disk
     */
    loadFile(projectId: string, fileId: string, fileName: string): string | null {
        const filesDir = this.getFilesDir(projectId);
        const safeFileName = `${fileId}_${this.sanitizeFileName(fileName)}`;
        const filePath = path.join(filesDir, safeFileName);

        if (!existsSync(filePath)) {
            return null;
        }

        try {
            return readFileSync(filePath, 'utf-8');
        } catch {
            return null;
        }
    }

    /**
     * Delete a project file from disk
     */
    deleteFile(projectId: string, fileId: string, fileName: string): boolean {
        const filesDir = this.getFilesDir(projectId);
        const safeFileName = `${fileId}_${this.sanitizeFileName(fileName)}`;
        const filePath = path.join(filesDir, safeFileName);

        if (!existsSync(filePath)) {
            return false;
        }

        try {
            unlinkSync(filePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * List all files in project
     */
    listFiles(projectId: string): string[] {
        const filesDir = this.getFilesDir(projectId);

        if (!existsSync(filesDir)) {
            return [];
        }

        try {
            return readdirSync(filesDir);
        } catch {
            return [];
        }
    }

    // =========================================================================
    // Chunk Operations
    // =========================================================================

    /**
     * Add chunks and embeddings for a file
     */
    addFileChunks(
        projectId: string,
        file: IndexedFile,
        chunks: TextChunk[],
        embeddings: number[][]
    ): void {
        let index = this.loadIndex(projectId);

        if (!index) {
            // This shouldn't happen, but create index if missing
            index = this.createIndex(projectId, 'nomic-embed-text', 768);
        }

        // Remove existing chunks for this file (if re-indexing)
        const existingFileIndex = index.files.findIndex(f => f.id === file.id);
        if (existingFileIndex !== -1) {
            this.removeFileFromIndex(index, file.id);
        }

        // Add new chunks and embeddings
        index.files.push(file);

        for (let i = 0; i < chunks.length; i++) {
            index.chunks.push(chunks[i]);
            index.embeddings.push(embeddings[i]);
        }

        this.saveIndex(index);
    }

    /**
     * Remove file chunks from index
     */
    removeFileChunks(projectId: string, fileId: string): void {
        const index = this.loadIndex(projectId);
        if (!index) return;

        this.removeFileFromIndex(index, fileId);
        this.saveIndex(index);
    }

    /**
     * Remove file data from index object (in-place)
     */
    private removeFileFromIndex(index: ProjectRAGIndex, fileId: string): void {
        // Find chunk indices to remove
        const indicesToRemove: number[] = [];
        for (let i = 0; i < index.chunks.length; i++) {
            if (index.chunks[i].fileId === fileId) {
                indicesToRemove.push(i);
            }
        }

        // Remove in reverse order to maintain indices
        for (let i = indicesToRemove.length - 1; i >= 0; i--) {
            const idx = indicesToRemove[i];
            index.chunks.splice(idx, 1);
            index.embeddings.splice(idx, 1);
        }

        // Remove file from files list
        index.files = index.files.filter(f => f.id !== fileId);
    }

    // =========================================================================
    // Utilities
    // =========================================================================

    /**
     * Calculate index statistics
     */
    private calculateStats(index: ProjectRAGIndex): IndexStats {
        const totalTokens = index.chunks.reduce((sum, c) => sum + c.tokenCount, 0);

        return {
            totalChunks: index.chunks.length,
            totalFiles: index.files.length,
            totalTokens,
            avgChunkSize: index.chunks.length > 0
                ? Math.round(totalTokens / index.chunks.length)
                : 0,
        };
    }

    /**
     * Sanitize file name for safe storage
     */
    private sanitizeFileName(fileName: string): string {
        return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    }

    /**
     * Remove directory recursively
     */
    private removeDirectoryRecursive(dirPath: string): void {
        if (!existsSync(dirPath)) return;

        const entries = readdirSync(dirPath, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);

            if (entry.isDirectory()) {
                this.removeDirectoryRecursive(fullPath);
            } else {
                unlinkSync(fullPath);
            }
        }

        // Remove the directory itself
        const { rmdirSync } = require('fs');
        rmdirSync(dirPath);
    }

    /**
     * Check if file needs re-indexing
     */
    needsReindex(projectId: string, fileId: string, contentHash: string): boolean {
        const index = this.loadIndex(projectId);
        if (!index) return true;

        const file = index.files.find(f => f.id === fileId);
        if (!file) return true;

        return file.contentHash !== contentHash;
    }

    /**
     * Get project index status
     */
    getIndexStatus(projectId: string): {
        exists: boolean;
        chunkCount: number;
        fileCount: number;
        lastUpdated?: string;
    } {
        const index = this.loadIndex(projectId);

        if (!index) {
            return { exists: false, chunkCount: 0, fileCount: 0 };
        }

        return {
            exists: true,
            chunkCount: index.chunks.length,
            fileCount: index.files.length,
            lastUpdated: index.updatedAt,
        };
    }
}

// =============================================================================
// Singleton
// =============================================================================

let _store: ProjectRAGStore | null = null;

export function getRAGStore(dataDir?: string): ProjectRAGStore {
    if (!_store) {
        _store = new ProjectRAGStore(dataDir);
    }
    return _store;
}
