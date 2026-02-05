/**
 * MCP Client Manager
 * 
 * Manages connections to MCP servers and exposes their tools to the ToolExecutor
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { ToolExecutor } from '../tool-executor/ToolExecutor';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export interface McpServerConfig {
    id: string;
    name: string;
    transport: 'stdio' | 'sse';
    command?: string;
    args?: string[];
    url?: string;
    env?: Record<string, string>;
    enabled: boolean;
    status?: string;
}

interface ActiveMcpClient {
    config: McpServerConfig;
    client: Client;
    transport: StdioClientTransport;
    tools: Tool[];
}

export class McpClientManager {
    private clients: Map<string, ActiveMcpClient> = new Map();
    private toolExecutor?: ToolExecutor;

    constructor() {}

    /**
     * Set the tool executor to register MCP tools
     */
    setToolExecutor(executor: ToolExecutor): void {
        this.toolExecutor = executor;
    }

    /**
     * Connect to an MCP server
     */
    async connect(config: McpServerConfig): Promise<void> {
        if (!config.enabled) {
            console.log(`⏸️  MCP server ${config.name} is disabled, skipping...`);
            return;
        }

        if (config.transport !== 'stdio') {
            console.warn(`⚠️  Transport ${config.transport} not yet implemented for ${config.name}`);
            return;
        }

        if (!config.command) {
            throw new Error(`Missing command for MCP server ${config.name}`);
        }

        console.log(`🔌 Connecting to MCP server: ${config.name} (${config.command})...`);

        try {
            // Create stdio transport
            // Filter out undefined values from env
            const cleanEnv: Record<string, string> = {};
            Object.entries({ ...process.env, ...config.env }).forEach(([key, value]) => {
                if (value !== undefined) {
                    cleanEnv[key] = value;
                }
            });
            
            const transport = new StdioClientTransport({
                command: config.command,
                args: config.args || [],
                env: cleanEnv,
            });

            // Create MCP client
            const client = new Client({
                name: 'clonebot',
                version: '1.0.0',
            }, {
                capabilities: {}
            });

            // Connect to the server
            await client.connect(transport);

            // List available tools
            const toolsResponse = await client.listTools();
            const tools = toolsResponse.tools;

            console.log(`✓ Connected to ${config.name}, found ${tools.length} tools`);

            // Register tools with ToolExecutor
            if (this.toolExecutor) {
                for (const tool of tools) {
                    // Use underscore instead of colon to avoid tool name validation issues
                    const toolName = `${config.name}_${tool.name}`;
                    
                    this.toolExecutor.register(
                        {
                            name: toolName,
                            description: tool.description || `Tool from ${config.name}`,
                            parameters: tool.inputSchema as any,
                        },
                        async (params: any) => {
                            try {
                                const result = await client.callTool({
                                    name: tool.name,
                                    arguments: params,
                                });

                                // Extract text content from result
                                if (result.content && Array.isArray(result.content)) {
                                    const textContent = result.content
                                        .filter((c: any) => c.type === 'text')
                                        .map((c: any) => c.text)
                                        .join('\n');
                                    const contentStr = textContent || JSON.stringify(result.content);
                                    return {
                                        success: true,
                                        content: contentStr,
                                        data: contentStr,
                                    };
                                }

                                const contentStr = JSON.stringify(result);
                                return {
                                    success: true,
                                    content: contentStr,
                                    data: contentStr,
                                };
                            } catch (error: any) {
                                return {
                                    success: false,
                                    content: `MCP tool ${toolName} failed: ${error.message}`,
                                    error: {
                                        code: 'MCP_TOOL_ERROR',
                                        message: `MCP tool ${toolName} failed: ${error.message}`,
                                    },
                                };
                            }
                        }
                    );
                }

                console.log(`  ✓ Registered ${tools.length} tools from ${config.name}`);
                
                // Register convenience aliases for commonly used tool combinations
                this.registerToolAliases(config.name, client);
                
                // Register legacy tool aliases for backward compatibility
                this.registerLegacyAliases(config.name, client);
            }

            // Store the active client
            this.clients.set(config.id, {
                config,
                client,
                transport,
                tools,
            });

        } catch (error: any) {
            console.error(`❌ Failed to connect to MCP server ${config.name}:`, error.message);
            throw error;
        }
    }

    /**
     * Register convenience aliases for tools
     * Example: search_arxiv_tool -> search_research_tool with source="arxiv"
     */
    private registerToolAliases(serverName: string, client: Client): void {
        if (!this.toolExecutor) return;

        // Simple alias: search_web_tool -> search_web
        if (serverName === 'search') {
            this.toolExecutor.register(
                {
                    name: 'search_web_tool',
                    description: 'Search the web (alias)',
                    parameters: {
                        type: 'object',
                        properties: {
                            query: { type: 'string', description: 'Search query' },
                            limit: { type: 'number', description: 'Maximum results', default: 10 },
                            timelimit: { type: 'string', description: 'Time filter (d/w/m/y or words like today/week/month/year)' },
                            mode: { type: 'string', description: 'Search mode (web/news/default)', default: 'web' },
                            engine: { type: 'string', description: 'Search engine (ignored)' },
                            no_cache: { type: 'boolean', description: 'Disable cache (ignored)' },
                            use_fallback: { type: 'boolean', description: 'Use fallback (ignored)' },
                        },
                        required: ['query'],
                    },
                },
                async (params: any) => {
                    try {
                        const validTimelimits = ['d', 'w', 'm', 'y'];
                        let timelimit = params.timelimit;
                        if (timelimit === 'today' || timelimit === '1d') timelimit = 'd';
                        if (timelimit === 'week') timelimit = 'w';
                        if (timelimit === 'month') timelimit = 'm';
                        if (timelimit === 'year') timelimit = 'y';
                        if (timelimit && !validTimelimits.includes(timelimit)) {
                            timelimit = undefined;
                        }

                        const mode = params.mode && params.mode !== 'default' ? params.mode : 'web';

                        const result = await client.callTool({
                            name: 'search_web',
                            arguments: {
                                query: params.query,
                                limit: params.limit || 10,
                                timelimit,
                                mode,
                            },
                        });
                        const contentArray = Array.isArray((result as any).content) ? (result as any).content : [];
                        const textContent = contentArray
                            .filter((c: any) => c.type === 'text')
                            .map((c: any) => c.text)
                            .join('\n');
                        const contentStr = textContent || JSON.stringify((result as any).content ?? result);
                        return { success: true, content: contentStr, data: contentStr };
                    } catch (error: any) {
                        return {
                            success: false,
                            content: `search_web_tool failed: ${error.message}`,
                            error: { code: 'SEARCH_ERROR', message: error.message },
                        };
                    }
                }
            );
        }

        // Aliases for research_tool
        const researchAliases = [
            { name: 'search_arxiv_tool', source: 'arxiv', description: 'Search ArXiv for scientific papers' },
            { name: 'search_pubmed_tool', source: 'pubmed', description: 'Search PubMed for medical research' },
            { name: 'search_gdelt_tool', source: 'gdelt', description: 'Search GDELT for global news' },
        ];

        for (const alias of researchAliases) {
            this.toolExecutor.register(
                {
                    name: `${serverName}_${alias.name}`,
                    description: alias.description,
                    parameters: {
                        type: 'object',
                        properties: {
                            query: {
                                type: 'string',
                                description: 'Search query',
                            },
                            limit: {
                                type: 'number',
                                description: 'Maximum number of results',
                                default: 10,
                            },
                        },
                        required: ['query'],
                    },
                },
                async (params: any) => {
                    try {
                        const result = await client.callTool({
                            name: 'research_tool',
                            arguments: {
                                source: alias.source,
                                query: params.query,
                                limit: params.limit || 10,
                            },
                        });

                        if (result.content && Array.isArray(result.content)) {
                            const textContent = result.content
                                .filter((c: any) => c.type === 'text')
                                .map((c: any) => c.text)
                                .join('\n');
                            const contentStr = textContent || JSON.stringify(result.content);
                            return {
                                success: true,
                                content: contentStr,
                                data: contentStr,
                            };
                        }

                        const contentStr = JSON.stringify(result);
                        return {
                            success: true,
                            content: contentStr,
                            data: contentStr,
                        };
                    } catch (error: any) {
                        return {
                            success: false,
                            content: `MCP tool ${serverName}_${alias.name} failed: ${error.message}`,
                            error: {
                                code: 'MCP_TOOL_ERROR',
                                message: `MCP tool ${serverName}_${alias.name} failed: ${error.message}`,
                            },
                        };
                    }
                }
            );
        }

        console.log(`  ✓ Registered ${researchAliases.length} aliases for ${serverName}`);
    }

    /**
     * Register legacy tool aliases for backward compatibility
     */
    private registerLegacyAliases(serverName: string, client: Client): void {
        if (!this.toolExecutor) {
            console.log(`  ⚠️  Cannot register legacy aliases: no toolExecutor`);
            return;
        }
        
        if (serverName !== 'search') {
            console.log(`  ⚠️  Skipping legacy aliases for ${serverName} (only for 'search')`);
            return;
        }

        const legacyTools = [
            // search_duckduckgo -> search_web
            {
                name: 'search_duckduckgo',
                description: 'Search the web using DuckDuckGo (legacy)',
                targetTool: 'search_web',
                mapParams: (params: any) => {
                    const validTimelimits = ['d', 'w', 'm', 'y'];
                    let timelimit = params.timelimit;
                    
                    // Map common invalid values
                    if (timelimit === 'today' || timelimit === '1d') timelimit = 'd';
                    if (timelimit === 'week') timelimit = 'w';
                    if (timelimit === 'month') timelimit = 'm';
                    if (timelimit === 'year') timelimit = 'y';
                    
                    // Only include if valid
                    if (timelimit && !validTimelimits.includes(timelimit)) {
                        timelimit = undefined;
                    }
                    
                    return {
                        query: params.query,
                        limit: params.limit || 10,
                        timelimit: timelimit !== '' ? timelimit : undefined,
                        mode: params.mode && params.mode !== 'default' ? params.mode : 'web',
                    };
                },
                params: {
                    query: { type: 'string', description: 'Search query', required: true },
                    limit: { type: 'number', description: 'Maximum results', default: 10 },
                    timelimit: { type: 'string', description: 'Time filter: d/w/m/y/today/week/month/year (invalid values ignored)' },
                    mode: { type: 'string', description: 'Search mode', enum: ['web', 'news', 'default'] },
                    engine: { type: 'string', description: 'Search engine (ignored)' },
                    no_cache: { type: 'boolean', description: 'Disable cache (ignored)' },
                    use_fallback: { type: 'boolean', description: 'Use fallback (ignored)' },
                },
            },
            // extract_webpage_content -> content_tool
            {
                name: 'extract_webpage_content',
                description: 'Extract content from webpage (legacy)',
                targetTool: 'content_tool',
                mapParams: (params: any) => ({
                    url: params.url,
                    content_type: 'webpage',
                }),
                params: {
                    url: { type: 'string', description: 'URL to extract content from', required: true },
                },
            },
            // parse_pdf -> content_tool
            {
                name: 'parse_pdf',
                description: 'Parse PDF document (legacy)',
                targetTool: 'content_tool',
                mapParams: (params: any) => ({
                    url: params.url,
                    content_type: 'pdf',
                }),
                params: {
                    url: { type: 'string', description: 'PDF URL', required: true },
                },
            },
            // parse_rss -> content_tool
            {
                name: 'parse_rss',
                description: 'Parse RSS feed (legacy)',
                targetTool: 'content_tool',
                mapParams: (params: any) => ({
                    url: params.url,
                    content_type: 'rss',
                }),
                params: {
                    url: { type: 'string', description: 'RSS feed URL', required: true },
                },
            },
            // search_wikipedia -> wikipedia_tool
            {
                name: 'search_wikipedia',
                description: 'Search Wikipedia articles (legacy)',
                targetTool: 'wikipedia_tool',
                mapParams: (params: any) => ({
                    action: 'search',
                    query: params.query,
                    limit: params.limit || 5,
                    lang: params.lang || 'en',
                }),
                params: {
                    query: { type: 'string', description: 'Search query', required: true },
                    limit: { type: 'number', description: 'Maximum results', default: 5 },
                    lang: { type: 'string', description: 'Language code', default: 'en' },
                },
            },
            // get_wikipedia_summary -> wikipedia_tool
            {
                name: 'get_wikipedia_summary',
                description: 'Get Wikipedia article summary (legacy)',
                targetTool: 'wikipedia_tool',
                mapParams: (params: any) => ({
                    action: 'summary',
                    title: params.title,
                    lang: params.lang || 'en',
                }),
                params: {
                    title: { type: 'string', description: 'Article title', required: true },
                    lang: { type: 'string', description: 'Language code', default: 'en' },
                },
            },
            // get_wikipedia_content -> wikipedia_tool
            {
                name: 'get_wikipedia_content',
                description: 'Get full Wikipedia article (legacy)',
                targetTool: 'wikipedia_tool',
                mapParams: (params: any) => ({
                    action: 'content',
                    title: params.title,
                    lang: params.lang || 'en',
                }),
                params: {
                    title: { type: 'string', description: 'Article title', required: true },
                    lang: { type: 'string', description: 'Language code', default: 'en' },
                },
            },
            // search_github -> github_tool
            {
                name: 'search_github',
                description: 'Search GitHub repositories (legacy)',
                targetTool: 'github_tool',
                mapParams: (params: any) => ({
                    action: 'search',
                    query: params.query,
                    limit: params.limit || 5,
                }),
                params: {
                    query: { type: 'string', description: 'Search query', required: true },
                    limit: { type: 'number', description: 'Maximum results', default: 5 },
                },
            },
            // get_github_readme -> github_tool
            {
                name: 'get_github_readme',
                description: 'Get GitHub repository README (legacy)',
                targetTool: 'github_tool',
                mapParams: (params: any) => ({
                    action: 'readme',
                    repo: params.repo,
                }),
                params: {
                    repo: { type: 'string', description: 'Repository (owner/repo)', required: true },
                },
            },
            // search_reddit -> reddit_tool
            {
                name: 'search_reddit',
                description: 'Search Reddit posts (legacy)',
                targetTool: 'reddit_tool',
                mapParams: (params: any) => ({
                    action: 'search',
                    query: params.query,
                    subreddit: params.subreddit,
                    limit: params.limit || 10,
                }),
                params: {
                    query: { type: 'string', description: 'Search query', required: true },
                    subreddit: { type: 'string', description: 'Subreddit name' },
                    limit: { type: 'number', description: 'Maximum results', default: 10 },
                },
            },
            // get_reddit_comments -> reddit_tool
            {
                name: 'get_reddit_comments',
                description: 'Get Reddit post comments (legacy)',
                targetTool: 'reddit_tool',
                mapParams: (params: any) => ({
                    action: 'comments',
                    url: params.url,
                    limit: params.limit || 50,
                }),
                params: {
                    url: { type: 'string', description: 'Reddit post URL', required: true },
                    limit: { type: 'number', description: 'Maximum comments', default: 50 },
                },
            },
            // get_current_datetime -> context_tool
            {
                name: 'get_current_datetime',
                description: 'Get current date and time (legacy)',
                targetTool: 'context_tool',
                mapParams: (params: any) => ({
                    action: 'datetime',
                    timezone: params.timezone || 'UTC',
                }),
                params: {
                    timezone: { type: 'string', description: 'Timezone', default: 'UTC' },
                },
            },
            // get_location_by_ip -> context_tool
            {
                name: 'get_location_by_ip',
                description: 'Get geolocation by IP (legacy)',
                targetTool: 'context_tool',
                mapParams: (params: any) => ({
                    action: 'location',
                    ip: params.ip,
                }),
                params: {
                    ip: { type: 'string', description: 'IP address (optional)' },
                },
            },
        ];

        for (const legacyTool of legacyTools) {
            const properties: any = {};
            const required: string[] = [];

            for (const [paramName, paramDef] of Object.entries(legacyTool.params)) {
                const def: any = paramDef;
                properties[paramName] = {
                    type: def.type,
                    description: def.description,
                };
                if (def.enum) properties[paramName].enum = def.enum;
                if (def.default !== undefined) properties[paramName].default = def.default;
                if (def.required) required.push(paramName);
            }

            this.toolExecutor.register(
                {
                    name: legacyTool.name,
                    description: legacyTool.description,
                    parameters: {
                        type: 'object',
                        properties,
                        required,
                    },
                },
                async (params: any) => {
                    try {
                        const mappedParams = legacyTool.mapParams(params) as Record<string, any>;
                        // Remove undefined values
                        Object.keys(mappedParams).forEach(key => {
                            if (mappedParams[key] === undefined) delete mappedParams[key];
                        });

                        const result = await client.callTool({
                            name: legacyTool.targetTool,
                            arguments: mappedParams,
                        });

                        if (result.content && Array.isArray(result.content)) {
                            const textContent = result.content
                                .filter((c: any) => c.type === 'text')
                                .map((c: any) => c.text)
                                .join('\n');
                            const contentStr = textContent || JSON.stringify(result.content);
                            return {
                                success: true,
                                content: contentStr,
                                data: contentStr,
                            };
                        }

                        const contentStr = JSON.stringify(result);
                        return {
                            success: true,
                            content: contentStr,
                            data: contentStr,
                        };
                    } catch (error: any) {
                        return {
                            success: false,
                            content: `${legacyTool.name} failed: ${error.message}`,
                            error: {
                                code: 'LEGACY_TOOL_ERROR',
                                message: `${legacyTool.name} failed: ${error.message}`,
                            },
                        };
                    }
                }
            );
        }

        console.log(`  ✓ Registered ${legacyTools.length} legacy aliases`);
    }

    /**
     * Connect to multiple MCP servers
     */
    async connectAll(configs: McpServerConfig[]): Promise<void> {
        const enabledConfigs = configs.filter(c => c.enabled);
        
        if (enabledConfigs.length === 0) {
            console.log('No enabled MCP servers found');
            return;
        }

        console.log(`\n🔌 Connecting to ${enabledConfigs.length} MCP server(s)...`);
        
        const results = await Promise.allSettled(
            enabledConfigs.map(config => this.connect(config))
        );

        const successful = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;

        console.log(`✓ MCP Servers connected: ${successful}/${enabledConfigs.length}`);
        if (failed > 0) {
            console.log(`⚠️  Failed: ${failed}`);
        }
    }

    /**
     * Disconnect from an MCP server
     */
    async disconnect(serverId: string): Promise<void> {
        const activeClient = this.clients.get(serverId);
        if (!activeClient) {
            return;
        }

        console.log(`Disconnecting from ${activeClient.config.name}...`);

        try {
            await activeClient.client.close();
            await activeClient.transport.close();
        } catch (error) {
            console.error(`Error disconnecting from ${activeClient.config.name}:`, error);
        }

        this.clients.delete(serverId);
    }

    /**
     * Disconnect from all MCP servers
     */
    async disconnectAll(): Promise<void> {
        const serverIds = Array.from(this.clients.keys());
        await Promise.all(serverIds.map(id => this.disconnect(id)));
    }

    /**
     * Get list of connected servers
     */
    getConnectedServers(): string[] {
        return Array.from(this.clients.keys());
    }

    /**
     * Get total number of tools from all MCP servers
     */
    getTotalToolsCount(): number {
        return Array.from(this.clients.values()).reduce(
            (sum, client) => sum + client.tools.length,
            0
        );
    }

    /**
     * Get statistics
     */
    getStats(): {
        connectedServers: number;
        totalTools: number;
        servers: Array<{ name: string; toolCount: number }>;
    } {
        const servers = Array.from(this.clients.values()).map(client => ({
            name: client.config.name,
            toolCount: client.tools.length,
        }));

        return {
            connectedServers: this.clients.size,
            totalTools: this.getTotalToolsCount(),
            servers,
        };
    }
}
