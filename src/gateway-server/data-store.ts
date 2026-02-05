/**
 * Data Store for Web UI
 * 
 * JSON file-based storage for chats, projects, and related data.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import * as path from 'path';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    artifacts?: ChatArtifact[];
}

export interface ChatArtifact {
    path: string;
    title: string;
    type: string;
}

export interface Chat {
    id: string;
    title: string;
    messages: ChatMessage[];
    artifacts: ChatArtifact[];
    projectId?: string;
    createdAt: string;
    updatedAt: string;
}

export interface ProjectFile {
    id: string;
    name: string;
    path: string;
    content?: string;
    size?: number;
    updatedAt?: string;
}

export interface Project {
    id: string;
    name: string;
    description?: string;
    systemPrompt?: string;
    color?: string;
    files: ProjectFile[];
    createdAt: string;
    updatedAt: string;
}

// -----------------------------------------------------------------------------
// Data Store Class
// -----------------------------------------------------------------------------

export class DataStore {
    private dataDir: string;
    private chatsFile: string;
    private projectsFile: string;
    private artifactsDir: string;

    constructor(dataDir: string = './data') {
        this.dataDir = path.resolve(dataDir);
        this.chatsFile = path.join(this.dataDir, 'chats.json');
        this.projectsFile = path.join(this.dataDir, 'projects.json');
        this.artifactsDir = path.join(this.dataDir, 'artifacts');

        this.ensureDirectories();
    }

    private ensureDirectories(): void {
        if (!existsSync(this.dataDir)) {
            mkdirSync(this.dataDir, { recursive: true });
        }
        if (!existsSync(this.artifactsDir)) {
            mkdirSync(this.artifactsDir, { recursive: true });
        }
    }

    // ---------------------------------------------------------------------------
    // Chats
    // ---------------------------------------------------------------------------

    loadChats(): Chat[] {
        if (!existsSync(this.chatsFile)) {
            return [];
        }
        try {
            const data = readFileSync(this.chatsFile, 'utf-8');
            return JSON.parse(data);
        } catch {
            return [];
        }
    }

    saveChats(chats: Chat[]): void {
        writeFileSync(this.chatsFile, JSON.stringify(chats, null, 2), 'utf-8');
    }

    getChat(chatId: string): Chat | undefined {
        const chats = this.loadChats();
        return chats.find(c => c.id === chatId);
    }

    saveChat(chat: Chat): Chat {
        const chats = this.loadChats();
        const existingIndex = chats.findIndex(c => c.id === chat.id);

        chat.updatedAt = new Date().toISOString();

        if (existingIndex >= 0) {
            chats[existingIndex] = chat;
        } else {
            chat.createdAt = chat.createdAt || new Date().toISOString();
            chats.unshift(chat); // Add to beginning
        }

        this.saveChats(chats);
        return chat;
    }

    deleteChat(chatId: string): boolean {
        const chats = this.loadChats();
        const filtered = chats.filter(c => c.id !== chatId);
        if (filtered.length < chats.length) {
            this.saveChats(filtered);
            return true;
        }
        return false;
    }

    listChats(options?: { projectId?: string; limit?: number }): Chat[] {
        let chats = this.loadChats();

        // Filter by projectId if specified, or get only non-project chats
        if (options?.projectId !== undefined) {
            if (options.projectId === null) {
                // Get only chats without projectId
                chats = chats.filter(c => !c.projectId);
            } else {
                chats = chats.filter(c => c.projectId === options.projectId);
            }
        } else {
            // By default, return only non-project chats for the main sidebar
            chats = chats.filter(c => !c.projectId);
        }

        // Sort by updatedAt descending
        chats.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

        if (options?.limit) {
            chats = chats.slice(0, options.limit);
        }

        return chats;
    }

    // ---------------------------------------------------------------------------
    // Projects
    // ---------------------------------------------------------------------------

    loadProjects(): Project[] {
        if (!existsSync(this.projectsFile)) {
            return [];
        }
        try {
            const data = readFileSync(this.projectsFile, 'utf-8');
            return JSON.parse(data);
        } catch {
            return [];
        }
    }

    saveProjects(projects: Project[]): void {
        writeFileSync(this.projectsFile, JSON.stringify(projects, null, 2), 'utf-8');
    }

    getProject(projectId: string): Project | undefined {
        const projects = this.loadProjects();
        return projects.find(p => p.id === projectId);
    }

    saveProject(project: Project): Project {
        const projects = this.loadProjects();
        const existingIndex = projects.findIndex(p => p.id === project.id);

        project.updatedAt = new Date().toISOString();

        if (existingIndex >= 0) {
            projects[existingIndex] = project;
        } else {
            project.createdAt = project.createdAt || new Date().toISOString();
            projects.push(project);
        }

        this.saveProjects(projects);
        return project;
    }

    deleteProject(projectId: string): boolean {
        const projects = this.loadProjects();
        const filtered = projects.filter(p => p.id !== projectId);
        if (filtered.length < projects.length) {
            this.saveProjects(filtered);
            // Also delete associated chats
            const chats = this.loadChats().filter(c => c.projectId !== projectId);
            this.saveChats(chats);
            return true;
        }
        return false;
    }

    listProjects(): Project[] {
        return this.loadProjects().sort((a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
    }

    // ---------------------------------------------------------------------------
    // Project Files
    // ---------------------------------------------------------------------------

    addProjectFile(projectId: string, file: ProjectFile): Project | null {
        const project = this.getProject(projectId);
        if (!project) return null;

        project.files = project.files || [];
        project.files.push(file);
        return this.saveProject(project);
    }

    removeProjectFile(projectId: string, fileId: string): Project | null {
        const project = this.getProject(projectId);
        if (!project) return null;

        project.files = (project.files || []).filter(f => f.id !== fileId);
        return this.saveProject(project);
    }

    // ---------------------------------------------------------------------------
    // Artifacts
    // ---------------------------------------------------------------------------

    saveArtifact(filename: string, content: string): string {
        const filePath = path.join(this.artifactsDir, filename);
        writeFileSync(filePath, content, 'utf-8');
        return filePath;
    }

    getArtifact(filename: string): string | null {
        const filePath = path.join(this.artifactsDir, filename);
        if (!existsSync(filePath)) return null;
        return readFileSync(filePath, 'utf-8');
    }

    listArtifacts(): string[] {
        if (!existsSync(this.artifactsDir)) return [];
        return readdirSync(this.artifactsDir);
    }

    deleteArtifact(filename: string): boolean {
        const filePath = path.join(this.artifactsDir, filename);
        if (existsSync(filePath)) {
            unlinkSync(filePath);
            return true;
        }
        return false;
    }
}

// -----------------------------------------------------------------------------
// Singleton instance
// -----------------------------------------------------------------------------

let _dataStore: DataStore | null = null;

export function getDataStore(dataDir?: string): DataStore {
    if (!_dataStore) {
        _dataStore = new DataStore(dataDir);
    }
    return _dataStore;
}

export function createDataStore(dataDir: string): DataStore {
    return new DataStore(dataDir);
}
