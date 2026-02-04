/**
 * Media Type Detector Tests
 */

import { MediaTypeDetector } from '../detector';

describe('MediaTypeDetector', () => {
  let detector: MediaTypeDetector;
  
  beforeEach(() => {
    detector = new MediaTypeDetector();
  });
  
  describe('detectFromBuffer', () => {
    it('should detect JPEG from magic bytes', () => {
      const buffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
      const result = detector.detectFromBuffer(buffer);
      
      expect(result.category).toBe('image');
      expect(result.format).toBe('jpeg');
      expect(result.confidence).toBeGreaterThan(0.9);
    });
    
    it('should detect PNG from magic bytes', () => {
      const buffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A]);
      const result = detector.detectFromBuffer(buffer);
      
      expect(result.category).toBe('image');
      expect(result.format).toBe('png');
      expect(result.confidence).toBeGreaterThan(0.9);
    });
    
    it('should detect PDF from magic bytes', () => {
      const buffer = Buffer.from('%PDF-1.4\n');
      const result = detector.detectFromBuffer(buffer);
      
      expect(result.category).toBe('document');
      expect(result.format).toBe('pdf');
    });
    
    it('should detect MP3 from ID3 tag', () => {
      const buffer = Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00]);
      const result = detector.detectFromBuffer(buffer);
      
      expect(result.category).toBe('audio');
      expect(result.format).toBe('mp3');
    });
    
    it('should return unknown for unrecognized format', () => {
      const buffer = Buffer.from([0x00, 0x00, 0x00, 0x00]);
      const result = detector.detectFromBuffer(buffer);
      
      expect(result.category).toBe('unknown');
      expect(result.confidence).toBe(0);
    });
  });
  
  describe('detectFromPath', () => {
    it('should detect from .jpg extension', () => {
      const result = detector.detectFromPath('image.jpg');
      
      expect(result.category).toBe('image');
      expect(result.format).toBe('jpeg');
    });
    
    it('should detect from .mp3 extension', () => {
      const result = detector.detectFromPath('/path/to/audio.mp3');
      
      expect(result.category).toBe('audio');
      expect(result.format).toBe('mp3');
    });
    
    it('should detect from .pdf extension', () => {
      const result = detector.detectFromPath('document.pdf');
      
      expect(result.category).toBe('document');
      expect(result.format).toBe('pdf');
    });
    
    it('should be case insensitive', () => {
      const result = detector.detectFromPath('IMAGE.PNG');
      
      expect(result.category).toBe('image');
      expect(result.format).toBe('png');
    });
    
    it('should return unknown for unsupported extension', () => {
      const result = detector.detectFromPath('file.xyz');
      
      expect(result.category).toBe('unknown');
    });
  });
  
  describe('detectFromMimeType', () => {
    it('should detect from image MIME type', () => {
      const result = detector.detectFromMimeType('image/jpeg');
      
      expect(result.category).toBe('image');
      expect(result.format).toBe('jpeg');
    });
    
    it('should detect from audio MIME type', () => {
      const result = detector.detectFromMimeType('audio/mpeg');
      
      expect(result.category).toBe('audio');
      expect(result.format).toBe('mp3');
    });
    
    it('should detect category from prefix', () => {
      const result = detector.detectFromMimeType('image/unknown-format');
      
      expect(result.category).toBe('image');
    });
    
    it('should return unknown for unrecognized MIME', () => {
      const result = detector.detectFromMimeType('application/octet-stream');
      
      expect(result.category).toBe('unknown');
    });
  });
  
  describe('detect (combined)', () => {
    it('should prefer magic bytes over extension', () => {
      const buffer = Buffer.from([0x89, 0x50, 0x4E, 0x47]); // PNG
      const result = detector.detect({
        type: 'buffer',
        data: buffer,
        filename: 'file.jpg', // Wrong extension
      });
      
      expect(result.format).toBe('png'); // Should detect PNG from magic bytes
    });
    
    it('should use extension when magic bytes fail', () => {
      const buffer = Buffer.from([0x00, 0x00]); // Unknown
      const result = detector.detect({
        type: 'buffer',
        data: buffer,
        filename: 'audio.mp3',
      });
      
      expect(result.format).toBe('mp3');
    });
  });
});
