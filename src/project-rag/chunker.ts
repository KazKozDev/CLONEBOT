/**
 * Text Chunker
 * 
 * Splits documents into chunks for RAG indexing.
 * Supports various file formats with smart splitting.
 */

import { createHash } from 'crypto';
import type { TextChunk, ChunkMetadata, RAGConfig, DEFAULT_RAG_CONFIG } from './types';

// =============================================================================
// Constants
// =============================================================================

/** Approximate characters per token (conservative estimate) */
const CHARS_PER_TOKEN = 4;

/** Code file extensions */
const CODE_EXTENSIONS = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go', '.rs',
    '.c', '.cpp', '.h', '.hpp', '.cs', '.rb', '.php', '.swift',
    '.kt', '.scala', '.sh', '.bash', '.zsh', '.sql', '.r',
]);

/** Markdown-like extensions */
const MARKDOWN_EXTENSIONS = new Set(['.md', '.mdx', '.markdown', '.rst', '.txt']);

// =============================================================================
// Main Chunker Class
// =============================================================================

export class TextChunker {
    private config: Pick<typeof DEFAULT_RAG_CONFIG, 'chunkSize' | 'chunkOverlap'>;

    constructor(config?: Partial<Pick<typeof DEFAULT_RAG_CONFIG, 'chunkSize' | 'chunkOverlap'>>) {
        this.config = {
            chunkSize: config?.chunkSize ?? 500,
            chunkOverlap: config?.chunkOverlap ?? 50,
        };
    }

    /**
     * Chunk a document into smaller pieces
     */
    chunkDocument(
        fileId: string,
        fileName: string,
        content: string
    ): TextChunk[] {
        if (!content || content.trim().length === 0) {
            return [];
        }

        const extension = this.getExtension(fileName);

        // Choose chunking strategy based on file type
        if (CODE_EXTENSIONS.has(extension)) {
            return this.chunkCode(fileId, fileName, content, extension);
        } else if (MARKDOWN_EXTENSIONS.has(extension)) {
            return this.chunkMarkdown(fileId, fileName, content);
        } else {
            return this.chunkPlainText(fileId, fileName, content);
        }
    }

    /**
     * Chunk code files - respect function/class boundaries
     */
    private chunkCode(
        fileId: string,
        fileName: string,
        content: string,
        extension: string
    ): TextChunk[] {
        const chunks: TextChunk[] = [];
        const lines = content.split('\n');

        let currentChunk = '';
        let chunkStartOffset = 0;
        let chunkStartLine = 1;
        let currentOffset = 0;
        let currentLine = 1;

        const targetChars = this.config.chunkSize * CHARS_PER_TOKEN;
        const overlapChars = this.config.chunkOverlap * CHARS_PER_TOKEN;

        for (const line of lines) {
            const lineWithNewline = line + '\n';

            // Check if adding this line would exceed limit
            if (currentChunk.length + lineWithNewline.length > targetChars && currentChunk.length > 0) {
                // Save current chunk
                chunks.push(this.createChunk(
                    fileId,
                    fileName,
                    currentChunk,
                    chunkStartOffset,
                    currentOffset,
                    chunks.length,
                    {
                        language: extension.slice(1),
                        lineStart: chunkStartLine,
                        lineEnd: currentLine - 1,
                    }
                ));

                // Start new chunk with overlap
                const overlapText = this.getOverlapText(currentChunk, overlapChars);
                currentChunk = overlapText + lineWithNewline;
                chunkStartOffset = currentOffset - overlapText.length;
                chunkStartLine = Math.max(1, currentLine - this.countLines(overlapText));
            } else {
                currentChunk += lineWithNewline;
            }

            currentOffset += lineWithNewline.length;
            currentLine++;
        }

        // Don't forget the last chunk
        if (currentChunk.trim().length > 0) {
            chunks.push(this.createChunk(
                fileId,
                fileName,
                currentChunk,
                chunkStartOffset,
                currentOffset,
                chunks.length,
                {
                    language: extension.slice(1),
                    lineStart: chunkStartLine,
                    lineEnd: currentLine - 1,
                }
            ));
        }

        // Update total chunks
        for (const chunk of chunks) {
            chunk.totalChunks = chunks.length;
        }

        return chunks;
    }

    /**
     * Chunk markdown - respect heading boundaries
     */
    private chunkMarkdown(
        fileId: string,
        fileName: string,
        content: string
    ): TextChunk[] {
        const chunks: TextChunk[] = [];

        // Split by headings
        const sections = this.splitByHeadings(content);

        for (const section of sections) {
            // If section is small enough, use as-is
            if (this.estimateTokens(section.content) <= this.config.chunkSize) {
                if (section.content.trim().length > 0) {
                    chunks.push(this.createChunk(
                        fileId,
                        fileName,
                        section.content,
                        section.startOffset,
                        section.endOffset,
                        chunks.length,
                        { section: section.heading }
                    ));
                }
            } else {
                // Split large sections by paragraphs
                const subChunks = this.chunkPlainText(
                    fileId,
                    fileName,
                    section.content,
                    section.startOffset,
                    section.heading
                );
                chunks.push(...subChunks);
            }
        }

        // Update chunk indices
        chunks.forEach((chunk, i) => {
            chunk.chunkIndex = i;
            chunk.totalChunks = chunks.length;
        });

        return chunks;
    }

    /**
     * Chunk plain text - split by paragraphs then sentences
     */
    private chunkPlainText(
        fileId: string,
        fileName: string,
        content: string,
        baseOffset: number = 0,
        section?: string
    ): TextChunk[] {
        const chunks: TextChunk[] = [];
        const paragraphs = content.split(/\n\s*\n/);

        let currentChunk = '';
        let chunkStartOffset = baseOffset;
        let currentOffset = baseOffset;

        const targetChars = this.config.chunkSize * CHARS_PER_TOKEN;
        const overlapChars = this.config.chunkOverlap * CHARS_PER_TOKEN;

        for (const paragraph of paragraphs) {
            const paragraphWithSep = paragraph + '\n\n';

            if (currentChunk.length + paragraphWithSep.length > targetChars && currentChunk.length > 0) {
                // Save current chunk
                chunks.push(this.createChunk(
                    fileId,
                    fileName,
                    currentChunk.trim(),
                    chunkStartOffset,
                    currentOffset,
                    chunks.length,
                    section ? { section } : undefined
                ));

                // Start new chunk with overlap
                const overlapText = this.getOverlapText(currentChunk, overlapChars);
                currentChunk = overlapText + paragraphWithSep;
                chunkStartOffset = currentOffset - overlapText.length;
            } else {
                currentChunk += paragraphWithSep;
            }

            currentOffset += paragraphWithSep.length;
        }

        // Last chunk
        if (currentChunk.trim().length > 0) {
            chunks.push(this.createChunk(
                fileId,
                fileName,
                currentChunk.trim(),
                chunkStartOffset,
                currentOffset,
                chunks.length,
                section ? { section } : undefined
            ));
        }

        return chunks;
    }

    /**
     * Create a chunk object
     */
    private createChunk(
        fileId: string,
        fileName: string,
        content: string,
        startOffset: number,
        endOffset: number,
        index: number,
        metadata?: ChunkMetadata
    ): TextChunk {
        return {
            id: this.generateChunkId(fileId, index),
            fileId,
            fileName,
            content,
            startOffset,
            endOffset,
            chunkIndex: index,
            totalChunks: 0, // Will be updated after all chunks are created
            tokenCount: this.estimateTokens(content),
            metadata,
        };
    }

    /**
     * Split markdown by headings
     */
    private splitByHeadings(content: string): Array<{
        heading?: string;
        content: string;
        startOffset: number;
        endOffset: number;
    }> {
        const sections: Array<{
            heading?: string;
            content: string;
            startOffset: number;
            endOffset: number;
        }> = [];

        // Match headings (# to ######)
        const headingRegex = /^(#{1,6})\s+(.+)$/gm;
        let lastIndex = 0;
        let lastHeading: string | undefined;
        let match;

        while ((match = headingRegex.exec(content)) !== null) {
            // Save previous section
            if (match.index > lastIndex) {
                sections.push({
                    heading: lastHeading,
                    content: content.slice(lastIndex, match.index),
                    startOffset: lastIndex,
                    endOffset: match.index,
                });
            }

            lastIndex = match.index;
            lastHeading = match[2];
        }

        // Save last section
        if (lastIndex < content.length) {
            sections.push({
                heading: lastHeading,
                content: content.slice(lastIndex),
                startOffset: lastIndex,
                endOffset: content.length,
            });
        }

        return sections;
    }

    /**
     * Get overlap text from the end of a chunk
     */
    private getOverlapText(text: string, maxChars: number): string {
        if (text.length <= maxChars) {
            return text;
        }

        // Try to break at word boundary
        const slice = text.slice(-maxChars);
        const wordBreak = slice.indexOf(' ');

        if (wordBreak > 0 && wordBreak < maxChars / 2) {
            return slice.slice(wordBreak + 1);
        }

        return slice;
    }

    /**
     * Estimate token count from character count
     */
    private estimateTokens(text: string): number {
        return Math.ceil(text.length / CHARS_PER_TOKEN);
    }

    /**
     * Count lines in text
     */
    private countLines(text: string): number {
        return (text.match(/\n/g) || []).length + 1;
    }

    /**
     * Get file extension (lowercase with dot)
     */
    private getExtension(fileName: string): string {
        const lastDot = fileName.lastIndexOf('.');
        if (lastDot === -1) return '';
        return fileName.slice(lastDot).toLowerCase();
    }

    /**
     * Generate unique chunk ID
     */
    private generateChunkId(fileId: string, index: number): string {
        const hash = createHash('md5')
            .update(`${fileId}:${index}:${Date.now()}`)
            .digest('hex')
            .slice(0, 8);
        return `chunk_${hash}`;
    }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Generate content hash for change detection
 */
export function generateContentHash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
}

/**
 * Estimate tokens in text
 */
export function estimateTokenCount(text: string): number {
    return Math.ceil(text.length / CHARS_PER_TOKEN);
}
