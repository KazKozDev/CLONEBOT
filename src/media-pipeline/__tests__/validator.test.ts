/**
 * Media Validator Tests
 */

import { MediaValidator } from '../validator';

describe('MediaValidator', () => {
  let validator: MediaValidator;
  
  beforeEach(() => {
    validator = new MediaValidator({
      maxImageSize: 1024 * 1024, // 1MB for testing
      maxAudioSize: 2 * 1024 * 1024, // 2MB
    });
  });
  
  describe('validate', () => {
    it('should accept valid image', async () => {
      const buffer = Buffer.from([0xFF, 0xD8, 0xFF]); // JPEG header
      const result = await validator.validate({
        type: 'buffer',
        data: buffer,
        filename: 'image.jpg',
      });
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
    
    it('should reject empty file', async () => {
      const result = await validator.validate({
        type: 'buffer',
        data: Buffer.alloc(0),
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('EMPTY');
    });
    
    it('should reject too large file', async () => {
      const buffer = Buffer.alloc(2 * 1024 * 1024); // 2MB
      const result = await validator.validate({
        type: 'buffer',
        data: buffer,
        filename: 'image.jpg',
      }, 'image');
      
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('TOO_LARGE');
      expect(result.errors[0].limit).toBe(1024 * 1024);
    });
    
    it('should reject unsupported format', async () => {
      const buffer = Buffer.from([0x00, 0x00]);
      const result = await validator.validate({
        type: 'buffer',
        data: buffer,
        filename: 'file.xyz',
      });
      
      expect(result.valid).toBe(false);
      const formatError = result.errors.find(e => e.code === 'UNSUPPORTED_FORMAT');
      expect(formatError).toBeDefined();
    });
    
    it('should detect corrupted PDF', async () => {
      const buffer = Buffer.from('Not a PDF');
      const result = await validator.validate({
        type: 'buffer',
        data: buffer,
        filename: 'file.pdf',
      }, 'document');
      
      expect(result.valid).toBe(false);
      const corruptError = result.errors.find(e => e.code === 'CORRUPTED');
      expect(corruptError).toBeDefined();
    });
    
    it('should return metadata for valid file', async () => {
      const buffer = Buffer.from([0xFF, 0xD8, 0xFF]);
      const result = await validator.validate({
        type: 'buffer',
        data: buffer,
        filename: 'image.jpg',
      });
      
      expect(result.metadata.size).toBe(buffer.length);
      expect(result.metadata.format).toBe('jpeg');
    });
  });
});
