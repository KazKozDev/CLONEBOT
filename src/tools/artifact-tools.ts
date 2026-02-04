/**
 * Artifact Tools
 * 
 * Tools for creating various types of artifacts:
 * - Mermaid diagrams
 * - React components
 * - Web pages
 */

import { getDataStore } from '../gateway-server/data-store';
import { randomUUID } from 'crypto';

// ============================================================================
// Constants & Templates
// ============================================================================

const MERMAID_HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: {background};
            padding: 20px;
            box-sizing: border-box;
        }
        .mermaid {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
    </style>
</head>
<body>
    <pre class="mermaid">
{content}
    </pre>
    <script>
        mermaid.initialize({ 
            startOnLoad: true,
            theme: '{theme}',
            securityLevel: 'loose'
        });
    </script>
</body>
</html>`;

const REACT_HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    
    <!-- React -->
    <script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin></script>
    <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin></script>
    
    <!-- Babel for JSX -->
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 
                         'Helvetica Neue', Arial, sans-serif;
            background: {background};
            min-height: 100vh;
        }
        
        #root {
            padding: 20px;
        }
{custom_css}
    </style>
</head>
<body>
    <div id="root"></div>
    
    <script type="text/babel">
{component_code}

// Render the component
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
    </script>
</body>
</html>`;

const REACT_UI_HELPERS = `
// UI Helper Components
const Button = ({ children, onClick, variant = 'primary', ...props }) => {
    const styles = {
        padding: '10px 20px',
        borderRadius: '8px',
        border: 'none',
        cursor: 'pointer',
        fontWeight: '600',
        fontSize: '14px',
        transition: 'all 0.2s',
        ...(variant === 'primary' && {
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
        }),
        ...(variant === 'secondary' && {
            background: '#f0f0f0',
            color: '#333',
        }),
        ...(variant === 'danger' && {
            background: '#ff4757',
            color: 'white',
        }),
    };
    return <button style={styles} onClick={onClick} {...props}>{children}</button>;
};

const Card = ({ children, title, ...props }) => {
    const styles = {
        background: 'white',
        borderRadius: '12px',
        padding: '24px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
        marginBottom: '16px',
    };
    return (
        <div style={styles} {...props}>
            {title && <h2 style={{ marginBottom: '16px', color: '#333' }}>{title}</h2>}
            {children}
        </div>
    );
};

const Input = ({ label, ...props }) => {
    const containerStyle = { marginBottom: '16px' };
    const labelStyle = { display: 'block', marginBottom: '6px', fontWeight: '500', color: '#555' };
    const inputStyle = {
        width: '100%',
        padding: '12px',
        borderRadius: '8px',
        border: '1px solid #ddd',
        fontSize: '14px',
        transition: 'border-color 0.2s',
    };
    return (
        <div style={containerStyle}>
            {label && <label style={labelStyle}>{label}</label>}
            <input style={inputStyle} {...props} />
        </div>
    );
};
`;

const WEB_HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <style>
{css}
    </style>
</head>
<body>
{body}
    <script>
{javascript}
    </script>
</body>
</html>`;

// ============================================================================
// Helpers
// ============================================================================

function sanitizeFilename(title: string): string {
    return title.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 50);
}

function saveArtifactFile(filename: string, content: string): string {
    const store = getDataStore();
    return store.saveArtifact(filename, content);
}

// ============================================================================
// Tools
// ============================================================================

export const artifactTools = [
    // -------------------------------------------------------------------------
    // Mermaid Tool
    // -------------------------------------------------------------------------
    {
        name: 'create_mermaid_artifact',
        description: 'Creates a Mermaid diagram (flowchart, sequence, class, ER, Gantt, etc.). Generates an HTML file with the rendered diagram.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                title: {
                    type: 'string',
                    description: 'Diagram title',
                },
                content: {
                    type: 'string',
                    description: 'Mermaid diagram code. Examples:\n- flowchart TD\n  A-->B\n- sequenceDiagram\n  Alice->>Bob: Hi',
                },
                theme: {
                    type: 'string',
                    description: 'Theme (default, dark, forest, neutral)',
                    enum: ['default', 'dark', 'forest', 'neutral'],
                    default: 'default',
                },
                background: {
                    type: 'string',
                    description: 'CSS background color',
                    default: '#f5f5f5',
                },
                filename: {
                    type: 'string',
                    description: 'Optional filename (without extension)',
                }
            },
            required: ['title', 'content'],
        },
        handler: async (args: { title: string; content: string; theme?: string; background?: string; filename?: string }) => {
            try {
                const { title, content, theme = 'default', background = '#f5f5f5' } = args;

                const html = MERMAID_HTML_TEMPLATE
                    .replace('{title}', title)
                    .replace('{content}', content)
                    .replace('{theme}', theme)
                    .replace('{background}', background);

                const safeTitle = sanitizeFilename(args.filename || title);
                const id = randomUUID().slice(0, 8);
                const filename = `${safeTitle}_${id}.html`;

                const filePath = saveArtifactFile(filename, html);

                return {
                    content: `Mermaid artifact created: ${filename}`,
                    data: { filename, filePath, type: 'mermaid' },
                    success: true,
                };
            } catch (error: any) {
                return {
                    content: `Error creating mermaid artifact: ${error.message}`,
                    error: error.message,
                    success: false,
                };
            }
        },
    },

    // -------------------------------------------------------------------------
    // React Tool
    // -------------------------------------------------------------------------
    {
        name: 'create_react_artifact',
        description: 'Creates an interactive React component. The component must be named "App". Helper components (Button, Card, Input) are available.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                title: { type: 'string', description: 'Component title' },
                content: {
                    type: 'string',
                    description: 'React component code. Must include "function App() { ... }" or "const App = () => { ... }". Available: React, useState, useEffect. Helpers: Button, Card, Input.'
                },
                css: { type: 'string', description: 'Additional CSS styles' },
                background: { type: 'string', description: 'Background color', default: '#f5f5f5' },
                include_ui_helpers: { type: 'boolean', description: 'Include UI helpers', default: true },
                filename: { type: 'string', description: 'Optional filename' }
            },
            required: ['title', 'content'],
        },
        handler: async (args: { title: string; content: string; css?: string; background?: string; include_ui_helpers?: boolean; filename?: string }) => {
            try {
                const { title, content, css = '', background = '#f5f5f5', include_ui_helpers = true } = args;

                let componentCode = '';
                if (include_ui_helpers) {
                    componentCode += REACT_UI_HELPERS + '\n\n';
                }
                componentCode += content;

                let customCss = '';
                if (css) {
                    customCss = `\n        /* Custom styles */\n${css}`;
                }

                const html = REACT_HTML_TEMPLATE
                    .replace('{title}', title)
                    .replace('{background}', background)
                    .replace('{custom_css}', customCss)
                    .replace('{component_code}', componentCode);

                const safeTitle = sanitizeFilename(args.filename || title);
                const id = randomUUID().slice(0, 8);
                const filename = `${safeTitle}_${id}.html`;

                const filePath = saveArtifactFile(filename, html);

                return {
                    content: `React artifact created: ${filename}`,
                    data: { filename, filePath, type: 'react' },
                    success: true,
                };
            } catch (error: any) {
                return {
                    content: `Error creating react artifact: ${error.message}`,
                    error: error.message,
                    success: false,
                };
            }
        },
    },

    // -------------------------------------------------------------------------
    // Web Tool
    // -------------------------------------------------------------------------
    {
        name: 'create_web_artifact',
        description: 'Creates an interactive web page (HTML/CSS/JS).',
        inputSchema: {
            type: 'object' as const,
            properties: {
                title: { type: 'string', description: 'Page title' },
                content: { type: 'string', description: 'HTML body content' },
                css: { type: 'string', description: 'CSS styles (without tags)' },
                javascript: { type: 'string', description: 'JS code (without tags)' },
                filename: { type: 'string', description: 'Optional filename' }
            },
            required: ['title', 'content'],
        },
        handler: async (args: { title: string; content: string; css?: string; javascript?: string; filename?: string }) => {
            try {
                const { title, content, css = '', javascript = '' } = args;

                const html = WEB_HTML_TEMPLATE
                    .replace('{title}', title)
                    .replace('{css}', css)
                    .replace('{body}', content)
                    .replace('{javascript}', javascript);

                const safeTitle = sanitizeFilename(args.filename || title);
                const id = randomUUID().slice(0, 8);
                const filename = `${safeTitle}_${id}.html`;

                const filePath = saveArtifactFile(filename, html);

                return {
                    content: `Web artifact created: ${filename}`,
                    data: { filename, filePath, type: 'web' },
                    success: true,
                };
            } catch (error: any) {
                return {
                    content: `Error creating web artifact: ${error.message}`,
                    error: error.message,
                    success: false,
                };
            }
        },
    },

    // -------------------------------------------------------------------------
    // SVG Tool
    // -------------------------------------------------------------------------
    {
        name: 'create_svg_artifact',
        description: 'Creates an SVG vector image (icons, diagrams, logos). Can handle raw elements or full SVG content.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                title: { type: 'string', description: 'Image title' },
                content: { type: 'string', description: 'SVG elements (rect, circle, path...) or full SVG if full_svg=true' },
                width: { type: 'integer', description: 'Width px', default: 400 },
                height: { type: 'integer', description: 'Height px', default: 300 },
                viewbox: { type: 'string', description: 'SVG viewBox e.g "0 0 100 100"' },
                defs: { type: 'string', description: 'Custom definitions (gradients, patterns)' },
                full_svg: { type: 'boolean', description: 'If true, content is full SVG file', default: false },
                filename: { type: 'string', description: 'Optional filename' }
            },
            required: ['title', 'content'],
        },
        handler: async (args: { title: string; content: string; width?: number; height?: number; viewbox?: string; defs?: string; full_svg?: boolean; filename?: string }) => {
            try {
                const { title, content, width = 400, height = 300, full_svg = false, defs = '' } = args;

                let svgContent = content;

                if (!full_svg && !content.trim().startsWith('<svg')) {
                    const viewboxStr = args.viewbox || `0 0 ${width} ${height}`;

                    svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" 
     xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${width}" height="${height}" 
     viewBox="${viewboxStr}">
  <title>${title}</title>
  <defs>
    <linearGradient id="gradient_blue" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
    </linearGradient>
    <linearGradient id="gradient_green" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#11998e;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#38ef7d;stop-opacity:1" />
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="2" dy="2" stdDeviation="3" flood-opacity="0.3"/>
    </filter>
${defs}
  </defs>
${content}
</svg>`;
                }

                const safeTitle = sanitizeFilename(args.filename || title);
                const id = randomUUID().slice(0, 8);
                const filename = `${safeTitle}_${id}.svg`;

                const filePath = saveArtifactFile(filename, svgContent);

                return {
                    content: `SVG artifact created: ${filename}`,
                    data: { filename, filePath, type: 'svg' },
                    success: true,
                };
            } catch (error: any) {
                return {
                    content: `Error creating SVG artifact: ${error.message}`,
                    error: error.message,
                    success: false,
                };
            }
        },
    },

    // -------------------------------------------------------------------------
    // Document Tool
    // -------------------------------------------------------------------------
    {
        name: 'create_document_artifact',
        description: 'Creates a document (README, guide, note, etc.) and saves it.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                title: { type: 'string', description: 'Document title' },
                content: { type: 'string', description: 'Document content' },
                format: {
                    type: 'string',
                    description: 'Format (markdown, text, html, etc.)',
                    enum: ['markdown', 'text', 'html', 'json', 'yaml', 'xml'],
                    default: 'markdown'
                },
                template: {
                    type: 'string',
                    description: 'Template (readme, changelog, guide, notes, code)',
                    enum: ['readme', 'changelog', 'guide', 'notes', 'code']
                },
                filename: { type: 'string', description: 'Optional filename' }
            },
            required: ['title', 'content'],
        },
        handler: async (args: { title: string; content: string; format?: string; template?: string; filename?: string }) => {
            try {
                const { title, content, format = 'markdown', template } = args;

                let processedContent = content;
                const today = new Date().toISOString().split('T')[0];

                if (template === 'readme') {
                    processedContent = `# ${title}\n\n${content}`;
                } else if (template === 'changelog') {
                    processedContent = `# Changelog\n\n${content}`;
                } else if (template === 'guide') {
                    processedContent = `# ${title}\n\n## Introduction\n\n${content}`;
                } else if (template === 'notes') {
                    processedContent = `# ${title}\n\n_Created: ${today}_\n\n${content}`;
                } else if (template === 'code') {
                    processedContent = `# ${title}\n\n${content}`;
                }

                const extMap: Record<string, string> = {
                    'markdown': '.md', 'md': '.md',
                    'text': '.txt', 'txt': '.txt',
                    'html': '.html',
                    'json': '.json',
                    'yaml': '.yaml',
                    'xml': '.xml'
                };

                const ext = extMap[format.toLowerCase()] || '.txt';

                const safeTitle = sanitizeFilename(args.filename || title);
                const id = randomUUID().slice(0, 8);
                const filename = `${safeTitle}_${id}${ext}`;

                const filePath = saveArtifactFile(filename, processedContent);

                return {
                    content: `Document artifact created: ${filename}`,
                    data: { filename, filePath, type: 'document', format },
                    success: true,
                };
            } catch (error: any) {
                return {
                    content: `Error creating document artifact: ${error.message}`,
                    error: error.message,
                    success: false,
                };
            }
        },
    }
];
