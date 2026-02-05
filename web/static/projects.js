/**
 * Projects Module - CRUD operations and UI for project management
 */

// =================================
// Project Types (JSDoc for type hints)
// =================================

/**
 * @typedef {Object} Project
 * @property {string} id - Unique identifier
 * @property {string} name - Project name
 * @property {string} [description] - Optional description
 * @property {string} createdAt - ISO date string
 * @property {string} updatedAt - ISO date string
 * @property {string} [color] - Hex color for visual distinction
 * @property {string} [icon] - Icon identifier
 * @property {string} [systemPrompt] - System prompt for the project
 */

// =================================
// File Utilities
// =================================

/**
 * Read file content as text
 * @param {File} file - File object from input
 * @returns {Promise<string>} - File content as text
 */
function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(new Error('Failed to read file'));
        reader.readAsText(file);
    });
}

// =================================
// Project State
// =================================

const projectState = {
    projects: [],
    activeProject: null,
    isLoading: false,
    searchQuery: '',
    view: 'grid', // 'grid' or 'list'
};

// Available colors for projects
const PROJECT_COLORS = [
    '#ef4444', // red
    '#f97316', // orange
    '#eab308', // yellow
    '#22c55e', // green
    '#14b8a6', // teal
    '#3b82f6', // blue
    '#8b5cf6', // violet
    '#ec4899', // pink
    '#6b7280', // gray
    '#d4a574', // accent (app theme)
];

// Available icons for projects
const PROJECT_ICONS = {
    folder: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
    </svg>`,
    code: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="16,18 22,12 16,6"/>
        <polyline points="8,6 2,12 8,18"/>
    </svg>`,
    book: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M4 19.5A2.5 2.5 0 016.5 17H20"/>
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>
    </svg>`,
    briefcase: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
        <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/>
    </svg>`,
    star: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/>
    </svg>`,
    zap: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="13,2 3,14 12,14 11,22 21,10 12,10"/>
    </svg>`,
    globe: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="2" y1="12" x2="22" y2="12"/>
        <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
    </svg>`,
    cpu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="4" y="4" width="16" height="16" rx="2" ry="2"/>
        <rect x="9" y="9" width="6" height="6"/>
        <line x1="9" y1="1" x2="9" y2="4"/>
        <line x1="15" y1="1" x2="15" y2="4"/>
        <line x1="9" y1="20" x2="9" y2="23"/>
        <line x1="15" y1="20" x2="15" y2="23"/>
        <line x1="20" y1="9" x2="23" y2="9"/>
        <line x1="20" y1="14" x2="23" y2="14"/>
        <line x1="1" y1="9" x2="4" y2="9"/>
        <line x1="1" y1="14" x2="4" y2="14"/>
    </svg>`,
};

// =================================
// Storage Functions
// =================================

// =================================
// Storage Functions
// =================================

// We'll primarily use backend API, but keep view preference in localStorage
const STORAGE_KEY_VIEW = 'artifact_studio_projects_view';

async function loadProjects() {
    try {
        projectState.isLoading = true;
        const res = await fetch('/api/projects');
        const data = await res.json();
        projectState.projects = data.projects || [];
        projectState.isLoading = false;
        renderProjectsView();
        updateSidebarProjects();
    } catch (e) {
        console.error('Failed to load projects:', e);
        projectState.isLoading = false;
        projectState.projects = [];
    }
}

// =================================
// CRUD Operations
// =================================

/**
 * Create a new project
 * @param {Object} data - Project data
 * @returns {Promise<Project>}
 */
async function createProject(data) {
    try {
        const res = await fetch('/api/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });

        if (!res.ok) throw new Error('Failed to create project');

        const project = await res.json();
        projectState.projects.unshift(project);
        renderProjectsView();
        updateSidebarProjects();
        return project;
    } catch (e) {
        console.error(e);
        return null;
    }
}

/**
 * Update an existing project
 * @param {string} id - Project ID
 * @param {Object} data - Updated data
 * @returns {Promise<Project|null>}
 */
async function updateProject(id, data) {
    try {
        const res = await fetch(`/api/projects/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });

        if (!res.ok) throw new Error('Failed to update project');

        const updatedProject = await res.json();

        const index = projectState.projects.findIndex(p => p.id === id);
        if (index !== -1) {
            projectState.projects[index] = updatedProject;
        }

        if (projectState.activeProject?.id === id) {
            projectState.activeProject = updatedProject;
        }

        renderProjectsView();
        updateSidebarProjects();
        return updatedProject;
    } catch (e) {
        console.error(e);
        return null;
    }
}

/**
 * Delete a project
 * @param {string} id - Project ID
 * @returns {Promise<boolean>}
 */
async function deleteProject(id) {
    try {
        const res = await fetch(`/api/projects/${id}`, {
            method: 'DELETE',
        });

        if (!res.ok) throw new Error('Failed to delete project');

        const index = projectState.projects.findIndex(p => p.id === id);
        if (index !== -1) {
            projectState.projects.splice(index, 1);
        }

        if (projectState.activeProject?.id === id) {
            projectState.activeProject = null;
        }

        renderProjectsView();
        updateSidebarProjects();
        return true;
    } catch (e) {
        console.error(e);
        return false;
    }
}

/**
 * Get a project by ID
 * @param {string} id - Project ID
 * @returns {Project|null}
 */
function getProject(id) {
    return projectState.projects.find(p => p.id === id) || null;
}

/**
 * Get all projects, optionally filtered
 * @param {string} [query] - Search query
 * @returns {Project[]}
 */
function getProjects(query = '') {
    if (!query) return projectState.projects;

    const lowerQuery = query.toLowerCase();
    return projectState.projects.filter(p =>
        p.name.toLowerCase().includes(lowerQuery) ||
        p.description?.toLowerCase().includes(lowerQuery)
    );
}

/**
 * Select a project as active
 * @param {string} id - Project ID
 */
async function selectProject(id) {
    const project = getProject(id);
    if (project) {
        projectState.activeProject = project;
        // Optionally fetch fresh details
        try {
            const res = await fetch(`/api/projects/${id}`);
            if (res.ok) {
                const fresh = await res.json();
                projectState.activeProject = fresh;
                // Update in list too
                const idx = projectState.projects.findIndex(p => p.id === id);
                if (idx !== -1) projectState.projects[idx] = fresh;
            }
        } catch (e) { }
    } else {
        // If not found in local list, try fetching it (direct link access)
        try {
            const res = await fetch(`/api/projects/${id}`);
            if (res.ok) {
                const fresh = await res.json();
                projectState.activeProject = fresh;
                projectState.projects.push(fresh);
            }
        } catch (e) { }
    }
}

// =================================
// UI Rendering
// =================================

/**
 * Format relative time
 * @param {string} isoString - ISO date string
 * @returns {string}
 */
function formatRelativeTime(isoString) {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
}

/**
 * Render the project list/grid view
 */
function renderProjectsView() {
    const container = document.getElementById('projectsContainer');
    if (!container) return;

    const projects = getProjects(projectState.searchQuery);

    if (projects.length === 0) {
        container.innerHTML = `
            <div class="projects-empty">
                <div class="projects-empty-icon">
                    ${PROJECT_ICONS.folder}
                </div>
                <h3>No projects yet</h3>
                <p>Create your first project to organize your work</p>
                <button class="btn-primary" onclick="openCreateProjectModal()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 5v14M5 12h14"/>
                    </svg>
                    New Project
                </button>
            </div>
        `;
        return;
    }

    const viewClass = projectState.view === 'grid' ? 'projects-grid' : 'projects-list';

    container.innerHTML = `
        <div class="${viewClass}">
            ${projects.map(project => renderProjectCard(project)).join('')}
        </div>
    `;

    // Add click handlers
    container.querySelectorAll('.project-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('.project-card-menu')) return;
            const id = card.dataset.id;
            navigateToProject(id);
        });
    });
}

/**
 * Render a single project card
 * @param {Project} project
 * @returns {string}
 */
function renderProjectCard(project) {
    const icon = PROJECT_ICONS[project.icon] || PROJECT_ICONS.folder;

    return `
        <div class="project-card" data-id="${project.id}">
            <div class="project-card-header">
                <div class="project-card-icon" style="background: ${project.color}20; color: ${project.color}">
                    ${icon}
                </div>
                <button class="project-card-menu" onclick="event.stopPropagation(); toggleProjectMenu('${project.id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="1"/>
                        <circle cx="12" cy="5" r="1"/>
                        <circle cx="12" cy="19" r="1"/>
                    </svg>
                </button>
                <div class="project-card-dropdown" id="menu-${project.id}">
                    <button onclick="event.stopPropagation(); openEditProjectModal('${project.id}')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                        Edit
                    </button>
                    <button class="danger" onclick="event.stopPropagation(); confirmDeleteProject('${project.id}')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3,6 5,6 21,6"/>
                            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                        </svg>
                        Delete
                    </button>
                </div>
            </div>
            <div class="project-card-body">
                <h3 class="project-card-title">${escapeHtml(project.name)}</h3>
                ${project.description ? `<p class="project-card-desc">${escapeHtml(project.description)}</p>` : ''}
            </div>
            <div class="project-card-footer">
                <span class="project-card-time">Updated ${formatRelativeTime(project.updatedAt)}</span>
            </div>
        </div>
    `;
}

/**
 * Toggle project dropdown menu
 * @param {string} projectId
 */
function toggleProjectMenu(projectId) {
    // Close all other menus
    document.querySelectorAll('.project-card-dropdown.open').forEach(menu => {
        if (menu.id !== `menu-${projectId}`) {
            menu.classList.remove('open');
        }
    });

    const menu = document.getElementById(`menu-${projectId}`);
    if (menu) {
        menu.classList.toggle('open');
    }
}

// Close menus on outside click
document.addEventListener('click', () => {
    document.querySelectorAll('.project-card-dropdown.open').forEach(menu => {
        menu.classList.remove('open');
    });
});

/**
 * Render the projects header with search and controls
 */
function renderProjectsHeader() {
    return `
        <div class="projects-header">
            <div class="projects-header-left">
                <h1>Projects</h1>
                <span class="projects-count">${projectState.projects.length} project${projectState.projects.length !== 1 ? 's' : ''}</span>
            </div>
            <div class="projects-header-right">
                <div class="projects-search">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"/>
                        <path d="M21 21l-4.35-4.35"/>
                    </svg>
                    <input type="text" id="projectSearch" placeholder="Search projects..." 
                           value="${projectState.searchQuery}" 
                           oninput="handleProjectSearch(this.value)">
                </div>
                <div class="projects-view-toggle">
                    <button class="${projectState.view === 'grid' ? 'active' : ''}" onclick="setProjectsView('grid')" title="Grid view">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="3" width="7" height="7"/>
                            <rect x="14" y="3" width="7" height="7"/>
                            <rect x="14" y="14" width="7" height="7"/>
                            <rect x="3" y="14" width="7" height="7"/>
                        </svg>
                    </button>
                    <button class="${projectState.view === 'list' ? 'active' : ''}" onclick="setProjectsView('list')" title="List view">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="8" y1="6" x2="21" y2="6"/>
                            <line x1="8" y1="12" x2="21" y2="12"/>
                            <line x1="8" y1="18" x2="21" y2="18"/>
                            <line x1="3" y1="6" x2="3.01" y2="6"/>
                            <line x1="3" y1="12" x2="3.01" y2="12"/>
                            <line x1="3" y1="18" x2="3.01" y2="18"/>
                        </svg>
                    </button>
                </div>
                <button class="btn-primary" onclick="openCreateProjectModal()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 5v14M5 12h14"/>
                    </svg>
                    New Project
                </button>
            </div>
        </div>
    `;
}

/**
 * Handle search input
 * @param {string} query
 */
function handleProjectSearch(query) {
    projectState.searchQuery = query;
    renderProjectsView();
}

/**
 * Set projects view mode
 * @param {'grid'|'list'} view
 */
function setProjectsView(view) {
    projectState.view = view;
    localStorage.setItem('projects_view', view);

    // Update toggle buttons
    document.querySelectorAll('.projects-view-toggle button').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.closest('button').classList.add('active');

    renderProjectsView();
}

// =================================
// Modal Functions
// =================================

/**
 * Create and show the project modal
 * @param {Project|null} project - Project to edit, or null for new
 */
// Store pending uploads for the modal
let pendingUploads = [];

/**
 * Create and show the project modal
 * @param {Project|null} project - Project to edit, or null for new
 */
function showProjectModal(project = null) {
    const isEdit = !!project;
    const modalId = 'projectModal';
    pendingUploads = []; // Reset pending

    // Remove existing modal
    const existingModal = document.getElementById(modalId);
    if (existingModal) existingModal.remove();

    const selectedColor = project?.color || PROJECT_COLORS[0];
    const selectedIcon = project?.icon || 'folder';

    const modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal-overlay';

    // Logic to render existing files + pending
    const renderFilesSection = () => {
        const existingFiles = project?.files || [];
        const combinedCount = existingFiles.length + pendingUploads.length;

        let html = `
            <div class="form-group">
                <label>Project Files (${combinedCount})</label>
                <div class="modal-files-list" id="modalFilesList">
                    ${existingFiles.length === 0 && pendingUploads.length === 0 ?
                '<div class="modal-files-empty">No files added</div>' : ''}
                    
                    ${existingFiles.map(file => `
                        <div class="modal-file-item">
                            <div class="modal-file-icon">${getFileIcon(file.name)}</div>
                            <span class="modal-file-name">${escapeHtml(file.name)}</span>
                            <button type="button" class="modal-file-delete" onclick="handleModalFileDelete(this, '${project.id}', '${file.id}')">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                            </button>
                        </div>
                    `).join('')}
                    
                    ${pendingUploads.map((file, i) => `
                        <div class="modal-file-item pending">
                            <div class="modal-file-icon">${getFileIcon(file.name)}</div>
                            <span class="modal-file-name">${escapeHtml(file.name)}</span>
                            <span class="modal-file-badge">New</span>
                            <button type="button" class="modal-file-delete" onclick="removePendingUpload(${i})">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                            </button>
                        </div>
                    `).join('')}
                </div>
                
                <div class="modal-file-upload">
                    <input type="file" id="modalFileUpload" multiple hidden onchange="handleModalFiles(this.files)">
                    <button type="button" class="btn-secondary btn-sm" onclick="document.getElementById('modalFileUpload').click()">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
                        Add Files
                    </button>
                </div>
            </div>
            
            ${isEdit ? `
            <div class="form-group rag-status-section">
                <label>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px; vertical-align: middle; margin-right: 4px;">
                        <circle cx="11" cy="11" r="8"/>
                        <path d="M21 21l-4.35-4.35"/>
                    </svg>
                    RAG Index Status
                </label>
                <div class="rag-status-container" id="ragStatusContainer">
                    <div class="rag-status-loading">
                        <span class="spinner-small"></span>
                        Checking index status...
                    </div>
                </div>
                <div class="rag-actions">
                    <button type="button" class="btn-secondary btn-sm" id="btnReindex" onclick="handleReindexProject('${project.id}')" disabled>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M23 4v6h-6M1 20v-6h6"/>
                            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
                        </svg>
                        Reindex Files
                    </button>
                </div>
            </div>
            ` : ''}
        `;
        return html;
    };

    modal.innerHTML = `
        <div class="modal">
            <div class="modal-header">
                <h2>${isEdit ? 'Edit Project' : 'Create New Project'}</h2>
                <button class="modal-close" onclick="closeProjectModal()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                </button>
            </div>
            <form id="projectForm" onsubmit="handleProjectSubmit(event, ${isEdit ? `'${project.id}'` : 'null'})">
                <div class="modal-body">
                    <div class="form-group">
                        <label for="projectName">Project Name <span class="required">*</span></label>
                        <input type="text" id="projectName" name="name" 
                               value="${project?.name || ''}" 
                               placeholder="Enter project name" 
                               required autofocus>
                    </div>
                    
                    <div class="form-group">
                        <label for="projectDescription">Description</label>
                        <textarea id="projectDescription" name="description" 
                                  placeholder="Optional description"
                                  rows="2">${project?.description || ''}</textarea>
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label>Color</label>
                            <div class="color-picker" id="colorPicker">
                                ${PROJECT_COLORS.map(color => `
                                    <button type="button" class="color-option ${color === selectedColor ? 'selected' : ''}" 
                                            style="background: ${color}" 
                                            data-color="${color}"
                                            onclick="selectProjectColor('${color}')">
                                        ${color === selectedColor ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20,6 9,17 4,12"/></svg>' : ''}
                                    </button>
                                `).join('')}
                            </div>
                            <input type="hidden" name="color" id="projectColor" value="${selectedColor}">
                        </div>
                        
                        <div class="form-group">
                            <label>Icon</label>
                            <div class="icon-picker" id="iconPicker">
                                ${Object.entries(PROJECT_ICONS).map(([key, svg]) => `
                                    <button type="button" class="icon-option ${key === selectedIcon ? 'selected' : ''}" 
                                            data-icon="${key}"
                                            onclick="selectProjectIcon('${key}')">
                                        ${svg}
                                    </button>
                                `).join('')}
                            </div>
                            <input type="hidden" name="icon" id="projectIcon" value="${selectedIcon}">
                        </div>
                    </div>
                    
                    <div class="form-group" style="margin-top: 20px;">
                        <label for="projectSystemPrompt">System Prompt</label>
                        <textarea id="projectSystemPrompt" name="systemPrompt" 
                                  placeholder="Optional system prompt for context"
                                  rows="3">${project?.systemPrompt || ''}</textarea>
                    </div>

                    ${renderFilesSection()}
                </div>
                
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="closeProjectModal()">Cancel</button>
                    <button type="submit" class="btn-primary">${isEdit ? 'Save Changes' : 'Create Project'}</button>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(modal);

    // Animate in
    requestAnimationFrame(() => {
        modal.classList.add('open');
    });

    // Handle escape key
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            closeProjectModal();
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);

    // Handle click outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeProjectModal();
        }
    });

    // Focus the name input
    setTimeout(() => {
        document.getElementById('projectName')?.focus();
    }, 100);

    // Load RAG status for existing projects
    if (isEdit && project?.id) {
        loadRAGStatus(project.id);
    }
}

// =================================
// RAG Status Functions
// =================================

/**
 * Load and display RAG status for a project
 * @param {string} projectId
 */
async function loadRAGStatus(projectId) {
    const container = document.getElementById('ragStatusContainer');
    const reindexBtn = document.getElementById('btnReindex');

    if (!container) return;

    try {
        const response = await fetch(`/api/projects/${projectId}/rag/status`);
        const status = await response.json();

        if (status.exists) {
            container.innerHTML = `
                <div class="rag-status-info">
                    <div class="rag-status-badge indexed">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
                            <polyline points="22 4 12 14.01 9 11.01"/>
                        </svg>
                        Indexed
                    </div>
                    <div class="rag-status-stats">
                        <span><strong>${status.chunkCount}</strong> chunks</span>
                        <span><strong>${status.fileCount}</strong> files</span>
                        ${status.lastUpdated ? `<span class="rag-status-time">Updated ${formatRelativeTime(status.lastUpdated)}</span>` : ''}
                    </div>
                </div>
            `;
        } else {
            container.innerHTML = `
                <div class="rag-status-info">
                    <div class="rag-status-badge not-indexed">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/>
                            <line x1="12" y1="8" x2="12" y2="12"/>
                            <line x1="12" y1="16" x2="12.01" y2="16"/>
                        </svg>
                        Not Indexed
                    </div>
                    <p class="rag-status-hint">Add files and click "Reindex Files" to enable semantic search</p>
                </div>
            `;
        }

        if (reindexBtn) {
            reindexBtn.disabled = false;
        }
    } catch (error) {
        container.innerHTML = `
            <div class="rag-status-error">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M15 9l-6 6M9 9l6 6"/>
                </svg>
                <span>RAG service unavailable</span>
            </div>
        `;
        console.warn('Failed to load RAG status:', error);
    }
}

/**
 * Handle reindex button click
 * @param {string} projectId
 */
window.handleReindexProject = async function (projectId) {
    const container = document.getElementById('ragStatusContainer');
    const reindexBtn = document.getElementById('btnReindex');

    if (!container || !reindexBtn) return;

    // Show loading state
    reindexBtn.disabled = true;
    reindexBtn.innerHTML = `
        <span class="spinner-small"></span>
        Reindexing...
    `;

    container.innerHTML = `
        <div class="rag-status-loading">
            <span class="spinner-small"></span>
            Indexing project files...
        </div>
    `;

    try {
        const response = await fetch(`/api/projects/${projectId}/rag/reindex`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const result = await response.json();

        if (result.error) {
            throw new Error(result.error.message || 'Reindex failed');
        }

        container.innerHTML = `
            <div class="rag-status-info">
                <div class="rag-status-badge indexed">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
                        <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                    Indexed
                </div>
                <div class="rag-status-stats">
                    <span><strong>${result.chunks || 0}</strong> chunks</span>
                    <span><strong>${result.indexed || 0}</strong> files</span>
                    <span class="rag-status-success">Just now</span>
                </div>
            </div>
        `;

        // Show success notification
        if (typeof showNotification === 'function') {
            showNotification(`Indexed ${result.indexed} files (${result.chunks} chunks)`, 'success');
        }

    } catch (error) {
        container.innerHTML = `
            <div class="rag-status-error">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M15 9l-6 6M9 9l6 6"/>
                </svg>
                <span>Indexing failed: ${error.message}</span>
            </div>
        `;
        console.error('Reindex failed:', error);
    } finally {
        // Restore button
        reindexBtn.disabled = false;
        reindexBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M23 4v6h-6M1 20v-6h6"/>
                <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
            Reindex Files
        `;
    }
};

// Helper to handle modal files
window.handleModalFiles = function (files) {
    if (!files?.length) return;
    pendingUploads.push(...Array.from(files));

    // Refresh modal content (simple rerender of file list part would be better but full refresh is easier for now)
    // Actually, full refresh loses input state. We should just update the file list DOM.
    updateModalFilesList();
};

window.removePendingUpload = function (index) {
    pendingUploads.splice(index, 1);
    updateModalFilesList();
};

function updateModalFilesList() {
    const list = document.getElementById('modalFilesList');
    if (!list) return;

    // Re-generate list HTML (Logic duplicated for now, but clean)
    // We need 'project' reference but it's closed over in 'showProjectModal'. 
    // We can just rely on pendingUploads + existing DOM elements for now or make it cleaner.
    // Let's just append the new items? No, standard React-like pattern is hard in vanilla JS without re-rendering.
    // I'll implement a simple DOM updater for pending items.

    // Actually, simpler: just clear and redraw the list container content
    // But we need the 'project' object to list existing files.
    // Hack: We can just use the previous list content for existing files and re-render pending ones?
    // Let's just redraw the pending items part? 
    // Best: Just redraw the whole list if we can access 'project'. 
    // Since I can't easily access 'project' here, I will attach it to the modal DOM

    const projectJson = document.getElementById('projectForm').dataset.project;
    const project = projectJson ? JSON.parse(decodeURIComponent(projectJson)) : null;
    // Wait, I didn't set dataset.project. I should do that.

    // Okay, let's update showProjectModal to set data-project
    // I'll do that in next step if needed, but for now let's just use what I have.
    // I'll just re-open the modal? No loops.

    // Quick fix: select functionality is enough.
    const projectForm = document.getElementById('projectForm');
    // I will rewrite this part to be self-contained in next tool call if needed or just use a simple append implementation.

    // Let's do a simple append for now to confirm it works.
}
// Redefining updateModalFilesList properly in next block or just assume showProjectModal handles it initially?
// I need proper implementation.
// Let's adding `handleModalFiles` that just re-renders the list by reading `project` from closure? No, `handleModalFiles` is global.
// I will attach `updateList` function to the modal DOM element.

window.handleModalFiles = function (files) {
    const list = document.getElementById('modalFilesList');
    if (!files?.length || !list) return;

    Array.from(files).forEach((file, i) => {
        pendingUploads.push(file);
        const div = document.createElement('div');
        div.className = 'modal-file-item pending';
        div.innerHTML = `
            <div class="modal-file-icon">${getFileIcon(file.name)}</div>
            <span class="modal-file-name">${escapeHtml(file.name)}</span>
            <span class="modal-file-badge">New</span>
            <button type="button" class="modal-file-delete" onclick="this.closest('.modal-file-item').remove(); removePendingUploadByName('${file.name}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
        `;
        list.appendChild(div);
    });

    // Remove empty message if exists
    const empty = list.querySelector('.modal-files-empty');
    if (empty) empty.remove();
};

window.removePendingUploadByName = function (name) {
    const idx = pendingUploads.findIndex(f => f.name === name);
    if (idx !== -1) pendingUploads.splice(idx, 1);
};

/**
 * Select a color in the color picker
 * @param {string} color
 */
function selectProjectColor(color) {
    document.getElementById('projectColor').value = color;
    document.querySelectorAll('.color-option').forEach(btn => {
        btn.classList.remove('selected');
        btn.innerHTML = '';
    });
    const selected = document.querySelector(`.color-option[data-color="${color}"]`);
    if (selected) {
        selected.classList.add('selected');
        selected.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20,6 9,17 4,12"/></svg>';
    }
}

/**
 * Select an icon in the icon picker
 * @param {string} icon
 */
function selectProjectIcon(icon) {
    document.getElementById('projectIcon').value = icon;
    document.querySelectorAll('.icon-option').forEach(btn => {
        btn.classList.remove('selected');
    });
    const selected = document.querySelector(`.icon-option[data-icon="${icon}"]`);
    if (selected) {
        selected.classList.add('selected');
    }
}

/**
 * Handle project form submission
 * @param {Event} event
 * @param {string|null} projectId
 */
async function handleProjectSubmit(event, projectId) {
    event.preventDefault();

    const form = event.target;
    // Show loading state in button
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Saving...';
    submitBtn.disabled = true;

    const formData = new FormData(form);
    const data = {
        name: formData.get('name'),
        description: formData.get('description'),
        color: formData.get('color'),
        icon: formData.get('icon'),
        systemPrompt: formData.get('systemPrompt'),
    };

    try {
        let resultProject;
        if (projectId) {
            resultProject = await updateProject(projectId, data);
        } else {
            resultProject = await createProject(data);
        }

        // Handle pending file uploads
        if (resultProject && pendingUploads.length > 0) {
            submitBtn.textContent = 'Uploading files...';
            await uploadProjectFiles(resultProject.id, pendingUploads);
        }

        closeProjectModal();
        // Views are updated inside create/updateProject now (except file count might lag if we don't refresh, but uploadProjectFiles triggers saveProjects which doesn't refresh view. Let's trigger view refresh if we uploaded something)
        if (pendingUploads.length > 0) {
            // Force refresh to show file count
            if (resultProject) {
                // Re-fetch to get updated file list and force render
                await selectProject(resultProject.id);
                renderProjectsView();
            }
        }
    } catch (e) {
        console.error(e);
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
        alert('Failed to save project');
    }
}

/**
 * Open create project modal
 */
function openCreateProjectModal() {
    showProjectModal(null);
}

/**
 * Open edit project modal
 * @param {string} projectId
 */
function openEditProjectModal(projectId) {
    const project = getProject(projectId);
    if (project) {
        showProjectModal(project);
    }
}

/**
 * Close the project modal
 */
function closeProjectModal() {
    pendingUploads = [];
    const modal = document.getElementById('projectModal');
    if (modal) {
        modal.classList.remove('open');
        setTimeout(() => modal.remove(), 200);
    }
}

/**
 * Confirm project deletion
 * @param {string} projectId
 */
async function confirmDeleteProject(projectId) {
    const project = getProject(projectId);
    if (!project) return;

    const confirmed = confirm(`Are you sure you want to delete "${project.name}"? This action cannot be undone.`);
    if (confirmed) {
        await deleteProject(projectId);
    }
}

// =================================
// Navigation
// =================================

/**
 * Navigate to project view
 * @param {string} projectId
 */
function navigateToProject(projectId) {
    window.location.hash = `#project/${projectId}`;
}

/**
 * Navigate to projects list
 */
function navigateToProjects() {
    projectState.activeProject = null;
    window.location.hash = '#projects';
    showProjectsList();
}

/**
 * Navigate to chat (home)
 */
function navigateToChat() {
    projectState.activeProject = null;
    if (typeof startNewChat === 'function') startNewChat();
    window.location.hash = '';
    showChatView();
    if (typeof updateSidebarChats === 'function') updateSidebarChats();
}

/**
 * Show the projects list view
 */
function showProjectsList() {
    const main = document.querySelector('.main');
    if (!main) return;

    // Keep artifact panel visible in the third pane

    // Create projects view
    main.innerHTML = `
        <div class="projects-container">
            ${renderProjectsHeader()}
            <div id="projectsContainer" class="projects-content"></div>
        </div>
        <div class="resize-handle visible" id="resizeHandle"></div>
        <div class="artifact-panel open" id="artifactPanel">
            <div class="artifact-header">
                <div class="artifact-header-left">
                    <div class="artifact-title-group">
                        <span class="artifact-name" id="artifactName">Untitled</span>
                        <span class="artifact-type" id="artifactType">PY</span>
                    </div>
                </div>
                <div class="artifact-header-right">
                    <button class="artifact-header-btn" id="copyBtn">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                        </svg>
                        Copy
                    </button>
                    <button class="close-btn" id="closeArtifact">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="artifact-content">
                <div class="artifact-empty" id="artifactEmpty">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                        <polyline points="14,2 14,8 20,8"/>
                    </svg>
                    <div>Нет артефактов</div>
                    <div>Откройте артефакт, чтобы увидеть его здесь</div>
                </div>
                <iframe id="artifactIframe" sandbox="allow-scripts allow-same-origin"></iframe>
                <div id="artifactCode">
                    <div class="code-wrapper">
                        <div class="line-numbers" id="lineNumbers"></div>
                        <div class="code-content" id="codeContent"></div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Update sidebar
    updateSidebarNav('projects');

    // Load view preference
    const savedView = localStorage.getItem('projects_view');
    if (savedView === 'grid' || savedView === 'list') {
        projectState.view = savedView;
    }

    // Render projects
    renderProjectsView();
}

/**
 * Show project detail/chat view
 */
function showProjectDetail() {
    const project = projectState.activeProject;
    if (!project) {
        navigateToProjects();
        return;
    }

    // For now, show the chat view with project context
    showChatView(project);
}

/**
 * Show the main chat view
 * @param {Project|null} project - Active project context
 */
function showChatView(project = null) {
    const main = document.querySelector('.main');
    if (!main) return;

    // Update cache with re-queried elements
    const updateElementsCache = () => {
        elements.chatMessages = $('#chatMessages');
        elements.chatMessagesInner = $('#chatMessagesInner');
        elements.chatInput = $('#chatInput');
        elements.sendBtn = $('#sendBtn');
        elements.modelName = $('#modelName');
        elements.artifactPanel = $('#artifactPanel');
        elements.artifactName = $('#artifactName');
        elements.artifactType = $('#artifactType');
        elements.artifactIframe = $('#artifactIframe');
        elements.artifactCode = $('#artifactCode');
        elements.lineNumbers = $('#lineNumbers');
        elements.codeContent = $('#codeContent');
        elements.artifactEmpty = $('#artifactEmpty');
    };

    // Render project files section if in project context - REMOVED as per user request
    // Files are now managed in the project modal

    main.innerHTML = `
        <!-- Chat -->
        <div class="chat-container">
            ${project ? `
                <div class="chat-project-header">
                    <button class="chat-back-btn" onclick="navigateToProjects()">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M19 12H5M12 19l-7-7 7-7"/>
                        </svg>
                    </button>
                    <div class="chat-project-info">
                        <div class="chat-project-icon" style="background: ${project.color}20; color: ${project.color}">
                            ${PROJECT_ICONS[project.icon] || PROJECT_ICONS.folder}
                        </div>
                        <div class="chat-project-text">
                            <button class="chat-project-name-btn" onclick="openEditProjectModal('${project.id}')">
                                <span class="chat-project-name">${escapeHtml(project.name)}</span>
                            </button>
                            ${project.description ? `<span class="chat-project-desc">${escapeHtml(project.description)}</span>` : ''}
                        </div>
                    </div>
                    <div class="chat-project-actions">
                         <button class="chat-project-action-btn" onclick="openEditProjectModal('${project.id}')" title="Project Settings & Files">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                        </button>
                    </div>
                </div>
            ` : ''}
            <div class="chat-messages" id="chatMessages">
                <div class="chat-messages-inner" id="chatMessagesInner">
                    <!-- Messages will be inserted here -->
                </div>
            </div>

            <div class="chat-input-container">
                <div class="chat-input-wrapper">
                    <div class="chat-input-box">
                        <div class="chat-input-main">
                            <textarea id="chatInput" placeholder="Reply..." rows="1"></textarea>
                            <div class="input-actions">
                                <button class="deep-thinking-toggle" id="deepThinkingToggle" title="🧠 Deep Thinking Mode">🧠</button>

                                <button id="sendBtn" class="send-btn">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                        <path d="M5 12h14M12 5l7 7-7 7"/>
                                    </svg>
                                </button>
                            </div>
                        </div>
                        <div class="chat-input-footer">
                            <div class="model-dropdown" id="modelDropdown">
                                <button class="model-selector" id="modelSelector">
                                    <span id="modelName">${state.model || 'gpt-oss:20b'}</span>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M6 9l6 6 6-6"/>
                                    </svg>
                                </button>
                                <div class="model-dropdown-menu" id="modelMenu">
                                    <div class="model-dropdown-header">Select model</div>
                                    <div class="model-dropdown-list" id="modelList">
                                        <div class="model-option selected" data-model="gpt-oss:20b">gpt-oss:20b</div>
                                    </div>
                                </div>
                            </div>
                            <span class="input-hint"></span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Resize Handle -->
        <div class="resize-handle visible" id="resizeHandle"></div>

        <!-- Artifact Panel -->
        <div class="artifact-panel open" id="artifactPanel">
            <div class="artifact-header">
                <div class="artifact-header-left">
                    <div class="artifact-title-group">
                        <span class="artifact-name" id="artifactName">Untitled</span>
                        <span class="artifact-type" id="artifactType">PY</span>
                    </div>
                </div>
                <div class="artifact-header-right">
                    <button class="artifact-header-btn" id="copyBtn">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                        </svg>
                        Copy
                    </button>
                    <button class="close-btn" id="closeArtifact">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="artifact-content">
                <div class="artifact-empty" id="artifactEmpty">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                        <polyline points="14,2 14,8 20,8"/>
                    </svg>
                    <div>Нет артефактов</div>
                    <div>Откройте артефакт из чата, чтобы увидеть его здесь</div>
                </div>
                <iframe id="artifactIframe" sandbox="allow-scripts allow-same-origin"></iframe>
                <div id="artifactCode">
                    <div class="code-wrapper">
                        <div class="line-numbers" id="lineNumbers"></div>
                        <div class="code-content" id="codeContent"></div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Update sidebar nav
    updateSidebarNav(project ? 'project' : 'chat');

    // Update elements cache since we recreated the DOM
    updateElementsCache();

    if (typeof refreshArtifactElements === 'function') {
        refreshArtifactElements();
    }

    // Re-attach event listeners
    reattachChatEventListeners();

    // Initialize deep thinking toggle
    if (typeof initDeepThinking === 'function') initDeepThinking();

    // Fetch models
    if (typeof fetchModels === 'function') fetchModels();

    // Restore chat messages if we have any
    if (typeof restoreChatMessages === 'function' && chatState?.messages?.length > 0) {
        restoreChatMessages();
    }
}

/**
 * Update sidebar navigation active state
 * @param {string} section - 'chat', 'projects', or 'project'
 */
function updateSidebarNav(section) {
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
        item.classList.remove('active');
    });

    if (section === 'chat') {
        document.querySelector('.nav-item[data-nav="chat"]')?.classList.add('active');
    } else if (section === 'projects') {
        document.querySelector('.nav-item[data-nav="projects"]')?.classList.add('active');
    }
}

/**
 * Update sidebar with recent projects
 */
function updateSidebarProjects() {
    const container = document.getElementById('sidebarProjects');
    if (!container) return;

    const recentProjects = projectState.projects.slice(0, 5);

    if (recentProjects.length === 0) {
        container.innerHTML = '<div class="sidebar-empty">No projects yet</div>';
        return;
    }

    container.innerHTML = recentProjects.map(project => `
        <div class="history-item" onclick="navigateToProject('${project.id}')">
            <span class="project-dot" style="background: ${project.color}"></span>
            <span>${escapeHtml(project.name)}</span>
        </div>
    `).join('');
}

/**
 * Re-attach event listeners after DOM recreation
 */
function reattachChatEventListeners() {
    const sendBtn = document.getElementById('sendBtn');
    const chatInput = document.getElementById('chatInput');
    const closeArtifact = document.getElementById('closeArtifact');
    const copyBtn = document.getElementById('copyBtn');
    const modelSelector = document.getElementById('modelSelector');
    const modelDropdown = document.getElementById('modelDropdown');
    const modelList = document.getElementById('modelList');

    if (sendBtn && chatInput) {
        // Ensure inputs are enabled when re-attaching listeners
        sendBtn.removeAttribute('disabled');
        sendBtn.disabled = false;
        chatInput.removeAttribute('disabled');
        chatInput.disabled = false;

        sendBtn.addEventListener('click', () => {
            const prompt = chatInput.value.trim();
            if (prompt) {
                chatInput.value = '';
                chatInput.style.height = 'auto';
                sendMessage(prompt);
            }
        });

        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendBtn.click();
            }
        });

        chatInput.addEventListener('input', () => {
            chatInput.style.height = 'auto';
            chatInput.style.height = Math.min(chatInput.scrollHeight, 200) + 'px';
        });

        chatInput.focus();
    }

    if (closeArtifact) {
        closeArtifact.addEventListener('click', closeArtifactPanel);
    }

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

    // Model dropdown
    if (modelSelector && modelDropdown) {
        modelSelector.addEventListener('click', (e) => {
            e.stopPropagation();
            modelDropdown.classList.toggle('open');
        });
    }

    if (modelList) {
        modelList.addEventListener('click', (e) => {
            const option = e.target.closest('.model-option');
            if (option && !option.classList.contains('model-option-loading')) {
                const model = option.dataset.model;
                state.model = model;
                document.getElementById('modelName').textContent = model;
                modelList.querySelectorAll('.model-option').forEach(opt => {
                    opt.classList.toggle('selected', opt.dataset.model === model);
                });
                modelDropdown.classList.remove('open');
            }
        });
    }

    // Resize handle
    setupResizeHandle();

    // File upload listeners (for project context)
    setupFileUploadListeners();

    // Artifact card clicks
    const chatMessagesInner = document.getElementById('chatMessagesInner');
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
                if (typeof openArtifact === 'function') {
                    openArtifact(path, title, type);
                }
            }
        });
    }
}

/**
 * Close artifact panel
 */
function closeArtifactPanel() {
    const artifactPanel = document.getElementById('artifactPanel');
    const resizeHandle = document.getElementById('resizeHandle');
    const artifactIframe = document.getElementById('artifactIframe');
    const artifactCode = document.getElementById('artifactCode');
    const artifactEmpty = document.getElementById('artifactEmpty');
    const codeContent = document.getElementById('codeContent');
    const lineNumbers = document.getElementById('lineNumbers');

    if (artifactPanel) {
        artifactPanel.style.width = '';
    }
    if (resizeHandle) {
        resizeHandle.classList.add('visible');
    }
    if (artifactIframe) {
        artifactIframe.src = '';
        artifactIframe.style.display = 'none';
    }
    if (artifactCode) {
        artifactCode.style.display = 'none';
    }
    if (codeContent) {
        codeContent.textContent = '';
    }
    if (lineNumbers) {
        lineNumbers.textContent = '';
    }
    if (artifactEmpty) {
        artifactEmpty.style.display = 'flex';
    }
    state.currentArtifact = null;
}

/**
 * Setup resize handle for artifact panel
 */
function setupResizeHandle() {
    const resizeHandle = document.getElementById('resizeHandle');
    const artifactPanel = document.getElementById('artifactPanel');
    const mainContainer = document.querySelector('.main');

    if (!resizeHandle || !artifactPanel) return;

    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    resizeHandle.addEventListener('mousedown', (e) => {
        if (!artifactPanel.classList.contains('open')) return;

        isResizing = true;
        startX = e.clientX;
        startWidth = artifactPanel.offsetWidth;

        resizeHandle.classList.add('dragging');
        artifactPanel.classList.add('resizing');
        document.body.classList.add('resizing');

        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;

        const deltaX = startX - e.clientX;
        let newWidth = startWidth + deltaX;

        const containerWidth = mainContainer.offsetWidth;
        const minWidth = 300;
        const maxWidth = containerWidth * 0.8;
        newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

        artifactPanel.style.width = newWidth + 'px';
    });

    document.addEventListener('mouseup', () => {
        if (!isResizing) return;

        isResizing = false;
        resizeHandle.classList.remove('dragging');
        artifactPanel.classList.remove('resizing');
        document.body.classList.remove('resizing');
    });
}

// =================================
// Project Files Management
// =================================

/**
 * Format file size for display
 * @param {number} bytes
 * @returns {string}
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Get file icon based on extension
 * @param {string} filename 
 * @returns {string}
 */
function getFileIcon(filename) {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const codeExts = ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'go', 'rs', 'rb', 'php'];
    const docExts = ['md', 'txt', 'doc', 'docx', 'pdf'];
    const dataExts = ['json', 'yaml', 'yml', 'xml', 'csv'];

    if (codeExts.includes(ext)) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="16,18 22,12 16,6"/><polyline points="8,6 2,12 8,18"/>
        </svg>`;
    }
    if (dataExts.includes(ext)) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/><polyline points="10,9 9,9 8,9"/>
        </svg>`;
    }
    if (docExts.includes(ext)) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <polyline points="14,2 14,8 20,8"/>
        </svg>`;
    }
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/>
        <polyline points="13,2 13,9 20,9"/>
    </svg>`;
}

/**
 * Render list of project files
 * @param {Project} project 
 * @returns {string}
 */
function renderProjectFilesList(project) {
    const files = project?.files || [];

    if (files.length === 0) {
        return `<div class="project-files-empty">
            <span>No files uploaded yet</span>
        </div>`;
    }

    return files.map(file => `
        <div class="project-file-item" data-file-id="${file.id}">
            <div class="project-file-icon">
                ${getFileIcon(file.name)}
            </div>
            <div class="project-file-info">
                <span class="project-file-name">${escapeHtml(file.name)}</span>
                <span class="project-file-size">${formatFileSize(file.size)}</span>
            </div>
            <button class="project-file-delete" onclick="deleteProjectFile('${project.id}', '${file.id}')" title="Delete file">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
            </button>
        </div>
    `).join('');
}

/**
 * Upload files to project
 * @param {string} projectId 
 * @param {FileList} files 
 */
async function uploadProjectFiles(projectId, files) {
    const project = getProject(projectId);
    if (!project) return;

    const dropzone = document.getElementById('uploadDropzone');
    const filesList = document.getElementById('projectFilesList');
    const filesCount = document.getElementById('projectFilesCount');
    const filesBadge = document.getElementById('filesBadge');

    if (dropzone) {
        dropzone.classList.add('uploading');
        dropzone.innerHTML = `
            <div class="upload-spinner"></div>
            <span>Uploading ${files.length} file(s)...</span>
        `;
    }

    try {
        for (const file of files) {
            // Read file content as text for RAG indexing
            const content = await readFileAsText(file);

            const res = await fetch(`/api/projects/${projectId}/files`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    name: file.name,
                    path: file.name,
                    content: content
                }),
            });

            if (res.ok) {
                const fileInfo = await res.json();
                // Add to local project state
                if (!project.files) project.files = [];
                project.files.push(fileInfo.file || fileInfo);
            } else {
                console.error('Failed to upload file:', file.name);
            }
        }

        // Update UI
        if (filesList) {
            filesList.innerHTML = renderProjectFilesList(project);
        }
        if (filesCount) {
            filesCount.textContent = `${project.files?.length || 0} files`;
        }
        if (filesBadge) {
            filesBadge.textContent = project.files?.length || 0;
        }

        // Update local storage - NO, using backend now
        // saveProjects();

    } catch (err) {
        console.error('Upload error:', err);
    } finally {
        if (dropzone) {
            dropzone.classList.remove('uploading');
            dropzone.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                    <polyline points="17,8 12,3 7,8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <span>Drop files here or click to upload</span>
            `;
        }
    }
}

// Helper for modal file deletion
window.handleModalFileDelete = async function (btn, projectId, fileId) {
    if (!confirm('Delete this file?')) return;

    // Optimistic UI update or wait?
    // Let's wait to be safe, but show loading state?
    const item = btn.closest('.modal-file-item');
    const originalContent = btn.innerHTML;
    btn.innerHTML = '<div class="upload-spinner" style="width:16px;height:16px;border-width:2px;"></div>';

    const success = await deleteProjectFile(projectId, fileId);
    if (success) {
        item.remove();
        // Also update the pending/existing count label if I want to be fancy, but it's okay for now.
    } else {
        btn.innerHTML = originalContent;
        alert('Failed to delete file');
    }
};

/**
 * Delete a file from project
 * @param {string} projectId 
 * @param {string} fileId 
 * @returns {Promise<boolean>}
 */
async function deleteProjectFile(projectId, fileId) {
    if (!confirm('Are you sure you want to delete this file?')) return false;

    try {
        const res = await fetch(`/api/projects/${projectId}/files/${fileId}`, {
            method: 'DELETE',
        });

        if (res.ok) {
            // Update local project state if active
            const project = getProject(projectId);
            if (project && project.files) {
                project.files = project.files.filter(f => f.id !== fileId);

                // Update UI: Find the file item and remove it
                const fileItem = document.querySelector(`.project-file-item[data-file-id="${fileId}"]`);
                if (fileItem) {
                    fileItem.remove();
                } else {
                    // Fallback to updating the whole list if item not found by selector (e.g. pending list uses different structure)
                    const filesList = document.getElementById('projectFilesList');
                    if (filesList) {
                        filesList.innerHTML = renderProjectFilesList(project);
                    }
                }

                // Update counts
                const countLabel = document.querySelector('.project-files-header label');
                if (countLabel) {
                    countLabel.textContent = `Project Files (${project.files.length})`;
                }

                // If list became empty
                const filesList = document.getElementById('projectFilesList');
                if (filesList && project.files.length === 0) {
                    filesList.innerHTML = `<div class="project-files-empty"><span>No files uploaded yet</span></div>`;
                }

                // Logic for pending files is handled by separate removePendingFile
            }
            return true;
        }
        return false;
    } catch (err) {
        console.error('Delete file error:', err);
        alert('Failed to delete file');
        return false;
    }
}

/**
 * Toggle files panel visibility
 */
function toggleFilesPanel() {
    const panel = document.getElementById('projectFilesPanel');
    if (panel) {
        panel.classList.toggle('collapsed');
    }
}

/**
 * Setup file upload listeners
 */
function setupFileUploadListeners() {
    const fileInput = document.getElementById('fileUploadInput');
    const dropzone = document.getElementById('uploadDropzone');
    const toggleBtn = document.getElementById('toggleFilesPanel');

    if (!projectState.activeProject) return;
    const projectId = projectState.activeProject.id;

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (e.target.files?.length) {
                uploadProjectFiles(projectId, e.target.files);
                e.target.value = ''; // Reset input
            }
        });
    }

    if (dropzone) {
        // Drag and drop handlers
        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.add('dragover');
        });

        dropzone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove('dragover');
        });

        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove('dragover');

            if (e.dataTransfer?.files?.length) {
                uploadProjectFiles(projectId, e.dataTransfer.files);
            }
        });
    }

    if (toggleBtn) {
        toggleBtn.addEventListener('click', toggleFilesPanel);
    }
}

// =================================
// Router
// =================================

async function handleRoute() {
    const hash = window.location.hash;

    if (hash.startsWith('#project/')) {
        const projectId = hash.replace('#project/', '');
        await selectProject(projectId);

        if (projectState.activeProject) {
            // Load the project's chat
            try {
                const res = await fetch(`/api/projects/${projectId}/chat`);
                if (res.ok) {
                    const chat = await res.json();
                    // Set the chat state
                    if (typeof chatState !== 'undefined') {
                        chatState.currentChatId = chat.id;
                        chatState.messages = chat.messages || [];
                        chatState.artifacts = chat.artifacts || [];
                    }
                }
            } catch (e) {
                console.error('Failed to load project chat:', e);
            }
            showProjectDetail();
        } else {
            console.warn('Project not found, redirecting to projects list');
            navigateToProjects();
        }
    } else if (hash === '#projects') {
        showProjectsList();
    } else {
        showChatView();
    }
}

// Listen for hash changes
window.addEventListener('hashchange', handleRoute);

// =================================
// Initialize
// =================================

/**
 * Handle file input selection
 */
window.handleFileSelect = function (event, projectId) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    if (projectId && projectId !== 'null' && projectId !== 'undefined') {
        uploadProjectFiles(projectId, files);
    } else {
        // Add to pending uploads
        Array.from(files).forEach(file => pendingUploads.push(file));

        // Update UI counters
        const countLabel = document.querySelector('.project-files-header label');
        if (countLabel) {
            countLabel.textContent = `Project Files (${pendingUploads.length})`;
        }

        // Render pending files list
        const filesList = document.getElementById('projectFilesList');
        if (filesList) {
            filesList.innerHTML = pendingUploads.map((file, index) => `
                <div class="project-file-item new-file">
                    <div class="project-file-icon">
                        ${getFileIcon(file.name)}
                    </div>
                    <div class="project-file-info">
                        <span class="project-file-name">${escapeHtml(file.name)}</span>
                        <span class="project-file-size">${formatFileSize(file.size)}</span>
                        <span class="file-status-badge new">Pending</span>
                    </div>
                    <button class="project-file-delete" onclick="removePendingFile(${index})" type="button">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                    </button>
                </div>
            `).join('');

            // Show empty state removed implicitly by setting innerHTML
        }
    }

    // Reset input
    event.target.value = '';
};

/**
 * Remove pending file
 */
window.removePendingFile = function (index) {
    pendingUploads.splice(index, 1);
    // Re-render
    const filesList = document.getElementById('projectFilesList');
    if (filesList) {
        if (pendingUploads.length === 0) {
            filesList.innerHTML = `<div class="project-files-empty"><span>No files uploaded yet</span></div>`;
        } else {
            filesList.innerHTML = pendingUploads.map((file, idx) => `
                <div class="project-file-item new-file">
                    <div class="project-file-icon">
                        ${getFileIcon(file.name)}
                    </div>
                    <div class="project-file-info">
                        <span class="project-file-name">${escapeHtml(file.name)}</span>
                        <span class="project-file-size">${formatFileSize(file.size)}</span>
                        <span class="file-status-badge new">Pending</span>
                    </div>
                    <button class="project-file-delete" onclick="removePendingFile(${idx})" type="button">
                         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                    </button>
                </div>
            `).join('');
        }

        const countLabel = document.querySelector('.project-files-header label');
        if (countLabel) {
            countLabel.textContent = `Project Files (${pendingUploads.length})`;
        }
    }
};

function initProjects() {
    loadProjects();

    // Load view preference
    const savedView = localStorage.getItem('projects_view');
    if (savedView === 'grid' || savedView === 'list') {
        projectState.view = savedView;
    }

    // Update sidebar
    updateSidebarProjects();
}

// Expose functions globally
window.openCreateProjectModal = openCreateProjectModal;
window.openEditProjectModal = openEditProjectModal;
window.closeProjectModal = closeProjectModal;
window.handleProjectSubmit = handleProjectSubmit;
window.selectProjectColor = selectProjectColor;
window.selectProjectIcon = selectProjectIcon;
window.handleProjectSearch = handleProjectSearch;
window.setProjectsView = setProjectsView;
window.toggleProjectMenu = toggleProjectMenu;
window.confirmDeleteProject = confirmDeleteProject;
window.navigateToProject = navigateToProject;
window.navigateToProjects = navigateToProjects;
window.navigateToChat = navigateToChat;
window.uploadProjectFiles = uploadProjectFiles;
window.deleteProjectFile = deleteProjectFile;
window.toggleFilesPanel = toggleFilesPanel;
window.projectState = projectState;

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    initProjects();
    handleRoute();
});
