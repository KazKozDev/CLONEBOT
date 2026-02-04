import { ClawHubClient } from '../skill-registry';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Creates tools for ClawHub interaction (Search & Install)
 */
export function createClawHubTools(client: ClawHubClient, skillsDir: string) {
  return [
    {
      name: 'clawhub_search',
      description: 'Search for skills in the ClawHub registry.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          limit: { type: 'number', description: 'Max results (default 5)' }
        },
        required: ['query']
      },
      handler: async ({ query, limit = 5 }: { query: string; limit?: number }) => {
        try {
          const results = await client.search(query, { limit });
          const mapped = results.map(r => ({
              slug: r.slug,
              name: r.name,
              description: r.description,
              rating: r.rating,
              downloads: r.downloads
          }));
          return { 
            content: `Found ${mapped.length} skills:\n` + mapped.map(r => `- ${r.name} (${r.slug}): ${r.description}`).join('\n'),
            data: { results: mapped },
            success: true
          };
        } catch (error: any) {
          return { content: error.message, success: false, error: error.message };
        }
      }
    },
    {
      name: 'clawhub_install',
      description: 'Install a skill from ClawHub.',
      inputSchema: {
         type: 'object',
         properties: {
            slug: { type: 'string', description: 'Skill slug' },
            version: { type: 'string', description: 'Specific version (optional)' }
         },
         required: ['slug']
      },
      handler: async ({ slug, version }: { slug: string; version?: string }) => {
         try {
            const content = await client.downloadSkill(slug, version);
            // Ensure directory exists
            await fs.mkdir(skillsDir, { recursive: true });
            
            const filePath = path.join(skillsDir, `${slug}.skill.md`);
            await fs.writeFile(filePath, content, 'utf8');
            return { 
                content: `Skill "${slug}" installed to ${filePath}`,
                success: true, 
                data: { message: `Skill "${slug}" installed to ${filePath}` } 
            };
         } catch (error: any) {
            return { content: error.message, success: false, error: error.message };
         }
      }
    },
    {
      name: 'clawhub_info',
      description: 'Get detailed information about a skill.',
      inputSchema: {
        type: 'object',
        properties: {
          slug: { type: 'string', description: 'Skill slug' }
        },
        required: ['slug']
      },
      handler: async ({ slug }: { slug: string }) => {
        try {
          const info = await client.getSkillInfo(slug);
          return { 
              content: `Skill Info for ${slug}:\nName: ${info.name}\nDescription: ${info.description}`,
              data: { info },
              success: true 
          };
        } catch (error: any) {
          return { content: error.message, success: false, error: error.message };
        }
      }
    }
  ];
}
