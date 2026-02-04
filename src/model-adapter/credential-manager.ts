/**
 * Credential Manager
 * Manage API keys and credentials for all providers
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface Credentials {
  anthropic?: {
    apiKey?: string;
  };
  openai?: {
    apiKey?: string;
    organization?: string;
  };
  google?: {
    apiKey?: string;
  };
  ollama?: {
    baseUrl?: string;
  };
  llamacpp?: {
    baseUrl?: string;
  };
}

export interface CredentialSource {
  type: 'env' | 'file' | 'programmatic';
  provider: string;
  key: string;
  value: string;
}

// ============================================================================
// Credential Manager
// ============================================================================

export class CredentialManager {
  private credentials: Credentials = {};
  private sources: CredentialSource[] = [];

  /**
   * Load credentials from all sources
   */
  async load(options: {
    envPrefix?: string;
    configFile?: string;
    programmatic?: Credentials;
  } = {}): Promise<void> {
    const { envPrefix = 'CLONEBOT', configFile, programmatic } = options;

    // 1. Load from environment variables
    this.loadFromEnv(envPrefix);

    // 2. Load from file (if specified)
    if (configFile) {
      await this.loadFromFile(configFile);
    }

    // 3. Override with programmatic values
    if (programmatic) {
      this.loadProgrammatic(programmatic);
    }
  }

  /**
   * Load from environment variables
   */
  private loadFromEnv(prefix: string): void {
    const env = process.env;

    // Anthropic
    const anthropicKey = env[`${prefix}_ANTHROPIC_API_KEY`] || env['ANTHROPIC_API_KEY'];
    if (anthropicKey) {
      this.credentials.anthropic = { apiKey: anthropicKey };
      this.sources.push({
        type: 'env',
        provider: 'anthropic',
        key: 'apiKey',
        value: this.mask(anthropicKey),
      });
    }

    // OpenAI
    const openaiKey = env[`${prefix}_OPENAI_API_KEY`] || env['OPENAI_API_KEY'];
    const openaiOrg = env[`${prefix}_OPENAI_ORGANIZATION`] || env['OPENAI_ORGANIZATION'];
    if (openaiKey || openaiOrg) {
      this.credentials.openai = {
        apiKey: openaiKey,
        organization: openaiOrg,
      };
      if (openaiKey) {
        this.sources.push({
          type: 'env',
          provider: 'openai',
          key: 'apiKey',
          value: this.mask(openaiKey),
        });
      }
      if (openaiOrg) {
        this.sources.push({
          type: 'env',
          provider: 'openai',
          key: 'organization',
          value: openaiOrg,
        });
      }
    }

    // Google
    const googleKey = env[`${prefix}_GOOGLE_API_KEY`] || env['GOOGLE_API_KEY'];
    if (googleKey) {
      this.credentials.google = { apiKey: googleKey };
      this.sources.push({
        type: 'env',
        provider: 'google',
        key: 'apiKey',
        value: this.mask(googleKey),
      });
    }

    // Ollama
    const ollamaUrl = env[`${prefix}_OLLAMA_BASE_URL`] || env['OLLAMA_BASE_URL'];
    if (ollamaUrl) {
      this.credentials.ollama = { baseUrl: ollamaUrl };
      this.sources.push({
        type: 'env',
        provider: 'ollama',
        key: 'baseUrl',
        value: ollamaUrl,
      });
    }

    // llama.cpp
    const llamacppUrl = env[`${prefix}_LLAMACPP_BASE_URL`] || env['LLAMACPP_BASE_URL'];
    if (llamacppUrl) {
      this.credentials.llamacpp = { baseUrl: llamacppUrl };
      this.sources.push({
        type: 'env',
        provider: 'llamacpp',
        key: 'baseUrl',
        value: llamacppUrl,
      });
    }
  }

  /**
   * Load from JSON/JSONC file
   */
  private async loadFromFile(configPath: string): Promise<void> {
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      const config = this.parseConfig(content);

      if (config.credentials) {
        this.mergeCredentials(config.credentials, 'file');
      }
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw new Error(`Failed to load credentials from ${configPath}: ${error.message}`);
      }
      // File doesn't exist - that's OK
    }
  }

  /**
   * Parse JSON/JSONC config file
   */
  private parseConfig(content: string): any {
    // Remove comments (simple JSONC support)
    const stripped = content
      .split('\n')
      .filter(line => !line.trim().startsWith('//'))
      .join('\n');

    return JSON.parse(stripped);
  }

  /**
   * Load programmatic credentials
   */
  private loadProgrammatic(creds: Credentials): void {
    this.mergeCredentials(creds, 'programmatic');
  }

  /**
   * Merge credentials from a source
   */
  private mergeCredentials(creds: Credentials, source: 'file' | 'programmatic'): void {
    for (const [provider, values] of Object.entries(creds)) {
      if (!values) continue;

      if (!this.credentials[provider as keyof Credentials]) {
        this.credentials[provider as keyof Credentials] = {} as any;
      }

      Object.assign(this.credentials[provider as keyof Credentials]!, values);

      // Track sources
      for (const [key, value] of Object.entries(values)) {
        if (value !== undefined) {
          const stringValue = String(value);
          this.sources.push({
            type: source,
            provider,
            key,
            value: key.toLowerCase().includes('key') ? this.mask(stringValue) : stringValue,
          });
        }
      }
    }
  }

  /**
   * Get credentials for provider
   */
  get<T = any>(provider: string): T | undefined {
    return this.credentials[provider as keyof Credentials] as T;
  }

  /**
   * Get specific credential
   */
  getKey(provider: string, key: string): string | undefined {
    const providerCreds = this.credentials[provider as keyof Credentials];
    if (!providerCreds) return undefined;
    return (providerCreds as any)[key];
  }

  /**
   * Set credential programmatically
   */
  set(provider: string, key: string, value: string): void {
    if (!this.credentials[provider as keyof Credentials]) {
      this.credentials[provider as keyof Credentials] = {} as any;
    }

    (this.credentials[provider as keyof Credentials] as any)[key] = value;

    // Update sources
    const existingIndex = this.sources.findIndex(
      s => s.provider === provider && s.key === key && s.type === 'programmatic'
    );

    const source: CredentialSource = {
      type: 'programmatic',
      provider,
      key,
      value: key.toLowerCase().includes('key') ? this.mask(value) : value,
    };

    if (existingIndex >= 0) {
      this.sources[existingIndex] = source;
    } else {
      this.sources.push(source);
    }
  }

  /**
   * Check if provider has credentials
   */
  has(provider: string): boolean {
    const creds = this.credentials[provider as keyof Credentials];
    return creds !== undefined && Object.keys(creds).length > 0;
  }

  /**
   * Get all configured providers
   */
  getConfiguredProviders(): string[] {
    return Object.keys(this.credentials);
  }

  /**
   * Get credential sources (for debugging)
   */
  getSources(): CredentialSource[] {
    return [...this.sources];
  }

  /**
   * Clear all credentials
   */
  clear(): void {
    this.credentials = {};
    this.sources = [];
  }

  /**
   * Mask API key for logging
   */
  private mask(key: string): string {
    if (key.length <= 8) return '***';
    return `${key.slice(0, 4)}...${key.slice(-4)}`;
  }

  /**
   * Export credentials (for saving to file)
   */
  export(): Credentials {
    return JSON.parse(JSON.stringify(this.credentials));
  }

  /**
   * Save to file
   */
  async save(configPath: string): Promise<void> {
    const config = {
      credentials: this.credentials,
    };

    const dir = path.dirname(configPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  /**
   * Validate that all required providers are configured
   */
  validate(requiredProviders: string[]): { valid: boolean; missing: string[] } {
    const missing: string[] = [];

    for (const provider of requiredProviders) {
      if (!this.has(provider)) {
        missing.push(provider);
      }
    }

    return {
      valid: missing.length === 0,
      missing,
    };
  }
}

// ============================================================================
// Singleton Instance (optional)
// ============================================================================

let globalInstance: CredentialManager | null = null;

/**
 * Get global credential manager instance
 */
export function getGlobalCredentialManager(): CredentialManager {
  if (!globalInstance) {
    globalInstance = new CredentialManager();
  }
  return globalInstance;
}

/**
 * Reset global instance (for testing)
 */
export function resetGlobalCredentialManager(): void {
  globalInstance = null;
}
