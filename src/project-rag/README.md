# Project RAG Module

Semantic search for project files using Ollama embeddings.

## Install

```bash
# Ensure nomic-embed-text model is available
ollama pull nomic-embed-text
```

## Usage

```typescript
import { getProjectRAGService } from './project-rag';

const ragService = getProjectRAGService();

// Index a file
await ragService.indexFile(projectId, fileId, 'doc.md', content);

// Search
const results = await ragService.search(projectId, 'how to configure?', { topK: 5 });

// Get context for LLM
const context = await ragService.getContext(projectId, userQuery);
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/rag/status` | Check RAG availability |
| GET | `/api/projects/:id/rag/status` | Get project index status |
| POST | `/api/projects/:id/rag/search` | Semantic search |
| POST | `/api/projects/:id/rag/reindex` | Reindex all files |

### Search Request

```json
{
  "query": "how to configure authentication?",
  "topK": 5,
  "minScore": 0.3
}
```

### Search Response

```json
{
  "results": [
    {
      "chunk": {
        "id": "chunk_abc123",
        "fileName": "auth.md",
        "content": "...",
        "metadata": { "section": "Configuration" }
      },
      "score": 0.85,
      "rank": 1
    }
  ],
  "query": "...",
  "totalResults": 3
}
```

## Architecture

```
data/projects/{projectId}/
├── files/           # Original uploaded files
├── rag-index.json   # Chunks + embeddings + metadata
```

## Config

| Option | Default | Description |
|--------|---------|-------------|
| ollamaUrl | http://localhost:11434 | Ollama API URL |
| embeddingModel | nomic-embed-text | Model for embeddings |
| chunkSize | 500 tokens | Target chunk size |
| chunkOverlap | 50 tokens | Overlap between chunks |
| defaultTopK | 5 | Default search results |
| maxContextTokens | 4000 | Max context for LLM |

## How It Works

1. **Upload file** → Chunked into 500-token pieces with overlap
2. **Generate embeddings** → Each chunk embedded via Ollama
3. **Store index** → Vectors saved in project folder
4. **Query** → User query embedded, cosine similarity search
5. **Context** → Top chunks formatted and added to LLM prompt
