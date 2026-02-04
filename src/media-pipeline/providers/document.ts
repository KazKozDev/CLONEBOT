/**
 * Document Extractors
 * 
 * Extract text from various document formats:
 * - PDF
 * - DOCX
 * - TXT/MD
 * - HTML
 * - CSV/XLSX
 */

import { BaseProvider } from './base';
import { ProcessingOptions, ProviderResult } from '../types';

// ============================================================================
// Document Provider
// ============================================================================

export class DocumentProvider extends BaseProvider {
  constructor() {
    super('builtin-document', 'document');
  }
  
  get supportedFormats(): string[] {
    return ['pdf', 'docx', 'txt', 'md', 'markdown', 'html', 'htm', 'csv', 'xlsx'];
  }
  
  get maxFileSize(): number {
    return 50 * 1024 * 1024; // 50MB
  }
  
  get maxDuration(): number | undefined {
    return undefined;
  }
  
  get features(): string[] {
    return ['text-extraction', 'metadata', 'tables'];
  }
  
  protected async doProcess(
    buffer: Buffer,
    options: ProcessingOptions
  ): Promise<any> {
    const format = this.detectFormat(buffer, options);
    
    switch (format) {
      case 'pdf':
        return await this.extractPDF(buffer);
      case 'docx':
        return await this.extractDOCX(buffer);
      case 'txt':
      case 'md':
      case 'markdown':
        return await this.extractText(buffer);
      case 'html':
      case 'htm':
        return await this.extractHTML(buffer);
      case 'csv':
        return await this.extractCSV(buffer);
      case 'xlsx':
        return await this.extractXLSX(buffer);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }
  
  /**
   * Detect document format
   */
  private detectFormat(buffer: Buffer, options: ProcessingOptions): string {
    // Use filename if available
    if (options.filename) {
      const ext = options.filename.split('.').pop()?.toLowerCase();
      if (ext) return ext;
    }
    
    // Use MIME type
    if (options.mimeType) {
      if (options.mimeType.includes('pdf')) return 'pdf';
      if (options.mimeType.includes('word')) return 'docx';
      if (options.mimeType.includes('html')) return 'html';
      if (options.mimeType.includes('csv')) return 'csv';
      if (options.mimeType.includes('spreadsheet')) return 'xlsx';
    }
    
    return 'txt';
  }
  
  /**
   * Extract text from PDF
   */
  private async extractPDF(buffer: Buffer): Promise<any> {
    try {
      // Try pdf-parse
      const pdfParse = await import('pdf-parse');
      const data = await pdfParse.default(buffer);
      
      return {
        text: data.text,
        pages: data.numpages,
        metadata: data.info,
      };
    } catch (error) {
      throw new Error(`PDF extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Extract text from DOCX
   */
  private async extractDOCX(buffer: Buffer): Promise<any> {
    try {
      // Try mammoth
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      
      return {
        text: result.value,
        messages: result.messages,
      };
    } catch (error) {
      throw new Error(`DOCX extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Extract plain text
   */
  private async extractText(buffer: Buffer): Promise<any> {
    return {
      text: buffer.toString('utf-8'),
    };
  }
  
  /**
   * Extract text from HTML
   */
  private async extractHTML(buffer: Buffer): Promise<any> {
    try {
      const cheerio = await import('cheerio');
      const $ = cheerio.load(buffer.toString('utf-8'));
      
      // Remove script and style tags
      $('script, style').remove();
      
      // Get text
      const text = $('body').text().trim();
      
      return {
        text,
        title: $('title').text(),
      };
    } catch (error) {
      // Fallback to plain text
      return {
        text: buffer.toString('utf-8'),
      };
    }
  }
  
  /**
   * Extract data from CSV
   */
  private async extractCSV(buffer: Buffer): Promise<any> {
    const text = buffer.toString('utf-8');
    const lines = text.split('\n').filter(line => line.trim());
    
    if (lines.length === 0) {
      return { text: '', rows: [] };
    }
    
    // Parse CSV (simple implementation)
    const rows = lines.map(line => {
      // Simple CSV parsing (doesn't handle quoted commas)
      return line.split(',').map(cell => cell.trim());
    });
    
    return {
      text: text,
      rows,
      headers: rows[0],
    };
  }
  
  /**
   * Extract data from XLSX
   */
  private async extractXLSX(buffer: Buffer): Promise<any> {
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      
      let text = '';
      const tables: any[] = [];
      
      // Process each sheet
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        
        tables.push({
          sheet: sheetName,
          rows: data,
        });
        
        // Convert to text
        const sheetText = XLSX.utils.sheet_to_csv(sheet);
        text += `\n=== ${sheetName} ===\n${sheetText}\n`;
      }
      
      return {
        text: text.trim(),
        tables,
      };
    } catch (error) {
      throw new Error(`XLSX extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  protected formatResult(raw: any, processingTime: number): ProviderResult {
    return {
      success: true,
      type: 'document',
      content: raw.text || '',
      data: {
        text: raw.text || '',
        pages: raw.pages,
        tables: raw.tables,
        metadata: raw.metadata,
      },
      metadata: {
        provider: this.name,
        processingTime,
        cached: false,
        originalSize: 0,
        truncated: false,
      },
    };
  }
}
