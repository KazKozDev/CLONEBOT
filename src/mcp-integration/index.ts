/**
 * MCP Integration
 * 
 * Helper functions for loading and initializing MCP servers
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { McpClientManager, type McpServerConfig } from './McpClientManager';
import type { ToolExecutor } from '../tool-executor/ToolExecutor';

/**
 * Load MCP server configurations from file
 */
export function loadMcpServerConfigs(dataDir: string): McpServerConfig[] {
    const configFile = join(dataDir, 'mcp-servers.json');
    
    if (!existsSync(configFile)) {
        return [];
    }

    try {
        const content = readFileSync(configFile, 'utf-8');
        return JSON.parse(content);
    } catch (error) {
        console.error('Failed to load MCP server configs:', error);
        return [];
    }
}

/**
 * Initialize MCP integration
 */
export async function initializeMcpIntegration(
    dataDir: string,
    toolExecutor: ToolExecutor
): Promise<McpClientManager> {
    const manager = new McpClientManager();
    manager.setToolExecutor(toolExecutor);

    const configs = loadMcpServerConfigs(dataDir);
    
    if (configs.length > 0) {
        await manager.connectAll(configs);
    } else {
        console.log('No MCP servers configured');
    }

    return manager;
}

export { McpClientManager, type McpServerConfig };
