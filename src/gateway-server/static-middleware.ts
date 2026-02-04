/**
 * Static File Server
 * 
 * Serve static files with caching and security
 */

import path from 'path';
import { createReadStream, existsSync, statSync } from 'fs';
import crypto from 'crypto';
import { createGzip } from 'zlib';
import type { Request, Response, Middleware, StaticConfig } from './types';

/**
 * MIME type mapping
 */
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
  '.pdf': 'application/pdf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
};

/**
 * Get MIME type from filename
 */
function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

/**
 * Generate ETag from file stats
 */
function generateETag(stats: { size: number; mtimeMs: number }): string {
  const hash = crypto.createHash('md5');
  hash.update(`${stats.size}-${stats.mtimeMs}`);
  return `"${hash.digest('hex')}"`;
}

/**
 * Check if path is safe (no directory traversal)
 */
function resolveSafeFilePath(requestPath: string, rootPath: string): string | null {
  // Ensure we resolve relative to root (strip leading slashes)
  const rel = requestPath.replace(/^\/+/, '');
  const resolved = path.resolve(rootPath, rel);

  // Must be inside root
  const rootWithSep = rootPath.endsWith(path.sep) ? rootPath : rootPath + path.sep;
  if (resolved === rootPath || resolved.startsWith(rootWithSep)) {
    return resolved;
  }

  return null;
}

/**
 * Create static file middleware
 */
export function createStaticMiddleware(config: StaticConfig): Middleware {
  if (!config.enabled) {
    // Pass-through if disabled
    return async (_req, _res, next) => {
      await next();
    };
  }

  const {
    root,
    index = 'index.html',
    maxAge = 3600,
    compression = true,
  } = config;

  const rootPath = path.resolve(root);

  return async (req: Request, res: Response, next) => {
    // Only handle GET/HEAD
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      await next();
      return;
    }

    // Decode URL path
    let requestPath: string;
    try {
      requestPath = decodeURIComponent(req.path);
    } catch (error) {
      res.status(400).text('Bad Request');
      return;
    }

    // Resolve and validate path (prevents path traversal)
    const resolvedPath = resolveSafeFilePath(requestPath, rootPath);
    if (!resolvedPath) {
      res.status(403).text('Forbidden');
      return;
    }

    // Build file path
    let filePath = resolvedPath;

    // Check if path exists
    if (!existsSync(filePath)) {
      await next();
      return;
    }

    // If directory, try index file
    const stats = statSync(filePath);
    if (stats.isDirectory()) {
      filePath = path.join(filePath, index);
      
      if (!existsSync(filePath)) {
        await next();
        return;
      }
    }

    // Re-check after potential index resolution
    const fileStats = statSync(filePath);
    if (!fileStats.isFile()) {
      await next();
      return;
    }

    // Generate ETag
    const etag = generateETag(fileStats);

    // Check If-None-Match (ETag caching)
    const ifNoneMatch = req.headers['if-none-match'];
    if (ifNoneMatch === etag) {
      res.status(304).send();
      return;
    }

    // Set headers
    const mimeType = getMimeType(filePath);
    res.header('Content-Type', mimeType);
    res.header('ETag', etag);
    res.header('Cache-Control', `public, max-age=${maxAge}`);
    res.header('Last-Modified', fileStats.mtime.toUTCString());
    res.header('Vary', 'Accept-Encoding');

    // Stream file
    if (req.method === 'HEAD') {
      // No body, but we can still set length for uncompressed
      res.header('Content-Length', fileStats.size);
      res.send();
    } else {
      const stream = createReadStream(filePath);

      // Compression support (only if we actually compress)
      const acceptEncoding = req.headers['accept-encoding'] || '';
      if (compression && acceptEncoding.includes('gzip')) {
        res.header('Content-Encoding', 'gzip');
        // When gzipping, don't send Content-Length (unknown)
        const gzip = createGzip();
        res.stream(stream.pipe(gzip));
      } else {
        res.header('Content-Length', fileStats.size);
        res.stream(stream);
      }
    }
  };
}
