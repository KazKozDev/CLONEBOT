/**
 * CLONEBOT - Claude Clone
 */

// =================================
// State
// =================================

const state = {
    isLoading: false,
    currentArtifact: null,
    model: 'gpt-oss:20b',
    userId: localStorage.getItem('userId') || 'user_' + Date.now(), // Уникальный ID пользователя
    deepThinking: false, // Deep thinking mode
    pendingAttachments: [], // [{file, name, type, dataUrl, base64}]
    activeSkill: null, // Currently activated skill for next message
};

// Сохраняем userId в localStorage
if (!localStorage.getItem('userId')) {
    localStorage.setItem('userId', state.userId);
}

// =================================
// Chat History State
// =================================

const chatState = {
    currentChatId: null,
    chats: [],
    messages: [], // {role: 'user'|'assistant', content: string}
    artifacts: [], // {path, title, type} — artifacts created in current chat
};

// =================================
// Memory Management
// =================================

async function handleMemoryCommand(command) {
    const cmd = command.toLowerCase().trim();

    if (!chatState.currentChatId) {
        showNotification('⚠️ Нет активного чата', 'warning');
        return;
    }

    try {
        if (cmd === '/compact') {
            // Сжатие истории
            const res = await fetch(`/api/memory/compact/${chatState.currentChatId}`, {
                method: 'POST',
            });
            const data = await res.json();

            if (data.success) {
                showNotification(`✅ Сжато ${data.removed_messages} сообщений`, 'success');
                // Перезагружаем чат
                await loadChat(chatState.currentChatId);
            }
        } else if (cmd === '/new' || cmd === '/reset') {
            // Очистка сессии
            const res = await fetch(`/api/memory/reset/${chatState.currentChatId}`, {
                method: 'POST',
            });
            const data = await res.json();

            if (data.success) {
                showNotification('✅ История чата очищена', 'success');
                // Очищаем локальное состояние
                chatState.messages = [];
                chatState.artifacts = [];
                document.getElementById('chat-messages').innerHTML = '';
            }
        } else {
            // Check if it's a skill invocation: /skill-name
            const skillName = cmd.substring(1);
            try {
                const skillRes = await fetch(`/api/skills/${skillName}/invoke`);
                if (skillRes.ok) {
                    const skillData = await skillRes.json();
                    showNotification(`Skill "${skillData.name}" activated`, 'info');
                    state.activeSkill = skillData;
                    return;
                } else {
                    showNotification(`Unknown command: ${command}`, 'error');
                }
            } catch (err2) {
                showNotification(`Unknown command: ${command}`, 'error');
            }
        }
    } catch (err) {
        console.error('Memory command error:', err);
        showNotification(`Ошибка выполнения команды: ${err.message}`, 'error');
    }
}

function showNotification(message, type = 'info') {
    // Простое уведомление
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 8px;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
        color: white;
        font-size: 14px;
        z-index: 10000;
        animation: slideIn 0.3s ease-out;
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transition = 'opacity 0.3s';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// =================================
// Chat Functions
// =================================

async function loadChats() {
    try {
        const res = await fetch('/api/chats');
        const data = await res.json();
        chatState.chats = data.chats || [];
        updateSidebarChats();
    } catch (err) {
        console.error('Failed to load chats:', err);
    }
}

async function saveCurrentChat() {
    if (chatState.messages.length === 0) return;

    // Ensure we have a chat ID
    if (!chatState.currentChatId) {
        chatState.currentChatId = `chat_${Date.now()}_${Math.floor(Math.random() * 9000 + 1000)}`;
    }

    // Generate title using LLM for the first save (when messages.length <= 2)
    let title = 'New chat';
    const firstUserMsg = chatState.messages.find(m => m.role === 'user');

    // Check if this is the first exchange (user + assistant messages)
    const isFirstExchange = chatState.messages.length === 2 && firstUserMsg;

    if (isFirstExchange) {
        // Generate title via LLM (используется быстрая модель на бэкенде)
        try {
            const titleRes = await fetch('/api/chats/generate-title', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userMessage: firstUserMsg.content
                    // model не передаём - бэкенд использует быструю модель автоматически
                }),
            });
            if (titleRes.ok) {
                const titleData = await titleRes.json();
                title = titleData.title || title;
            }
        } catch (err) {
            console.error('Failed to generate title:', err);
            // Fallback to first 50 chars
            title = firstUserMsg.content.substring(0, 50) + (firstUserMsg.content.length > 50 ? '...' : '');
        }
    } else if (firstUserMsg) {
        // For subsequent saves, use existing title or fallback
        const existingChat = chatState.chats.find(c => c.id === chatState.currentChatId);
        title = existingChat?.title || firstUserMsg.content.substring(0, 50) + (firstUserMsg.content.length > 50 ? '...' : '');
    }

    let projectId = null;
    if (typeof projectState !== 'undefined' && projectState.activeProject) {
        projectId = projectState.activeProject.id;
    }

    try {
        // Если это чат проекта - сохраняем в папку проекта
        if (projectId) {
            const payload = {
                id: chatState.currentChatId,
                title,
                messages: chatState.messages,
                artifacts: chatState.artifacts,
            };

            const res = await fetch(`/api/projects/${projectId}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                console.error('Failed to save project chat, status:', res.status);
                return;
            }
            const saved = await res.json();
            if (saved?.id) {
                chatState.currentChatId = saved.id;
            }
        } else {
            // Обычный чат - сохраняем в общий список (БЕЗ projectId)
            const payload = {
                id: chatState.currentChatId,
                title,
                messages: chatState.messages,
                artifacts: chatState.artifacts,
            };

            const res = await fetch('/api/chats', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                console.error('Failed to save chat, status:', res.status);
                return;
            }
            const saved = await res.json();
            const savedChat = saved?.chat;
            if (savedChat?.id) {
                chatState.currentChatId = savedChat.id;
            } else {
                console.warn('Unexpected /api/chats response shape:', saved);
            }
            await loadChats();
        }
    } catch (err) {
        console.error('Failed to save chat:', err);
    }
}

async function loadChat(chatId) {
    try {
        const res = await fetch(`/api/chats/${chatId}`);
        if (!res.ok) return false;
        const chat = await res.json();

        chatState.currentChatId = chat.id;
        chatState.messages = chat.messages || [];
        chatState.artifacts = chat.artifacts || [];

        return chat;
    } catch (err) {
        console.error('Failed to load chat:', err);
        return false;
    }
}

async function deleteChat(chatId, e) {
    if (e) {
        e.stopPropagation();
        e.preventDefault();
    }
    try {
        await fetch(`/api/chats/${chatId}`, { method: 'DELETE' });
        if (chatState.currentChatId === chatId) {
            startNewChat();
            if (typeof showChatView === 'function') showChatView();
        }
        await loadChats();
    } catch (err) {
        console.error('Failed to delete chat:', err);
    }
}

function startNewChat() {
    chatState.currentChatId = null;
    chatState.messages = [];
    chatState.artifacts = [];
    // Generate new chat ID for next save
    chatState.currentChatId = `chat_${Date.now()}_${Math.floor(Math.random() * 9000 + 1000)}`;
}

function updateSidebarChats() {
    const container = document.getElementById('sidebarChats');
    if (!container) return;

    const recentChats = chatState.chats.slice(0, 10);

    if (recentChats.length === 0) {
        container.innerHTML = '<div class="sidebar-empty">No chats</div>';
        return;
    }

    container.innerHTML = recentChats.map(chat => `
        <div class="history-item chat-history-item ${chat.id === chatState.currentChatId ? 'active' : ''}" onclick="navigateToChatById('${chat.id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
            </svg>
            <span>${escapeHtml(chat.title || 'New chat')}</span>
            <button class="chat-delete-btn" onclick="deleteChat('${chat.id}', event)" title="Удалить">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
            </button>
        </div>
    `).join('');
}

async function navigateToChatById(chatId) {
    const chat = await loadChat(chatId);
    if (!chat) return;

    // If chat has projectId, load that project context
    if (chat.projectId && typeof projectState !== 'undefined') {
        if (typeof selectProject === 'function') {
            await selectProject(chat.projectId);
        }
        if (projectState.activeProject) {
            showChatView(projectState.activeProject);
        } else {
            showChatView();
        }
    } else {
        if (typeof projectState !== 'undefined') {
            projectState.activeProject = null;
        }
        window.location.hash = '';
        showChatView();
    }

    // Restore messages to the DOM
    restoreChatMessages();
    updateSidebarChats();
}

function restoreChatMessages() {
    const inner = document.getElementById('chatMessagesInner');
    if (!inner) return;

    inner.innerHTML = '';
    for (const msg of chatState.messages) {
        if (msg.role === 'user') {
            const div = document.createElement('div');
            div.className = 'message user';
            div.innerHTML = `<div class="message-bubble">${escapeHtml(msg.content)}</div>`;
            inner.appendChild(div);
        } else if (msg.role === 'assistant') {
            const div = document.createElement('div');
            div.className = 'message assistant';

            // Find artifacts associated with this assistant turn
            // (artifacts from msg.artifacts if stored per-message, or render all at end)
            let artifactCards = '';
            if (msg.artifacts && msg.artifacts.length > 0) {
                artifactCards = msg.artifacts.map(a => {
                    const ti = fileTypes[a.type] || { label: (a.type || '').toUpperCase() };
                    return `
                        <div class="artifact-card" data-path="${a.path}" data-title="${escapeHtml(a.title)}" data-type="${a.type}">
                            <div class="artifact-card-icon">${icons.file}</div>
                            <div class="artifact-card-info">
                                <div class="artifact-card-title">${escapeHtml(a.title)}</div>
                                <div class="artifact-card-type">${ti.label}</div>
                            </div>
                            <button class="artifact-card-btn">Download</button>
                        </div>
                    `;
                }).join('');
            }

            div.innerHTML = `
                <div class="message-avatar">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                        <line x1="9" y1="9" x2="9.01" y2="9" />
                        <line x1="15" y1="9" x2="15.01" y2="9" />
                    </svg>
                </div>
                <div class="message-content">
                    <div class="response-text">${formatText(msg.content)}</div>
                    ${artifactCards}
                </div>
            `;
            inner.appendChild(div);
        }
    }
    scrollToBottom();
}

// Expose globally
window.navigateToChatById = navigateToChatById;
window.deleteChat = deleteChat;

// =================================
// DOM Elements
// =================================

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// Helper functions to get fresh references to critical elements
function getChatInput() {
    return document.getElementById('chatInput');
}

function getSendBtn() {
    return document.getElementById('sendBtn');
}

// Export globally for use in projects.js
window.getChatInput = getChatInput;
window.getSendBtn = getSendBtn;

const elements = {
    chatMessages: $('#chatMessages'),
    chatMessagesInner: $('#chatMessagesInner'),
    chatInput: $('#chatInput'),
    sendBtn: $('#sendBtn'),
    modelName: $('#modelName'),
    artifactPanel: $('#artifactPanel'),
    artifactName: $('#artifactName'),
    artifactType: $('#artifactType'),
    artifactIframe: $('#artifactIframe'),
    artifactCode: $('#artifactCode'),
    lineNumbers: $('#lineNumbers'),
    codeContent: $('#codeContent'),
    artifactEmpty: $('#artifactEmpty'),
};

function refreshArtifactElements() {
    elements.artifactPanel = $('#artifactPanel');
    elements.artifactName = $('#artifactName');
    elements.artifactType = $('#artifactType');
    elements.artifactIframe = $('#artifactIframe');
    elements.artifactCode = $('#artifactCode');
    elements.lineNumbers = $('#lineNumbers');
    elements.codeContent = $('#codeContent');
    elements.artifactEmpty = $('#artifactEmpty');
}

window.refreshArtifactElements = refreshArtifactElements;

// =================================
// Icon SVGs
// =================================

const icons = {
    file: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <polyline points="14,2 14,8 20,8"/>
    </svg>`,
    code: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="16,18 22,12 16,6"/>
        <polyline points="8,6 2,12 8,18"/>
    </svg>`,
    check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20,6 9,17 4,12"/>
    </svg>`,
    loading: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="step-icon loading">
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
    </svg>`,
    chevron: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M6 9l6 6 6-6"/>
    </svg>`,
    copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="9" y="9" width="13" height="13" rx="2"/>
        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
    </svg>`,
    thumbUp: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/>
    </svg>`,
    thumbDown: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3zm7-13h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17"/>
    </svg>`,
    retry: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M1 4v6h6M23 20v-6h-6"/>
        <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15"/>
    </svg>`,
    message: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
    </svg>`,
};

// =================================
// File type mapping
// =================================

const fileTypes = {
    html: { label: 'HTML', useIframe: true, lang: 'markup' },
    js: { label: 'JavaScript', useIframe: false, lang: 'javascript' },
    py: { label: 'Python', useIframe: false, lang: 'python' },
    css: { label: 'CSS', useIframe: false, lang: 'css' },
    json: { label: 'JSON', useIframe: false, lang: 'json' },
    yaml: { label: 'YAML', useIframe: false, lang: 'yaml' },
    yml: { label: 'YAML', useIframe: false, lang: 'yaml' },
    md: { label: 'Markdown', useIframe: false, lang: 'markdown' },
    txt: { label: 'Text', useIframe: false, lang: 'none' },
    svg: { label: 'SVG', useIframe: true, lang: 'markup' },
    csv: { label: 'CSV', useIframe: false, lang: 'none' },
    mmd: { label: 'Mermaid', useIframe: true, lang: 'none' },
    jsx: { label: 'React', useIframe: true, lang: 'jsx' },
    ts: { label: 'TypeScript', useIframe: false, lang: 'typescript' },
    tsx: { label: 'TSX', useIframe: false, lang: 'tsx' },
    sh: { label: 'Shell', useIframe: false, lang: 'bash' },
    bash: { label: 'Bash', useIframe: false, lang: 'bash' },
    sql: { label: 'SQL', useIframe: false, lang: 'sql' },
};

// =================================
// API
// =================================

const DEFAULT_MODEL = 'gpt-oss:20b';

async function fetchModels() {
    const modelList = $('#modelList');
    const modelName = $('#modelName');

    // Check if elements exist
    if (!modelList || !modelName) {
        console.warn('[fetchModels] Model dropdown elements not found');
        return;
    }

    // Show loading state
    modelList.innerHTML = '<div class="model-option-loading">Loading models...</div>';

    try {
        const res = await fetch('/api/models');
        const data = await res.json();

        if (data.models?.length) {
            // Check if default model exists in the list
            const hasDefault = data.models.includes(DEFAULT_MODEL);

            // Set current model
            state.model = hasDefault ? DEFAULT_MODEL : data.models[0];
            modelName.textContent = state.model;

            // Render model options
            modelList.innerHTML = data.models.map(model => `
                <div class="model-option${model === state.model ? ' selected' : ''}" data-model="${model}">
                    ${model}
                </div>
            `).join('');
        } else {
            modelList.innerHTML = '<div class="model-option-loading">No models available</div>';
        }
    } catch (err) {
        console.error('Failed to fetch models:', err);
        modelList.innerHTML = `
            <div class="model-option selected" data-model="${DEFAULT_MODEL}">${DEFAULT_MODEL}</div>
        `;
        state.model = DEFAULT_MODEL;
        modelName.textContent = DEFAULT_MODEL;
    }
}

// fetchArtifacts removed — artifacts are now tracked per-chat

async function sendMessage(prompt, options = {}) {
    if (state.isLoading || !prompt.trim()) return;

    console.log('[sendMessage] Starting...', { prompt: prompt.substring(0, 50) });

    // Обработка команд памяти
    const trimmedPrompt = prompt.trim();
    if (trimmedPrompt.startsWith('/')) {
        await handleMemoryCommand(trimmedPrompt);
        return;
    }

    state.isLoading = true;
    const chatInput = getChatInput();
    const sendBtn = getSendBtn();

    console.log('[sendMessage] Elements found:', { chatInput: !!chatInput, sendBtn: !!sendBtn });

    if (sendBtn) {
        sendBtn.setAttribute('disabled', 'disabled');
        sendBtn.disabled = true;
    }
    if (chatInput) {
        chatInput.setAttribute('disabled', 'disabled');
        chatInput.disabled = true;
        console.log('[sendMessage] Input disabled, disabled =', chatInput.disabled, 'hasAttribute =', chatInput.hasAttribute('disabled'));
    }

    // Capture attachments before clearing
    const attachments = [...state.pendingAttachments];
    clearAttachments();

    // Track user message in chat history
    if (!options.skipUserMessage) {
        addUserMessage(prompt, attachments);
        chatState.messages.push({ role: 'user', content: prompt });
    }

    // Add assistant message container
    const msgDiv = addAssistantMessage();
    const contentDiv = msgDiv.querySelector('.message-content');

    let assistantText = '';
    let turnArtifacts = [];

    try {
        // Check if we are in a project content
        let projectId = null;
        if (typeof projectState !== 'undefined' && projectState.activeProject) {
            projectId = projectState.activeProject.id;
        }

        // Prepare images for Ollama (base64 encoded)
        const images = attachments
            .filter(a => a.isImage)
            .map(a => a.base64);

        // Inject active skill if set
        let skillPrefix = '';
        if (state.activeSkill) {
            skillPrefix = `[SKILL: ${state.activeSkill.name}]\n${state.activeSkill.content}\n\n---\nUser request:\n`;
            state.activeSkill = null;
        }

        // Prepare text file contents to append to prompt
        const textFiles = attachments.filter(a => !a.isImage);
        let fullPrompt = skillPrefix ? skillPrefix + prompt : prompt;
        if (textFiles.length > 0) {
            const fileContents = textFiles.map(a => {
                try {
                    return `\n--- ${a.name} ---\n${atob(a.base64)}\n`;
                } catch {
                    return `\n--- ${a.name} ---\n[binary file]\n`;
                }
            }).join('');
            fullPrompt = prompt + '\n\nAttached files:' + fileContents;
        }

        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: fullPrompt,
                model: state.model,
                projectId,
                chatId: chatState.currentChatId,
                userId: state.userId,
                messages: chatState.messages,
                deepThinking: state.deepThinking,
                images: images.length > 0 ? images : undefined,
            }),
        });

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        // Deep thinking state
        let thinkingBlock = null;
        let currentRound = null;
        let isDeepThinking = state.deepThinking;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const data = JSON.parse(line);

                    // Handle deep thinking events
                    if (isDeepThinking) {
                        if (data.type === 'round_start') {
                            // Initialize thinking block if needed
                            if (!thinkingBlock) {
                                thinkingBlock = createThinkingBlock();
                                contentDiv.appendChild(thinkingBlock);
                            }

                            // Add new round
                            currentRound = addThinkingRound(thinkingBlock, data);
                        }
                        else if (data.type === 'content' && currentRound) {
                            // Stream content to current round
                            updateThinkingRound(currentRound, data.content);
                        }
                        else if (data.type === 'round_end') {
                            finalizeThinkingRound(currentRound);
                            currentRound = null;
                        }
                        else if (data.type === 'done') {
                            // Final answer from arbiter
                            const result = data.result;
                            if (result && result.final_answer) {
                                assistantText = result.final_answer;

                                // Complete thinking block
                                if (thinkingBlock) {
                                    completeThinkingBlock(thinkingBlock);
                                }

                                // Add final answer after thinking block
                                const answerDiv = document.createElement('div');
                                answerDiv.className = 'response-text';
                                answerDiv.dataset.rawText = assistantText;
                                renderResponse(answerDiv);
                                contentDiv.appendChild(answerDiv);

                                // Add message actions
                                addMessageActions(contentDiv);
                            }
                        }
                    } else {
                        // Regular mode
                        if (data.type === 'text') {
                            assistantText += data.content;
                        }
                        if (data.type === 'artifact') {
                            const ext = data.path.split('.').pop();
                            const artifact = { path: data.path, title: data.title, type: ext };
                            turnArtifacts.push(artifact);
                            chatState.artifacts.push(artifact);
                        }
                        handleStreamData(data, contentDiv);
                    }
                } catch (e) { }
            }
        }

        // For regular mode, render the response
        if (!isDeepThinking) {
            // Add message actions
            addMessageActions(contentDiv);
        }

        // Save assistant message (with its artifacts) and persist chat
        const assistantMsg = { role: 'assistant', content: assistantText };
        if (turnArtifacts.length > 0) {
            assistantMsg.artifacts = turnArtifacts;
        }
        chatState.messages.push(assistantMsg);
        await saveCurrentChat();

    } catch (err) {
        console.error('[sendMessage] Error:', err);
        contentDiv.innerHTML = `<p style="color: #ef4444">Error: ${err.message}</p>`;
    } finally {
        // Always re-enable input, even if there's an error
        console.log('[sendMessage] Finally block - re-enabling input');
        state.isLoading = false;

        const chatInputFinal = getChatInput();
        const sendBtnFinal = getSendBtn();

        console.log('[sendMessage] Final elements:', { chatInput: !!chatInputFinal, sendBtn: !!sendBtnFinal });

        if (sendBtnFinal) {
            sendBtnFinal.removeAttribute('disabled');
            sendBtnFinal.disabled = false;
            console.log('[sendMessage] Send button enabled');
        }

        if (chatInputFinal) {
            chatInputFinal.removeAttribute('disabled');
            chatInputFinal.disabled = false;
            console.log('[sendMessage] Input enabled, disabled =', chatInputFinal.disabled, 'hasAttribute =', chatInputFinal.hasAttribute('disabled'));

            // Force focus with delay
            setTimeout(() => {
                const input = getChatInput();
                if (input) {
                    input.removeAttribute('disabled');
                    input.disabled = false;
                    input.focus();
                    console.log('[sendMessage] Input re-enabled and focused, can type:', !input.disabled);
                }
            }, 100);
        }

        console.log('[sendMessage] Completed');
    }
}

// Old handleStreamData removed — replaced by version below with renderResponse

// =================================
// UI Functions
// =================================

function addUserMessage(text, attachments = []) {
    const div = document.createElement('div');
    div.className = 'message user';

    let attachmentHtml = '';
    if (attachments.length > 0) {
        const previews = attachments.map(a => {
            if (a.isImage) {
                return `<img class="msg-attachment-img" src="${a.dataUrl}" alt="${escapeHtml(a.name)}">`;
            }
            return `<span class="msg-attachment-file">${escapeHtml(a.name)}</span>`;
        }).join('');
        attachmentHtml = `<div class="msg-attachments">${previews}</div>`;
    }

    div.innerHTML = `<div class="message-bubble">${attachmentHtml}${escapeHtml(text)}</div>`;
    elements.chatMessagesInner.appendChild(div);
    scrollToBottom();
}

function addAssistantMessage() {
    const div = document.createElement('div');
    div.className = 'message assistant';
    div.innerHTML = `
        <div class="message-avatar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                <line x1="9" y1="9" x2="9.01" y2="9" />
                <line x1="15" y1="9" x2="15.01" y2="9" />
            </svg>
        </div>
        <div class="message-content">
            <div class="response-text"></div>
        </div>
    `;
    elements.chatMessagesInner.appendChild(div);
    scrollToBottom();
    return div;
}

// =================================
// Deep Thinking UI Functions
// =================================

function createThinkingBlock() {
    const block = document.createElement('div');
    block.className = 'thinking-block open';
    block.innerHTML = `
        <div class="thinking-header">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 18l6-6-6-6"/>
            </svg>
            <span class="thinking-header-title">Extended thinking</span>
            <span class="thinking-header-badge">In progress...</span>
        </div>
        <div class="thinking-content"></div>
    `;

    // Toggle on header click
    const header = block.querySelector('.thinking-header');
    header.addEventListener('click', () => {
        block.classList.toggle('open');
    });

    return block;
}

function addThinkingRound(thinkingBlock, data) {
    const content = thinkingBlock.querySelector('.thinking-content');

    const round = document.createElement('div');
    round.className = 'thinking-round';
    round.dataset.role = data.role;
    round.dataset.roundNumber = data.round;

    const roleColors = {
        'solver': 'solver',
        'critic': 'critic',
        'arbiter': 'arbiter'
    };

    const roleClass = roleColors[data.role] || '';

    round.innerHTML = `
        <div class="thinking-round-header">
            <span class="thinking-round-role ${roleClass}">${data.role}</span>
            <span class="thinking-round-label">${data.label || `Round ${data.round}`}</span>
        </div>
        <div class="thinking-round-content">
            <span class="thinking-loading">Thinking</span>
        </div>
    `;

    content.appendChild(round);
    scrollToBottom();

    return round;
}

function updateThinkingRound(round, content) {
    const contentDiv = round.querySelector('.thinking-round-content');

    // Remove loading indicator if present
    const loading = contentDiv.querySelector('.thinking-loading');
    if (loading) {
        loading.remove();
    }

    // Accumulate raw text and show plain text during streaming
    if (!round.dataset.rawText) round.dataset.rawText = '';
    round.dataset.rawText += content;
    contentDiv.textContent = round.dataset.rawText;

    scrollToBottom();
}

function finalizeThinkingRound(round) {
    // Render accumulated text as markdown when round is complete
    if (round && round.dataset.rawText) {
        const contentDiv = round.querySelector('.thinking-round-content');
        contentDiv.innerHTML = formatText(round.dataset.rawText);
    }
}

function completeThinkingBlock(thinkingBlock) {
    const badge = thinkingBlock.querySelector('.thinking-header-badge');
    if (badge) {
        badge.textContent = 'Complete';
        badge.style.background = 'rgba(16, 185, 129, 0.2)';
        badge.style.color = '#10b981';
    }
}

function renderResponse(container) {
    const rawText = container.dataset.rawText || '';

    // Check for thinking block
    const thinkStart = '<think>';
    const thinkEnd = '</think>';

    let html = '';

    const thinkRegex = /<think>([\s\S]*?)(?:<\/think>|$)/;
    const match = rawText.match(thinkRegex);

    if (match) {
        const thoughtContent = match[1];
        const isThinkingClosed = rawText.includes(thinkEnd);
        const isOpen = container.dataset.thinkingOpen === 'true'; // Default closed? Or check state.

        // Render thinking block
        // Note: icons.chevron is defined in global scope
        html += `
            <div class="thinking-block ${isOpen ? 'open' : ''}">
                <div class="thinking-header" onclick="this.closest('.thinking-block').classList.toggle('open'); this.closest('.response-text').dataset.thinkingOpen = this.closest('.thinking-block').classList.contains('open')">
                    ${icons.chevron}
                    Thinking Process
                </div>
                <div class="thinking-content">${escapeHtml(thoughtContent)}</div>
            </div>
        `;

        // Render rest of the text
        if (isThinkingClosed) {
            const parts = rawText.split(thinkEnd);
            if (parts.length > 1) {
                const rest = parts.slice(1).join(thinkEnd);
                html += formatText(rest);
            }
        }
    } else {
        html += formatText(rawText);
    }

    container.innerHTML = html;
}

// Update handleStreamData to use renderResponse
function handleStreamData(data, contentDiv) {
    const responseText = contentDiv.querySelector('.response-text');
    const removeSteps = () => {
        const steps = contentDiv.querySelector('.steps-container');
        if (steps) steps.remove();
    };

    switch (data.type) {
        case 'generating':
            // Model started generating a tool call — show early indicator
            if (!contentDiv.querySelector('.steps-container')) {
                contentDiv.innerHTML += `
                    <div class="steps-container">
                        <div class="step-item">
                            <div class="step-header">
                                ${icons.loading}
                                <span class="step-text">Writing code...</span>
                            </div>
                        </div>
                    </div>
                `;
            }
            break;

        case 'tool_call': {
            // Update the generating step or create a new one
            const existingStep = contentDiv.querySelector('.steps-container .step-text');
            const toolName = data.name.replace('create_', '').replace('_artifact', '').replace(/_/g, ' ');
            if (existingStep) {
                existingStep.textContent = `Creating ${toolName}...`;
            } else {
                contentDiv.innerHTML += `
                    <div class="steps-container">
                        <div class="step-item">
                            <div class="step-header">
                                ${icons.loading}
                                <span class="step-text">Creating ${toolName}...</span>
                            </div>
                        </div>
                    </div>
                `;
            }
            break;
        }

        case 'tool_result':
        case 'tool_complete':
            // Tool execution completed - remove the loading indicator
            removeSteps();
            break;

        case 'artifact': {
            // Update step to complete
            const loadingIcon = contentDiv.querySelector('.step-icon.loading');
            if (loadingIcon) {
                loadingIcon.outerHTML = `<svg class="step-icon check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20,6 9,17 4,12"/>
                </svg>`;
                const stepText = contentDiv.querySelector('.step-text');
                if (stepText) stepText.textContent = 'Created file';
            }

            const ext = data.path.split('.').pop();
            const typeInfo = fileTypes[ext] || { label: ext.toUpperCase() };

            contentDiv.innerHTML += `
                <div class="artifact-card" data-path="${data.path}" data-title="${data.title}" data-type="${ext}">
                    <div class="artifact-card-icon">${icons.file}</div>
                    <div class="artifact-card-info">
                        <div class="artifact-card-title">${data.title}</div>
                        <div class="artifact-card-type">${typeInfo.label}</div>
                    </div>
                    <button class="artifact-card-btn">Download</button>
                </div>
            `;

            // Auto-open
            openArtifact(data.path, data.title, ext);
            break;
        }

        case 'text':
            // Remove loading steps if they were used for initial loading (not current arch)
            // But verify we aren't interrupting a tool execution
            if (responseText) {
                const steps = contentDiv.querySelector('.steps-container');
                const stepText = steps ? steps.querySelector('.step-text') : null;

                // Only remove if it's NOT a tool step (tool steps contain "Creating")
                if (steps && (!stepText || !stepText.textContent.includes('Creating'))) {
                    removeSteps();
                }

                if (!responseText.dataset.rawText) responseText.dataset.rawText = '';
                responseText.dataset.rawText += data.content;
                renderResponse(responseText);
            }
            break;

        case 'error':
            removeSteps();
            contentDiv.innerHTML += `<p style="color: #ef4444">${data.message}</p>`;
            break;

        case 'done':
            removeSteps();
            scrollToBottom();
            break;
    }
    scrollToBottom();
}

function addMessageActions(contentDiv) {
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'message-actions';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'action-btn';
    copyBtn.title = 'Copy';
    copyBtn.innerHTML = icons.copy;
    copyBtn.onclick = () => copyMessage(copyBtn);

    const goodBtn = document.createElement('button');
    goodBtn.className = 'action-btn';
    goodBtn.title = 'Good';
    goodBtn.innerHTML = icons.thumbUp;
    goodBtn.onclick = () => toggleFeedback(goodBtn, 'good');

    const badBtn = document.createElement('button');
    badBtn.className = 'action-btn';
    badBtn.title = 'Bad';
    badBtn.innerHTML = icons.thumbDown;
    badBtn.onclick = () => toggleFeedback(badBtn, 'bad');

    const retryBtn = document.createElement('button');
    retryBtn.className = 'action-btn';
    retryBtn.title = 'Retry';
    retryBtn.innerHTML = icons.retry;
    retryBtn.onclick = () => retryMessage(retryBtn);

    actionsDiv.appendChild(copyBtn);
    actionsDiv.appendChild(goodBtn);
    actionsDiv.appendChild(badBtn);
    actionsDiv.appendChild(retryBtn);

    contentDiv.appendChild(actionsDiv);
}

async function copyMessage(btn) {
    const messageContent = btn.closest('.message-content');
    const textDiv = messageContent.querySelector('.response-text');
    // Get text content, ignoring thinking blocks if closed (or just raw text?)
    // Let's get raw text if available or innerText
    const text = textDiv.dataset.rawText || textDiv.innerText;

    try {
        await navigator.clipboard.writeText(text);

        // Visual feedback
        const originalIcon = btn.innerHTML;
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`;
        setTimeout(() => {
            btn.innerHTML = originalIcon;
        }, 2000);
    } catch (err) {
        console.error('Failed to copy info: ', err);
    }
}

function toggleFeedback(btn, type) {
    btn.classList.toggle('active');
    // Optional: Send feedback to server
    console.log(`Feedback ${type} toggled`);
}

function retryMessage(btn) {
    console.log('Retry clicked');
    // Find the message container (the assistant message)
    const messageDiv = btn.closest('.message.assistant');
    if (!messageDiv) {
        console.error('No assistant message found');
        return;
    }

    // Find the previous user message
    let prevSibling = messageDiv.previousElementSibling;
    while (prevSibling && !prevSibling.classList.contains('user')) {
        prevSibling = prevSibling.previousElementSibling;
        if (!prevSibling) break;
    }

    if (prevSibling && prevSibling.classList.contains('user')) {
        const contentEl = prevSibling.querySelector('.message-content');
        const prompt = contentEl ? contentEl.textContent.trim() : '';
        console.log('Retrying with prompt:', prompt);

        if (!prompt) {
            console.error('Empty prompt');
            return;
        }

        // Remove the assistant message we are retrying
        messageDiv.remove();

        // Ensure state is clean before retrying
        state.isLoading = false;
        const sendBtn = getSendBtn();
        const chatInput = getChatInput();
        if (sendBtn) {
            sendBtn.removeAttribute('disabled');
            sendBtn.disabled = false;
        }
        if (chatInput) {
            chatInput.removeAttribute('disabled');
            chatInput.disabled = false;
        }

        // Send request again without adding user bubble
        sendMessage(prompt, { skipUserMessage: true });
    } else {
        console.error('No user message found before assistant message');
    }
}

// Configure marked once on load
if (window.marked) {
    marked.use({
        breaks: true,
        gfm: true,
        renderer: {
            code(token) {
                const text = token.text || token;
                const lang = token.lang || '';
                const language = lang && window.Prism && Prism.languages[lang] ? lang : '';
                if (language) {
                    const highlighted = Prism.highlight(text, Prism.languages[language], language);
                    return `<pre><code class="language-${language}">${highlighted}</code></pre>`;
                }
                return `<pre><code>${escapeHtml(text)}</code></pre>`;
            }
        }
    });
}

function formatText(text) {
    if (!text) return '';
    if (window.marked) {
        return marked.parse(text);
    }
    // Fallback if marked not loaded
    return text.split('\n\n').map(p => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Format a date string as relative time (e.g., "2 hours ago")
 * @param {string} dateString - ISO date string
 * @returns {string} Relative time string
 */
function formatRelativeTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return 'just now';
    if (diffMin < 60) return `${diffMin} min ago`;
    if (diffHour < 24) return `${diffHour} hour${diffHour > 1 ? 's' : ''} ago`;
    if (diffDay < 7) return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`;

    return date.toLocaleDateString();
}

function scrollToBottom() {
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

// renderArtifactsList removed — artifacts are displayed inline in chat

async function openArtifact(path, title, type) {
    refreshArtifactElements();
    state.currentArtifact = { path, title, type };

    const typeInfo = fileTypes[type] || { label: type.toUpperCase(), useIframe: false };

    elements.artifactName.textContent = title;
    elements.artifactType.textContent = typeInfo.label;
    elements.artifactPanel.classList.add('open');

    if (elements.artifactEmpty) {
        elements.artifactEmpty.style.display = 'none';
    }

    // Show resize handle
    $('#resizeHandle').classList.add('visible');

    try {
        const res = await fetch(`/api/artifact/${path.split('/').pop()}`);
        const data = await res.json();

        if (typeInfo.useIframe) {
            elements.artifactIframe.style.display = 'block';
            elements.artifactCode.style.display = 'none';
            elements.artifactIframe.src = path;
        } else {
            elements.artifactIframe.style.display = 'none';
            elements.artifactCode.style.display = 'block';
            renderCode(data.content, typeInfo.lang || 'javascript');
        }
    } catch (err) {
        elements.artifactIframe.style.display = 'none';
        elements.artifactCode.style.display = 'block';
        elements.codeContent.textContent = 'Failed to load content';
    }
}

function renderCode(content, language = 'javascript') {
    const lines = content.split('\n');
    elements.lineNumbers.innerHTML = lines.map((_, i) => i + 1).join('<br>');

    // Create a temporary code element for Prism highlighting
    const codeElement = document.createElement('code');
    codeElement.className = `language-${language}`;
    codeElement.textContent = content;

    // Apply Prism highlighting if available
    if (window.Prism && language !== 'none') {
        const highlighted = Prism.highlight(content, Prism.languages[language] || Prism.languages.javascript, language);
        elements.codeContent.innerHTML = highlighted;
    } else {
        elements.codeContent.textContent = content;
    }
}

function closeArtifact() {
    refreshArtifactElements();
    elements.artifactIframe.src = '';
    state.currentArtifact = null;

    // Hide resize handle
    $('#resizeHandle').classList.add('visible');

    if (elements.artifactIframe) {
        elements.artifactIframe.style.display = 'none';
    }
    if (elements.artifactCode) {
        elements.artifactCode.style.display = 'none';
    }
    if (elements.codeContent) {
        elements.codeContent.textContent = '';
    }
    if (elements.lineNumbers) {
        elements.lineNumbers.textContent = '';
    }
    if (elements.artifactEmpty) {
        elements.artifactEmpty.style.display = 'flex';
    }
}

// =================================
// Model Dropdown
// =================================

function initModelDropdown() {
    const modelDropdown = $('#modelDropdown');
    const modelSelector = $('#modelSelector');
    const modelList = $('#modelList');
    const modelName = $('#modelName');

    if (!modelSelector || !modelDropdown || !modelList) return;

    // Toggle dropdown
    modelSelector.addEventListener('click', (e) => {
        e.stopPropagation();
        modelDropdown.classList.toggle('open');
    });

    // Select model
    modelList.addEventListener('click', (e) => {
        const option = e.target.closest('.model-option');
        if (option && !option.classList.contains('model-option-loading')) {
            const model = option.dataset.model;

            // Update state
            state.model = model;
            if (modelName) modelName.textContent = model;

            // Update UI
            modelList.querySelectorAll('.model-option').forEach(opt => {
                opt.classList.toggle('selected', opt.dataset.model === model);
            });

            // Close dropdown
            modelDropdown.classList.remove('open');
        }
    });

    // Close dropdown on outside click
    document.addEventListener('click', () => {
        modelDropdown.classList.remove('open');
    });

    // Prevent dropdown from closing when clicking inside
    const modelMenu = $('#modelMenu');
    if (modelMenu) {
        modelMenu.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }
}

// =================================
// Deep Thinking Toggle
// =================================

function initDeepThinking() {
    const deepThinkingToggle = $('#deepThinkingToggle');

    if (!deepThinkingToggle) return;

    // Load saved state from localStorage
    const savedState = localStorage.getItem('deepThinking');
    if (savedState === 'true') {
        state.deepThinking = true;
        deepThinkingToggle.classList.add('active');
    }

    // Toggle deep thinking mode
    deepThinkingToggle.addEventListener('click', () => {
        state.deepThinking = !state.deepThinking;
        deepThinkingToggle.classList.toggle('active', state.deepThinking);

        // Save state to localStorage
        localStorage.setItem('deepThinking', state.deepThinking);

        // Visual feedback
        if (state.deepThinking) {
            showNotification('🧠 Extended thinking enabled', 'info');
        } else {
            showNotification('💬 Regular mode', 'info');
        }
    });
}

// =================================
// Resize Handle
// =================================

function initResizeHandle() {
    const resizeHandle = $('#resizeHandle');
    const artifactPanel = elements.artifactPanel;
    const mainContainer = $('.main');

    if (!resizeHandle || !artifactPanel) return;

    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    resizeHandle.addEventListener('mousedown', (e) => {
        if (!artifactPanel.classList.contains('open')) return;

        isResizing = true;
        startX = e.clientX;
        startWidth = artifactPanel.offsetWidth;

        // Add visual feedback
        resizeHandle.classList.add('dragging');
        artifactPanel.classList.add('resizing');
        document.body.classList.add('resizing');

        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;

        // Calculate new width based on mouse movement
        // Moving left increases width, moving right decreases
        const deltaX = startX - e.clientX;
        let newWidth = startWidth + deltaX;

        // Get container width for percentage calculations
        const containerWidth = mainContainer.offsetWidth;

        // Clamp width between min and max
        const minWidth = 300;
        const maxWidth = containerWidth * 0.8;
        newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

        // Apply new width
        artifactPanel.style.width = newWidth + 'px';
    });

    document.addEventListener('mouseup', () => {
        if (!isResizing) return;

        isResizing = false;
        resizeHandle.classList.remove('dragging');
        artifactPanel.classList.remove('resizing');
        document.body.classList.remove('resizing');
    });

    // Also handle mouse leaving the window
    document.addEventListener('mouseleave', () => {
        if (isResizing) {
            isResizing = false;
            resizeHandle.classList.remove('dragging');
            artifactPanel.classList.remove('resizing');
            document.body.classList.remove('resizing');
        }
    });
}

// =================================
// New Chat Navigation
// =================================

function startNewChatAndNavigate() {
    startNewChat();
    if (typeof projectState !== 'undefined') {
        projectState.activeProject = null;
    }
    window.location.hash = '';
    showChatView();
    updateSidebarChats();
}

window.startNewChatAndNavigate = startNewChatAndNavigate;

// =================================
// File Attachments
// =================================

function handleChatFileSelect(files) {
    console.log('[Attachment] Files selected:', files.length);
    if (!files || !files.length) return;

    for (const file of files) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target.result;
            const base64 = dataUrl.split(',')[1];
            const isImage = file.type.startsWith('image/');

            state.pendingAttachments.push({
                file,
                name: file.name,
                type: file.type,
                isImage,
                dataUrl,
                base64,
            });
            console.log('[Attachment] Added:', file.name, 'Total:', state.pendingAttachments.length);
            renderAttachmentPreviews();
        };
        reader.readAsDataURL(file);
    }
}

function removeAttachment(index) {
    state.pendingAttachments.splice(index, 1);
    renderAttachmentPreviews();
}

function renderAttachmentPreviews() {
    const container = document.getElementById('chatAttachments');
    if (!container) return; // Silent return as element is removed
    console.log('[Attachment] Rendering previews, container exists, count:', state.pendingAttachments.length);

    if (state.pendingAttachments.length === 0) {
        container.innerHTML = '';
        container.style.display = 'none';
        return;
    }

    container.style.display = 'flex';
    container.innerHTML = state.pendingAttachments.map((att, i) => {
        if (att.isImage) {
            return `<div class="attachment-preview">
                <img src="${att.dataUrl}" alt="${escapeHtml(att.name)}">
                <button class="attachment-remove" onclick="removeAttachment(${i})">&times;</button>
                <span class="attachment-name">${escapeHtml(att.name)}</span>
            </div>`;
        } else {
            return `<div class="attachment-preview attachment-file">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                    <polyline points="14,2 14,8 20,8"/>
                </svg>
                <button class="attachment-remove" onclick="removeAttachment(${i})">&times;</button>
                <span class="attachment-name">${escapeHtml(att.name)}</span>
            </div>`;
        }
    }).join('');
}

function clearAttachments() {
    state.pendingAttachments = [];
    renderAttachmentPreviews();
    const fileInput = document.getElementById('chatFileInput');
    if (fileInput) fileInput.value = '';
}

// Export to window for onclick handlers
// =================================
// File Attachments Init
// =================================

// Export functions to window
window.removeAttachment = removeAttachment;
window.handleChatFileSelect = handleChatFileSelect;

// =================================
// Init
// =================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('[Init] DOM Content Loaded');

    // Initialize all UI components
    initModelDropdown();
    initResizeHandle();
    initDeepThinking();

    // File attachment input - handled inline or via simple global
    // initAttachments();

    // Set up chat input event listeners
    const sendBtn = getSendBtn();
    const chatInput = getChatInput();

    console.log('[Init] Setting up event listeners', { sendBtn: !!sendBtn, chatInput: !!chatInput });

    if (sendBtn) {
        sendBtn.addEventListener('click', () => {
            const input = getChatInput();
            if (!input) {
                console.warn('[Init] Chat input not found on send click');
                return;
            }

            const prompt = input.value.trim();
            if (prompt) {
                console.log('[Init] Sending message from button click');
                input.value = '';
                input.style.height = 'auto';
                sendMessage(prompt);
            }
        });
    }

    if (chatInput) {
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const btn = getSendBtn();
                if (btn) {
                    console.log('[Init] Sending message from Enter key');
                    btn.click();
                }
            }
        });

        chatInput.addEventListener('input', (e) => {
            const input = e.target;
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 200) + 'px';
        });
    }

    const closeBtn = $('#closeArtifact');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeArtifact);
    }

    const copyBtn = $('#copyBtn');
    if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
            if (!state.currentArtifact) return;
            try {
                const res = await fetch(`/api/artifact/${state.currentArtifact.path.split('/').pop()}`);
                const data = await res.json();
                await navigator.clipboard.writeText(data.content);
            } catch (err) { }
        });
    }

    // Artifact card clicks
    const chatMessagesInner = $('#chatMessagesInner');
    if (chatMessagesInner) {
        chatMessagesInner.addEventListener('click', (e) => {
            const card = e.target.closest('.artifact-card');
            if (!card) return;

            const path = card.dataset.path;
            const title = card.dataset.title;
            const type = card.dataset.type;

            if (e.target.closest('.artifact-card-btn')) {
                window.open(path, '_blank');
            } else {
                openArtifact(path, title, type);
            }
        });
    }

    // Load data
    fetchModels();
    loadChats();
    startNewChat(); // Initialize with a fresh chat ID

    // Focus chat input after DOM is ready
    if (chatInput) {
        chatInput.focus();
    }

    console.log('[Init] Initialization complete');
});


// =================================
// Settings
// =================================

function openSettings() {
    const overlay = document.getElementById('settingsOverlay');
    overlay.classList.add('open');

    // Populate fields
    const modelSelect = document.getElementById('settingsDefaultModel');
    modelSelect.innerHTML = '';
    const modelList = document.getElementById('modelList');
    if (modelList) {
        modelList.querySelectorAll('.model-option').forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.dataset.model;
            option.textContent = opt.dataset.model;
            if (opt.dataset.model === state.model) option.selected = true;
            modelSelect.appendChild(option);
        });
    }
    // fallback: add current model if list is empty
    if (modelSelect.options.length === 0) {
        const option = document.createElement('option');
        option.value = state.model;
        option.textContent = state.model;
        option.selected = true;
        modelSelect.appendChild(option);
    }

    document.getElementById('settingsDeepThinking').checked = state.deepThinking;
    document.getElementById('settingsUserId').value = state.userId;

    // Load MCP servers
    loadMcpServers();

    // Load memory stats
    loadMemoryStats();

    // Load skills
    loadSkills();

    // Load soul data
    loadSoulData();
}

function closeSettings() {
    // Save settings before closing
    const modelSelect = document.getElementById('settingsDefaultModel');
    if (modelSelect.value && modelSelect.value !== state.model) {
        state.model = modelSelect.value;
        const modelName = document.getElementById('modelName');
        if (modelName) modelName.textContent = state.model;
        localStorage.setItem('selectedModel', state.model);
    }

    const dtCheck = document.getElementById('settingsDeepThinking');
    if (dtCheck.checked !== state.deepThinking) {
        state.deepThinking = dtCheck.checked;
        localStorage.setItem('deepThinking', state.deepThinking);
        const toggle = document.getElementById('deepThinkingToggle');
        if (toggle) toggle.classList.toggle('active', state.deepThinking);
    }

    document.getElementById('settingsOverlay').classList.remove('open');
}

function switchSettingsTab(tabName) {
    document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active'));

    const tab = document.querySelector(`.settings-tab[data-tab="${tabName}"]`);
    if (tab) tab.classList.add('active');

    const panelMap = { general: 'settingsGeneral', connectors: 'settingsConnectors', memory: 'settingsMemory', skills: 'settingsSkills', soul: 'settingsSoul' };
    const panel = document.getElementById(panelMap[tabName]);
    if (panel) panel.classList.add('active');
}

async function loadMemoryStats() {
    try {
        const res = await fetch('/api/memory/stats');
        const stats = await res.json();
        const sessionEl = document.getElementById('memorySessionCount');
        const factEl = document.getElementById('memoryFactCount');
        if (sessionEl) sessionEl.textContent = stats.sessions?.total || 0;

        // Load profile facts count
        const profileRes = await fetch(`/api/user/${state.userId}/profile`);
        const profile = await profileRes.json();
        if (factEl) factEl.textContent = Object.keys(profile.facts || {}).length;
    } catch (e) {
        console.error('Failed to load memory stats:', e);
    }
}

async function cleanupMemory() {
    try {
        const res = await fetch('/api/memory/cleanup', { method: 'POST' });
        const result = await res.json();
        showNotification('Memory cleaned up', 'info');
        loadMemoryStats();
    } catch (e) {
        showNotification('Failed to cleanup memory', 'error');
    }
}

// =================================
// Soul Management
// =================================

const SOUL_TRAIT_LABELS = {
    friendliness: 'Friendliness',
    creativity: 'Creativity',
    formality: 'Formality',
    humor: 'Humor',
    patience: 'Patience',
    curiosity: 'Curiosity',
    empathy: 'Empathy',
    confidence: 'Confidence',
};

async function loadSoulData() {
    try {
        const res = await fetch('/api/soul');
        const data = await res.json();

        // Traits
        const traitsList = document.getElementById('soulTraitsList');
        if (traitsList && data.traits) {
            traitsList.innerHTML = Object.entries(data.traits).map(([key, val]) => {
                const pct = Math.round(val * 100);
                const label = SOUL_TRAIT_LABELS[key] || key;
                return `<div class="soul-trait-row">
                    <span class="soul-trait-label">${label}</span>
                    <div class="soul-trait-bar"><div class="soul-trait-fill" style="width:${pct}%"></div></div>
                    <span class="soul-trait-value">${val.toFixed(2)}</span>
                </div>`;
            }).join('');
        }

        // Emotional state
        if (data.emotional_state) {
            const moodEl = document.getElementById('soulMood');
            if (moodEl) {
                const mood = data.emotional_state.mood || 'neutral';
                moodEl.textContent = mood;
                moodEl.className = 'soul-mood-badge ' + mood;
            }
            const energyFill = document.getElementById('soulEnergyFill');
            const energyVal = document.getElementById('soulEnergyValue');
            const energy = data.emotional_state.energy || 0;
            if (energyFill) energyFill.style.width = Math.round(energy * 100) + '%';
            if (energyVal) energyVal.textContent = energy.toFixed(2);
        }

        // Stats
        const stats = data.stats || {};
        const totalEl = document.getElementById('soulTotalInteractions');
        const posEl = document.getElementById('soulPositiveInteractions');
        const negEl = document.getElementById('soulNegativeInteractions');
        const evoEl = document.getElementById('soulEvolutionCount');
        if (totalEl) totalEl.textContent = stats.total_interactions || 0;
        if (posEl) posEl.textContent = stats.positive_interactions || 0;
        if (negEl) negEl.textContent = stats.negative_interactions || 0;
        if (evoEl) evoEl.textContent = (data.evolution_history || []).length;

        // Evolution history
        const historyList = document.getElementById('soulHistoryList');
        if (historyList) {
            const history = data.evolution_history || [];
            if (history.length === 0) {
                historyList.innerHTML = '<div class="soul-history-empty">No evolutions yet — evolves every 50 interactions</div>';
            } else {
                historyList.innerHTML = history.slice().reverse().map(ev => {
                    const date = new Date(ev.timestamp).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                    const changes = Object.entries(ev.changes || {}).map(([k, v]) =>
                        `<div class="soul-history-change"><span class="soul-history-change-key">${k}:</span> ${v}</div>`
                    ).join('');
                    return `<div class="soul-history-item">
                        <div class="soul-history-time">#${ev.interaction_count} — ${date}</div>
                        <div class="soul-history-changes">${changes}</div>
                    </div>`;
                }).join('');
            }
        }
    } catch (e) {
        console.error('Failed to load soul data:', e);
    }
}

async function resetSoul() {
    if (!confirm('Reset personality to defaults? Evolution history will be preserved.')) return;
    try {
        await fetch('/api/soul/reset', { method: 'POST' });
        showNotification('Soul reset to defaults', 'info');
        loadSoulData();
    } catch (e) {
        showNotification('Failed to reset soul', 'error');
    }
}

// =================================
// MCP Servers Management
// =================================

async function loadMcpServers() {
    try {
        const res = await fetch('/api/mcp/servers');
        const data = await res.json();
        renderMcpServers(data.servers || []);
    } catch (e) {
        console.error('Failed to load MCP servers:', e);
        renderMcpServers([]);
    }
}

function renderMcpServers(servers) {
    const list = document.getElementById('mcpServersList');
    const empty = document.getElementById('mcpEmptyState');

    if (!servers.length) {
        list.style.display = 'none';
        empty.style.display = 'block';
        return;
    }

    empty.style.display = 'none';
    list.style.display = 'flex';

    list.innerHTML = servers.map(s => {
        const statusClass = s.status || 'disconnected';
        const statusLabel = { connected: 'Connected', disconnected: 'Disconnected', error: 'Error' }[statusClass] || statusClass;
        const detail = s.transport === 'sse' ? s.url : `${s.command || ''} ${(s.args || []).join(' ')}`.trim();

        return `
            <div class="mcp-server-card" data-id="${s.id}">
                <div class="mcp-server-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M4 11a9 9 0 0118 0"/>
                        <path d="M4 4a16 16 0 0118 0"/>
                        <circle cx="12" cy="11" r="1"/>
                        <path d="M12 12v9"/>
                    </svg>
                </div>
                <div class="mcp-server-info">
                    <div class="mcp-server-name">${escapeHtml(s.name)}</div>
                    <div class="mcp-server-detail">${escapeHtml(detail)}</div>
                </div>
                <div class="mcp-server-status ${statusClass}">
                    <span class="dot"></span>
                    ${statusLabel}
                </div>
                <div class="mcp-server-actions">
                    <button class="mcp-server-action-btn" onclick="toggleMcpServer('${s.id}')" title="${statusClass === 'connected' ? 'Disconnect' : 'Connect'}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            ${statusClass === 'connected'
                ? '<path d="M18.36 6.64a9 9 0 01.203 12.519M5.64 6.64a9 9 0 00-.203 12.519"/><circle cx="12" cy="12" r="2"/>'
                : '<path d="M5 12h14"/><path d="M12 5l7 7-7 7"/>'}
                        </svg>
                    </button>
                    <button class="mcp-server-action-btn delete" onclick="deleteMcpServer('${s.id}')" title="Remove">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function showAddMcpModal() {
    document.getElementById('mcpAddOverlay').classList.add('open');
    document.getElementById('mcpName').value = '';
    document.getElementById('mcpTransport').value = 'stdio';
    document.getElementById('mcpCommand').value = '';
    document.getElementById('mcpArgs').value = '';
    document.getElementById('mcpUrl').value = '';
    document.getElementById('mcpEnv').value = '';
    onMcpTransportChange();
}

function closeMcpModal() {
    document.getElementById('mcpAddOverlay').classList.remove('open');
}

function onMcpTransportChange() {
    const transport = document.getElementById('mcpTransport').value;
    document.getElementById('mcpStdioFields').style.display = transport === 'stdio' ? 'block' : 'none';
    document.getElementById('mcpSseFields').style.display = transport === 'sse' ? 'block' : 'none';
}

async function addMcpServer() {
    const name = document.getElementById('mcpName').value.trim();
    const transport = document.getElementById('mcpTransport').value;

    if (!name) {
        showNotification('Server name is required', 'error');
        return;
    }

    const server = { name, transport };

    if (transport === 'stdio') {
        server.command = document.getElementById('mcpCommand').value.trim();
        server.args = document.getElementById('mcpArgs').value.trim().split(/\s+/).filter(Boolean);
        if (!server.command) {
            showNotification('Command is required', 'error');
            return;
        }
    } else {
        server.url = document.getElementById('mcpUrl').value.trim();
        if (!server.url) {
            showNotification('URL is required', 'error');
            return;
        }
    }

    const envText = document.getElementById('mcpEnv').value.trim();
    if (envText) {
        try {
            server.env = JSON.parse(envText);
        } catch (e) {
            showNotification('Invalid JSON in environment variables', 'error');
            return;
        }
    }

    try {
        const res = await fetch('/api/mcp/servers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(server),
        });
        const data = await res.json();
        if (data.error) {
            showNotification(data.error, 'error');
            return;
        }
        closeMcpModal();
        loadMcpServers();
        showNotification(`Server "${name}" added`, 'info');
    } catch (e) {
        showNotification('Failed to add server', 'error');
    }
}

async function deleteMcpServer(id) {
    try {
        await fetch(`/api/mcp/servers/${id}`, { method: 'DELETE' });
        loadMcpServers();
        showNotification('Server removed', 'info');
    } catch (e) {
        showNotification('Failed to remove server', 'error');
    }
}

async function toggleMcpServer(id) {
    try {
        const res = await fetch(`/api/mcp/servers/${id}/toggle`, { method: 'POST' });
        const data = await res.json();
        loadMcpServers();
    } catch (e) {
        showNotification('Failed to toggle server', 'error');
    }
}

// =================================
// Skills Management
// =================================

let editingSkillName = null;

async function loadSkills() {
    try {
        const res = await fetch('/api/skills');
        const data = await res.json();
        renderSkills(data.skills || []);
    } catch (e) {
        console.error('Failed to load skills:', e);
        renderSkills([]);
    }
}

function renderSkills(skills) {
    const list = document.getElementById('skillsList');
    const empty = document.getElementById('skillsEmptyState');

    if (!skills.length) {
        list.style.display = 'none';
        empty.style.display = 'block';
        return;
    }

    empty.style.display = 'none';
    list.style.display = 'flex';

    list.innerHTML = skills.map(s => {
        const enabledClass = s.enabled ? 'enabled' : 'disabled';
        const statusLabel = s.enabled ? 'Enabled' : 'Disabled';

        return `
            <div class="skill-card" data-name="${escapeHtml(s.name)}">
                <div class="skill-card-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
                    </svg>
                </div>
                <div class="skill-card-info">
                    <div class="skill-card-name">${escapeHtml(s.name)}</div>
                    <div class="skill-card-desc">${escapeHtml(s.description || '')}</div>
                </div>
                <div class="skill-card-status ${enabledClass}">
                    <span class="dot"></span>
                    ${statusLabel}
                </div>
                <div class="skill-card-actions">
                    <label class="settings-toggle" title="${s.enabled ? 'Disable' : 'Enable'}">
                        <input type="checkbox" ${s.enabled ? 'checked' : ''} onchange="toggleSkill('${escapeHtml(s.name)}')">
                        <span class="settings-toggle-slider"></span>
                    </label>
                    <button class="mcp-server-action-btn" onclick="editSkill('${escapeHtml(s.name)}')" title="Edit">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button class="mcp-server-action-btn delete" onclick="showDeleteSkillModal('${escapeHtml(s.name)}')" title="Delete">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function showSkillModal(skillName = null) {
    editingSkillName = skillName;
    const overlay = document.getElementById('skillModalOverlay');
    const title = document.getElementById('skillModalTitle');
    const nameInput = document.getElementById('skillName');
    const contentInput = document.getElementById('skillContent');
    const saveBtn = document.getElementById('skillModalSaveBtn');

    if (skillName) {
        title.textContent = 'Edit Skill';
        saveBtn.textContent = 'Save Changes';
        nameInput.value = skillName;
        nameInput.readOnly = true;
        fetch(`/api/skills/${skillName}`)
            .then(r => r.json())
            .then(data => {
                contentInput.value = data.content || '';
            });
    } else {
        title.textContent = 'Add Skill';
        saveBtn.textContent = 'Add Skill';
        nameInput.value = '';
        nameInput.readOnly = false;
        contentInput.value = '';
    }

    overlay.classList.add('open');
}

function closeSkillModal() {
    document.getElementById('skillModalOverlay').classList.remove('open');
    editingSkillName = null;
}

async function saveSkill() {
    const name = document.getElementById('skillName').value.trim();
    const content = document.getElementById('skillContent').value;

    if (!name) {
        showNotification('Skill name is required', 'error');
        return;
    }
    if (!content.trim()) {
        showNotification('Skill content is required', 'error');
        return;
    }

    try {
        let res;
        if (editingSkillName) {
            res = await fetch(`/api/skills/${editingSkillName}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content }),
            });
        } else {
            res = await fetch('/api/skills', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, content }),
            });
        }
        const data = await res.json();
        if (data.error) {
            showNotification(data.error, 'error');
            return;
        }
        closeSkillModal();
        loadSkills();
        showNotification(editingSkillName ? `Skill "${name}" updated` : `Skill "${name}" created`, 'info');
    } catch (e) {
        showNotification('Failed to save skill', 'error');
    }
}

function editSkill(name) {
    showSkillModal(name);
}

let pendingDeleteSkillName = null;

function showDeleteSkillModal(name) {
    pendingDeleteSkillName = name;
    document.getElementById('skillDeleteName').textContent = name;
    document.getElementById('skillDeleteOverlay').classList.add('open');
}

function closeSkillDeleteModal() {
    document.getElementById('skillDeleteOverlay').classList.remove('open');
    pendingDeleteSkillName = null;
}

async function confirmDeleteSkill() {
    if (!pendingDeleteSkillName) return;
    try {
        await fetch(`/api/skills/${pendingDeleteSkillName}`, { method: 'DELETE' });
        closeSkillDeleteModal();
        loadSkills();
        showNotification(`Skill "${pendingDeleteSkillName}" deleted`, 'info');
    } catch (e) {
        showNotification('Failed to delete skill', 'error');
    }
}

async function toggleSkill(name) {
    try {
        const res = await fetch(`/api/skills/${name}/toggle`, { method: 'POST' });
        const data = await res.json();
        loadSkills();
        showNotification(`Skill "${name}" ${data.enabled ? 'enabled' : 'disabled'}`, 'info');
    } catch (e) {
        showNotification('Failed to toggle skill', 'error');
    }
}
