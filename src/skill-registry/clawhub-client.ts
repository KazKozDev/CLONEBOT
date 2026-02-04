import { 
  ClawHubSearchResult, 
  ClawHubSearchOptions, 
  ClawHubSkillInfo, 
  ClawHubVersion,
  ClawHubConnectionError,
  SkillDownloadError
} from './types';
import * as https from 'https';

/**
 * Client for ClawHub Registry
 */
export class ClawHubClient {
  private baseUrl: string;

  constructor(baseUrl: string = 'https://api.openclaw.ai/v1', private timeout: number = 5000) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  /**
   * Search for skills
   */
  async search(query: string, options: ClawHubSearchOptions = {}): Promise<ClawHubSearchResult[]> {
    try {
      const params = new URLSearchParams({ q: query });
      if (options.limit) params.append('limit', options.limit.toString());
      if (options.sortBy) params.append('sort', options.sortBy);
      
      return await this.fetchJson<ClawHubSearchResult[]>(`/skills/search?${params.toString()}`);
    } catch (error: any) {
      throw new ClawHubConnectionError(`Failed to connect to ${this.baseUrl}: ${error.message}`, error);
    }
  }

  /**
   * Get skill details
   */
  async getSkillInfo(slug: string): Promise<ClawHubSkillInfo> {
    try {
      return await this.fetchJson<ClawHubSkillInfo>(`/skills/${slug}`);
    } catch (error: any) {
      throw new ClawHubConnectionError(`Failed to connect to ${this.baseUrl}: ${error.message}`, error);
    }
  }

  /**
   * Download skill content
   */
  async downloadSkill(slug: string, version?: string): Promise<string> {
    try {
      // Get download URL from info
      const info = await this.getSkillInfo(slug);
      let targetVersion: ClawHubVersion | undefined;

      if (version) {
        targetVersion = info.versions.find(v => v.version === version);
        if (!targetVersion) {
          throw new Error(`Version ${version} not found for skill ${slug}`);
        }
      } else {
        // Latest
        targetVersion = info.versions[0];
      }

      const downloadUrl = targetVersion.downloadUrl;
      const response = await fetch(downloadUrl);
      
      if (!response.ok) {
        throw new SkillDownloadError(slug, `HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.text();
    } catch (error: any) {
      if (error instanceof SkillDownloadError) throw error;
      throw new SkillDownloadError(slug, error.message);
    }
  }

  // --- Private Helpers ---

  private async fetchJson<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(id);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json() as T;
    } catch (error) {
      clearTimeout(id);
      throw error;
    }
  }

}
