/**
 * CLI Audio Provider
 * 
 * Uses local CLI tools for audio transcription as fallback:
 * - whisper-cli
 * - whisper.cpp
 * - sherpa-onnx
 */

import { BaseProvider } from './base';
import { ProcessingOptions, ProviderResult } from '../types';
import { exec } from 'child_process';
import { promisify } from 'util';
import { tmpdir } from 'os';
import { join } from 'path';
import { promises as fs } from 'fs';
import { randomBytes } from 'crypto';

const execAsync = promisify(exec);

// ============================================================================
// CLI Tools
// ============================================================================

type CLITool = 'whisper' | 'whisper.cpp' | 'sherpa-onnx' | 'none';

// ============================================================================
// CLI Audio Provider
// ============================================================================

export class CLIAudioProvider extends BaseProvider {
  private availableTool: CLITool = 'none';
  private toolPath?: string;
  
  constructor() {
    super('cli-whisper', 'audio');
  }
  
  get supportedFormats(): string[] {
    return ['mp3', 'wav', 'm4a', 'ogg', 'flac', 'webm'];
  }
  
  get maxFileSize(): number {
    return 100 * 1024 * 1024; // 100MB for local processing
  }
  
  get maxDuration(): number | undefined {
    return undefined; // No limit for local
  }
  
  get features(): string[] {
    return ['transcription', 'local', 'offline'];
  }
  
  protected async onInitialize(config: any): Promise<void> {
    // Try to find available CLI tool
    this.availableTool = await this.findAvailableCLI();
    
    if (this.availableTool !== 'none') {
      // Find tool path
      this.toolPath = await this.findToolPath(this.availableTool);
    }
  }
  
  isAvailable(): boolean {
    return this.initialized && this.availableTool !== 'none';
  }
  
  protected hasCredentials(): boolean {
    return true; // No credentials needed for local
  }
  
  /**
   * Find available CLI tool
   */
  private async findAvailableCLI(): Promise<CLITool> {
    // Try whisper (OpenAI's official CLI)
    if (await this.checkCommand('whisper --version')) {
      return 'whisper';
    }
    
    // Try whisper.cpp
    if (await this.checkCommand('whisper --help')) {
      return 'whisper.cpp';
    }
    
    // Try sherpa-onnx
    if (await this.checkCommand('sherpa-onnx --help')) {
      return 'sherpa-onnx';
    }
    
    return 'none';
  }
  
  /**
   * Find tool path
   */
  private async findToolPath(tool: CLITool): Promise<string | undefined> {
    try {
      const { stdout } = await execAsync(`which ${tool === 'whisper.cpp' ? 'whisper' : tool}`);
      return stdout.trim();
    } catch {
      return undefined;
    }
  }
  
  /**
   * Check if command is available
   */
  private async checkCommand(command: string): Promise<boolean> {
    try {
      await execAsync(command, { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
  
  protected async doProcess(
    buffer: Buffer,
    options: ProcessingOptions
  ): Promise<any> {
    if (this.availableTool === 'none') {
      throw new Error('No CLI tool available');
    }
    
    // Write buffer to temp file
    const tempInput = await this.writeTempFile(buffer);
    const tempOutput = this.getTempOutputPath();
    
    try {
      // Run transcription
      const output = await this.runTranscription(tempInput, tempOutput, options);
      
      // Parse output
      return this.parseOutput(output, this.availableTool);
      
    } finally {
      // Cleanup
      await this.cleanupFile(tempInput);
      await this.cleanupFile(tempOutput);
      await this.cleanupFile(tempOutput + '.txt');
      await this.cleanupFile(tempOutput + '.json');
      await this.cleanupFile(tempOutput + '.srt');
    }
  }
  
  /**
   * Run transcription using available tool
   */
  private async runTranscription(
    inputPath: string,
    outputPath: string,
    options: ProcessingOptions
  ): Promise<string> {
    let command: string;
    
    switch (this.availableTool) {
      case 'whisper':
        command = this.buildWhisperCommand(inputPath, outputPath, options);
        break;
      
      case 'whisper.cpp':
        command = this.buildWhisperCppCommand(inputPath, outputPath, options);
        break;
      
      case 'sherpa-onnx':
        command = this.buildSherpaCommand(inputPath, outputPath, options);
        break;
      
      default:
        throw new Error('No tool available');
    }
    
    const { stdout, stderr } = await execAsync(command, {
      timeout: 600000, // 10 minutes
      maxBuffer: 10 * 1024 * 1024,
    });
    
    return stdout + stderr;
  }
  
  /**
   * Build whisper command
   */
  private buildWhisperCommand(
    inputPath: string,
    outputPath: string,
    options: ProcessingOptions
  ): string {
    let cmd = `whisper "${inputPath}"`;
    cmd += ` --model base`; // Use base model for speed
    cmd += ` --output_dir "${tmpdir()}"`;
    cmd += ` --output_format json`;
    
    if (options.language) {
      cmd += ` --language ${options.language}`;
    }
    
    return cmd;
  }
  
  /**
   * Build whisper.cpp command
   */
  private buildWhisperCppCommand(
    inputPath: string,
    outputPath: string,
    options: ProcessingOptions
  ): string {
    let cmd = `whisper -f "${inputPath}"`;
    cmd += ` -m base.en`; // Model
    cmd += ` -oj`; // JSON output
    
    if (options.language) {
      cmd += ` -l ${options.language}`;
    }
    
    return cmd;
  }
  
  /**
   * Build sherpa-onnx command
   */
  private buildSherpaCommand(
    inputPath: string,
    outputPath: string,
    options: ProcessingOptions
  ): string {
    return `sherpa-onnx "${inputPath}"`;
  }
  
  /**
   * Parse tool output
   */
  private parseOutput(output: string, tool: CLITool): any {
    try {
      // Try to parse as JSON
      const json = JSON.parse(output);
      return json;
    } catch {
      // Plain text output
      return {
        text: output.trim(),
        segments: [{
          start: 0,
          end: 0,
          text: output.trim(),
        }],
      };
    }
  }
  
  protected formatResult(raw: any, processingTime: number): ProviderResult {
    return {
      success: true,
      type: 'audio',
      content: raw.text || raw.transcript || '',
      data: {
        transcript: raw.text || raw.transcript || '',
        segments: raw.segments || [],
      },
      metadata: {
        provider: this.name,
        model: this.availableTool,
        processingTime,
        cached: false,
        originalSize: 0,
        truncated: false,
      },
    };
  }
  
  /**
   * Write buffer to temp file
   */
  private async writeTempFile(buffer: Buffer): Promise<string> {
    const filename = `audio_${randomBytes(8).toString('hex')}.mp3`;
    const filepath = join(tmpdir(), filename);
    await fs.writeFile(filepath, buffer);
    return filepath;
  }
  
  /**
   * Get temp output path
   */
  private getTempOutputPath(): string {
    return join(tmpdir(), `transcription_${randomBytes(8).toString('hex')}`);
  }
  
  /**
   * Cleanup file
   */
  private async cleanupFile(filepath: string): Promise<void> {
    try {
      await fs.unlink(filepath);
    } catch {
      // Ignore errors
    }
  }
}
