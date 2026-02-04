/**
 * Media Pipeline Usage Example
 * 
 * Demonstrates how to use the Media Pipeline system
 */

import { MediaPipeline } from './MediaPipeline';
import { AudioData, ImageData, DocumentData } from './types';
import { promises as fs } from 'fs';

async function example() {
  // ============================================================================
  // 1. Initialize Pipeline
  // ============================================================================
  
  const pipeline = new MediaPipeline({
    providers: {
      openai: {
        apiKey: process.env.OPENAI_API_KEY,
      },
      groq: {
        apiKey: process.env.GROQ_API_KEY,
      },
      anthropic: {
        apiKey: process.env.ANTHROPIC_API_KEY,
      },
    },
    
    // Provider priorities
    priorities: {
      audio: ['openai', 'groq', 'cli'],  // Try OpenAI first, then Groq, then local CLI
      image: ['openai', 'anthropic'],     // Try OpenAI first, then Anthropic
      video: [],
      document: ['builtin'],
    },
    
    // Enable cache
    cache: {
      enabled: true,
      maxSize: 500 * 1024 * 1024, // 500MB
      ttl: 86400000,               // 24 hours
      persistent: false,           // In-memory cache
    },
  });
  
  // ============================================================================
  // 2. Audio Transcription
  // ============================================================================
  
  console.log('\n=== Audio Transcription ===\n');
  
  // From file
  const audioResult = await pipeline.transcribe({
    type: 'path',
    path: './examples/audio.mp3',
  }, {
    language: 'en',              // Optional: force language
    includeTimestamps: true,      // Include timestamps
    onProgress: (progress) => {
      console.log(`${progress.stage}: ${progress.percent}%`);
    },
  });
  
  if (audioResult.success && audioResult.type === 'audio') {
    const audioData = audioResult.data as AudioData;
    console.log('Transcript:', audioData.transcript);
    console.log('Duration:', audioData.duration, 'seconds');
    console.log('Language:', audioData.language);
    
    // Segments with timestamps
    if (audioData.segments) {
      console.log('\nSegments:');
      for (const segment of audioData.segments.slice(0, 3)) {
        console.log(`[${segment.start}s - ${segment.end}s]: ${segment.text}`);
      }
    }
  } else {
    console.error('Error:', audioResult.error?.message);
  }
  
  // ============================================================================
  // 3. Image Understanding
  // ============================================================================
  
  console.log('\n=== Image Understanding ===\n');
  
  // Full analysis (description + OCR)
  const imageResult = await pipeline.describeImage({
    type: 'path',
    path: './examples/screenshot.png',
  }, {
    mode: 'full',  // 'full' | 'summary' | 'ocr'
  });
  
  if (imageResult.success && imageResult.type === 'image') {
    const imageData = imageResult.data as ImageData;
    if (imageData.description) {
      console.log('Description:', imageData.description);
    }
    
    if (imageData.ocrText) {
      console.log('\nExtracted Text:', imageData.ocrText);
    }
  }
  
  // OCR only
  const ocrResult = await pipeline.process({
    type: 'path',
    path: './examples/document-scan.jpg',
  }, {
    type: 'image',
    mode: 'ocr',  // Extract text only
  });
  
  if (ocrResult.success && ocrResult.type === 'image') {
    const imageData = ocrResult.data as ImageData;
    if (imageData.ocrText) {
      console.log('OCR Text:', imageData.ocrText);
    }
  }
  
  // ============================================================================
  // 4. Document Text Extraction
  // ============================================================================
  
  console.log('\n=== Document Extraction ===\n');
  
  // PDF
  const pdfResult = await pipeline.extractText({
    type: 'path',
    path: './examples/document.pdf',
  });
  
  if (pdfResult.success && pdfResult.type === 'document') {
    const docData = pdfResult.data as DocumentData;
    console.log('Text length:', docData.text?.length);
    console.log('Pages:', docData.pages);
    console.log('Preview:', docData.text?.slice(0, 200) + '...');
  }
  
  // DOCX
  const docxResult = await pipeline.extractText({
    type: 'path',
    path: './examples/document.docx',
  });
  
  // Excel
  const xlsxResult = await pipeline.extractText({
    type: 'path',
    path: './examples/spreadsheet.xlsx',
  });
  
  if (xlsxResult.success && xlsxResult.type === 'document') {
    const docData = xlsxResult.data as DocumentData;
    if (docData.tables) {
      console.log('Tables:', docData.tables.length);
      
      // First table
      const table = docData.tables[0];
      if (table) {
        console.log('Rows:', table.rows?.length);
      }
    }
  }
  
  // ============================================================================
  // 5. From Buffer
  // ============================================================================
  
  console.log('\n=== From Buffer ===\n');
  
  const buffer = await fs.readFile('./examples/audio.mp3');
  
  const bufferResult = await pipeline.transcribe({
    type: 'buffer',
    data: buffer,
    filename: 'audio.mp3',  // Hint for type detection
  });
  
  console.log('From buffer:', bufferResult.success ? 'Success' : 'Failed');
  
  // ============================================================================
  // 6. From URL
  // ============================================================================
  
  console.log('\n=== From URL ===\n');
  
  const urlResult = await pipeline.describeImage({
    type: 'url',
    url: 'https://example.com/image.jpg',
  });
  
  console.log('From URL:', urlResult.success ? 'Success' : 'Failed');
  
  // ============================================================================
  // 7. Type Detection
  // ============================================================================
  
  console.log('\n=== Type Detection ===\n');
  
  const typeInfo = pipeline.detectType({
    type: 'buffer',
    data: buffer,
    filename: 'unknown.bin',
  });
  
  console.log('Category:', typeInfo.category);
  console.log('Format:', typeInfo.format);
  console.log('MIME type:', typeInfo.mimeType);
  console.log('Confidence:', typeInfo.confidence);
  
  // ============================================================================
  // 8. Validation
  // ============================================================================
  
  console.log('\n=== Validation ===\n');
  
  const validation = await pipeline.validate({
    type: 'buffer',
    data: buffer,
  }, 'audio');
  
  console.log('Valid:', validation.valid);
  console.log('Size:', validation.metadata.size, 'bytes');
  console.log('Format:', validation.metadata.format);
  
  if (!validation.valid) {
    console.log('Errors:');
    for (const error of validation.errors) {
      console.log(`- ${error.code}: ${error.message}`);
    }
  }
  
  if (validation.warnings.length > 0) {
    console.log('Warnings:');
    for (const warning of validation.warnings) {
      console.log(`- ${warning.message}`);
    }
  }
  
  // ============================================================================
  // 9. Cache Management
  // ============================================================================
  
  console.log('\n=== Cache ===\n');
  
  // First call - processes the file
  const firstCall = await pipeline.transcribe({
    type: 'buffer',
    data: buffer,
  });
  console.log('First call cached:', firstCall.metadata.cached); // false
  
  // Second call - from cache
  const secondCall = await pipeline.transcribe({
    type: 'buffer',
    data: buffer,
  });
  console.log('Second call cached:', secondCall.metadata.cached); // true
  
  // Cache stats
  const stats = pipeline.getCacheStats();
  console.log('Cache stats:');
  console.log('- Size:', stats.size, 'bytes');
  console.log('- Hits:', stats.hits);
  console.log('- Misses:', stats.misses);
  console.log('- Evictions:', stats.evictions);
  
  // Clear cache
  pipeline.clearCache();
  console.log('Cache cleared');
  
  // ============================================================================
  // 10. Provider Information
  // ============================================================================
  
  console.log('\n=== Providers ===\n');
  
  const audioProviders = pipeline.getProviders('audio');
  console.log('Audio providers:');
  for (const provider of audioProviders) {
    console.log(`- ${provider.name}`);
    console.log(`  Enabled: ${provider.enabled}`);
    console.log(`  Formats: ${provider.supportedFormats.join(', ')}`);
    console.log(`  Max size: ${provider.limits.maxFileSize / 1024 / 1024}MB`);
    console.log(`  Features: ${provider.features.join(', ')}`);
  }
  
  const imageProviders = pipeline.getProviders('image');
  console.log('\nImage providers:');
  for (const provider of imageProviders) {
    console.log(`- ${provider.name}: ${provider.enabled ? 'enabled' : 'disabled'}`);
  }
  
  // ============================================================================
  // 11. Error Handling
  // ============================================================================
  
  console.log('\n=== Error Handling ===\n');
  
  // Too large file
  const largeBuffer = Buffer.alloc(100 * 1024 * 1024); // 100MB
  const largeResult = await pipeline.transcribe({
    type: 'buffer',
    data: largeBuffer,
  });
  
  if (!largeResult.success) {
    console.log('Error code:', largeResult.error?.code);
    console.log('Error message:', largeResult.error?.message);
    console.log('Retryable:', largeResult.error?.retryable);
  }
  
  // Unknown format
  const unknownResult = await pipeline.process({
    type: 'buffer',
    data: Buffer.from('not a valid file'),
    filename: 'unknown.xyz',
  });
  
  if (!unknownResult.success) {
    console.log('Error:', unknownResult.error?.message);
  }
}

// Run example
if (require.main === module) {
  example().catch(console.error);
}

export { example };
