/**
 * Web UI Server - Full Integration
 * 
 * Запуск Web UI с полной интеграцией всех модулей CLONEBOT:
 * - AgentLoop (agent)
 * - UserProfileStore (долгосрочная память)
 * - MemoryStore (системные промпты, скиллы)
 * - SkillRegistry (навыки)
 * - ToolExecutor (tools)
 * - SessionStore (история сессий)
 * - ContextAssembler (сборка контекста)
 */

import { GatewayServer } from './gateway-server';
import { AgentLoop } from './agent-loop';
import { SessionStore, InMemoryFileSystem } from './session-store';
import { ContextAssembler } from './context-assembler';
import { ModelAdapter } from './model-adapter';
import { ToolExecutor } from './tool-executor';
import { SkillRegistry, ClawHubClient } from './skill-registry';
import { AgentLoopIntegration } from './skill-registry/agent-loop-integration';
import { MessageBus } from './message-bus';
import { MemoryStore } from './memory-store';
import { UserProfileStore } from './user-profile';
import { installWebUIRoutes } from './gateway-server/web-ui-routes';
import type { AgentLoopDependencies } from './agent-loop/types';
import * as path from 'path';
import * as os from 'os';

// Side-effect import: registers agent.* event types on EventPayloadMap
import './agent-loop/bus-events';

// ============================================================================
// Configuration
// ============================================================================

interface WebUIConfig {
    server: {
        host: string;
        port: number;
    };
    model: {
        provider: string;
        defaultModel: string;
    };
    paths: {
        staticDir: string;
        dataDir: string;
        workspaceDir: string;
        skillsDir: string;
    };
    features: {
        skills: boolean;
        browser: boolean;
        userProfile: boolean;
    };
}

function getConfig(): WebUIConfig {
    const dataDir = process.env.DATA_DIR || './data';
    const workspaceDir = path.join(os.homedir(), '.openclone', 'workspace');

    return {
        server: {
            host: process.env.WEB_HOST || '127.0.0.1',
            port: parseInt(process.env.WEB_PORT || '3000', 10),
        },
        model: {
            provider: process.env.MODEL_PROVIDER || 'ollama',
            defaultModel: process.env.MODEL_ID || 'gpt-oss:20b',
        },
        paths: {
            staticDir: path.join(process.cwd(), 'web', 'static'),
            dataDir,
            workspaceDir,
            skillsDir: process.env.SKILLS_DIR || path.join(process.cwd(), 'skills'),
        },
        features: {
            skills: process.env.SKILLS_ENABLED !== 'false',
            browser: process.env.BROWSER_ENABLED === 'true',
            userProfile: process.env.USER_PROFILE_ENABLED !== 'false',
        },
    };
}

// ============================================================================
// Main
// ============================================================================

async function main() {
    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('  🌐 CLONEBOT - Web UI Server (Full Integration)');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');

    const config = getConfig();

    // ========================================
    // Initialize MessageBus
    // ========================================
    const bus = new MessageBus();
    bus.use(async (event, _payload, next) => {
        if (event.startsWith('agent.') && process.env.DEBUG === 'true') {
            console.log(`  [bus] ${event}`);
        }
        await next();
    });
    console.log('✓ MessageBus initialized');

    // ========================================
    // Initialize SessionStore
    // ========================================
    const sessionStore = new SessionStore(new InMemoryFileSystem(), {
        lockTimeoutMs: 5000,
    });
    console.log('✓ SessionStore initialized');

    // ========================================
    // Initialize MemoryStore (prompts, skills, credentials)
    // ========================================
    let memoryStore: MemoryStore | null = null;
    try {
        memoryStore = new MemoryStore(
            {
                workspaceDir: config.paths.workspaceDir,
                autoLoad: true,
            },
            process.env.MEMORY_MASTER_PASSWORD || 'default-change-me'
        );
        const initResult = await memoryStore.init();
        console.log(`✓ MemoryStore initialized (${initResult.promptsLoaded} prompts, ${initResult.skillsLoaded} skills)`);
    } catch (error) {
        console.warn('⚠️  MemoryStore initialization failed:', error);
        console.warn('  → Continuing without MemoryStore');
    }

    // ========================================
    // Initialize UserProfileStore (долгосрочная память)
    // ========================================
    let userProfileStore: UserProfileStore | null = null;
    if (config.features.userProfile) {
        try {
            const profilesDir = path.join(config.paths.workspaceDir, 'users');
            userProfileStore = new UserProfileStore({
                profilesDir,
                autoSave: true,
            });
            await userProfileStore.init();
            console.log('✓ UserProfileStore initialized (долгосрочная память)');
        } catch (error) {
            console.warn('⚠️  UserProfileStore initialization failed:', error);
        }
    }

    // ========================================
    // Initialize ToolExecutor
    // ========================================
    const toolExecutor = new ToolExecutor({
        defaultTimeout: 30000,
        maxConcurrent: 5,
    });

    // Register Basic Tools & Session Tools & ClawHub Tools
    try {
        const { basicTools, createSessionTools, createClawHubTools } = await import('./tools');

        // Register Basic Tools
        for (const tool of basicTools) {
            toolExecutor.register(
                {
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.inputSchema as any
                },
                tool.handler as any
            );
        }

        // Register Session Tools
        const sessionTools = createSessionTools(sessionStore, bus);
        for (const tool of sessionTools) {
            toolExecutor.register(
                {
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.inputSchema as any
                },
                tool.handler as any
            );
        }

        // Register ClawHub Tools
        let clawHubCount = 0;
        if (config.features.skills) {
            const clawHubClient = new ClawHubClient();
            const clawHubTools = createClawHubTools(clawHubClient, config.paths.skillsDir);
            for (const tool of clawHubTools) {
                toolExecutor.register(
                    {
                        name: tool.name,
                        description: tool.description,
                        parameters: tool.inputSchema as any
                    },
                    tool.handler as any
                );
            }
            clawHubCount = clawHubTools.length;
        }

        console.log(`✓ Core tools registered (Basic: ${basicTools.length}, Session: ${sessionTools.length}, ClawHub: ${clawHubCount})`);
    } catch (error) {
        console.warn('⚠️  Failed to register core tools:', error);
    }

    // Register Browser Tools
    if (config.features.browser) {
        try {
            const { registerBrowserTools } = await import('./tool-executor/browser-tools');
            registerBrowserTools(toolExecutor, {
                mode: 'openclaw',
                openclaw: { headless: false }, // Visible browser window
                timeouts: { navigation: 30000, action: 30000, idle: 30000 },
            });
            console.log('✓ Browser tools registered (visible mode)');
        } catch (error) {
            console.warn('⚠️  Browser tools failed:', error);
        }
    }

    // Register User Profile Tools
    if (userProfileStore) {
        try {
            const { registerProfileTools } = await import('./user-profile/profile-tools');
            registerProfileTools(toolExecutor, userProfileStore);
            console.log('✓ User Profile tools registered (user.remember, user.recall, user.forget)');
        } catch (error) {
            console.warn('⚠️  User Profile tools failed:', error);
        }
    }


    // Register Artifact Tools (Mermaid, React, Web)
    try {
        const { artifactTools } = await import('./tools/artifact-tools');
        for (const tool of artifactTools) {
            toolExecutor.register(
                {
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.inputSchema as any
                },
                tool.handler as any
            );
        }
        console.log(`✓ Artifact tools registered (${artifactTools.length} tools)`);
    } catch (error) {
        console.warn('⚠️  Artifact tools failed:', error);
    }

    // ========================================
    // Initialize MCP Integration
    // ========================================
    let mcpManager = null;
    try {
        const { initializeMcpIntegration } = await import('./mcp-integration');
        mcpManager = await initializeMcpIntegration(config.paths.dataDir, toolExecutor);
        
        const stats = mcpManager.getStats();
        if (stats.connectedServers > 0) {
            console.log(`✓ MCP Integration: ${stats.totalTools} tools from ${stats.connectedServers} server(s)`);
        }
    } catch (error) {
        console.warn('⚠️  MCP Integration failed:', error);
    }

    // ========================================
    // Initialize SkillRegistry
    // ========================================
    let skillIntegration: AgentLoopIntegration | null = null;
    if (config.features.skills) {
        const registry = new SkillRegistry({
            workspaceDir: config.paths.skillsDir,
        });

        try {
            const result = await registry.initialize();
            console.log(`✓ SkillRegistry loaded (${result.loaded} skills)`);
        } catch {
            console.warn('⚠️  No skills found');
        }

        skillIntegration = new AgentLoopIntegration(registry, {
            autoActivate: true,
            autoActivateThreshold: 5,
            maxAutoActivate: 3,
        });
    }

    // ========================================
    // Initialize ContextAssembler
    // ========================================
    const contextAssembler = new ContextAssembler({
        sessionStore,
        toolExecutor,
        memoryStore: memoryStore || undefined,
        userProfileStore: userProfileStore || undefined,
    });
    console.log('✓ ContextAssembler initialized');

    // ========================================
    // Initialize ModelAdapter
    // ========================================
    const modelAdapter = new ModelAdapter({
        defaultProvider: config.model.provider,
        defaultModel: config.model.defaultModel,
        providers: {
            ollama: {
                baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
                defaultModel: config.model.defaultModel,
            },
        },
    });
    console.log(`✓ ModelAdapter initialized (${config.model.provider}/${config.model.defaultModel})`);

    // ========================================
    // Initialize AgentLoop
    // ========================================
    const dependencies: AgentLoopDependencies = {
        sessionStore,
        contextAssembler,
        modelAdapter,
        toolExecutor,
        memoryStore: memoryStore || undefined,
    };

    const agent = new AgentLoop(dependencies, {
        concurrency: {
            maxConcurrentRuns: 10,
            maxConcurrentToolCalls: 5,
        },
        limits: {
            maxTurns: 20,
            maxToolRounds: 10,
            maxToolCallsPerRound: 10,
            queueTimeout: 60000,
        },
    });
    console.log('✓ AgentLoop initialized');

    // ========================================
    // Initialize GatewayServer
    // ========================================
    const gateway = new GatewayServer(
        {
            host: config.server.host,
            port: config.server.port,
            auth: { mode: 'none' },
            cors: {
                enabled: true,
                origins: ['*'],
                credentials: true,
            },
            rateLimit: {
                enabled: false,
                defaultLimit: 60,
                windowMs: 60_000,
            },
            static: {
                enabled: true,
                root: config.paths.staticDir,
                index: 'index.html',
            },
            timeouts: {
                request: 120_000, // 2 minutes for LLM responses
                websocket: 300_000,
                shutdown: 10_000,
            },
            limits: {
                maxBodySize: 10 * 1024 * 1024,
                maxConnections: 1000,
                maxConnectionsPerIp: 100,
            },
            logging: {
                requests: process.env.DEBUG === 'true',
                responses: false,
                errors: true,
            },
        },
        {
            agentLoop: agent,
            sessionStore,
            toolExecutor,
            messageBus: bus,
        }
    );

    // Install Web UI Routes with full module integration
    installWebUIRoutes(gateway, {
        dataDir: config.paths.dataDir,
        agentLoop: agent,
        userProfileStore: userProfileStore || undefined,
        memoryStore: memoryStore || undefined,
        skillIntegration: skillIntegration || undefined,
    });

    await gateway.start();
    const address = gateway.getAddress();

    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('  ✅ Web UI Server ready');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');
    if (address) {
        console.log(`🌐 Open in browser: http://${address.host}:${address.port}`);
    }
    console.log('');
    console.log('Configuration:');
    console.log(`  Model: ${config.model.provider}/${config.model.defaultModel}`);
    console.log(`  Skills: ${config.features.skills ? 'enabled' : 'disabled'}`);
    console.log(`  Browser: ${config.features.browser ? 'enabled' : 'disabled'}`);
    console.log(`  UserProfile: ${config.features.userProfile ? 'enabled' : 'disabled'}`);
    console.log(`  Static: ${config.paths.staticDir}`);
    console.log(`  Data: ${config.paths.dataDir}`);
    console.log('');

    // Graceful shutdown
    process.on('SIGINT', async () => {
        console.log('');
        console.log('🛑 Shutting down...');
        
        // Disconnect MCP servers
        if (mcpManager) {
            console.log('  Disconnecting MCP servers...');
            await mcpManager.disconnectAll();
        }
        
        await gateway.stop();
        console.log('✅ Shutdown complete');
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        console.log('🛑 SIGTERM received, shutting down...');
        await gateway.stop();
        process.exit(0);
    });
}

// ============================================================================
// Entry Point
// ============================================================================

main().catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});
