/**
 * Shared Proxy Utilities
 * 
 * Common functions used by both router.js and remote-router.js
 */

const { createProxyMiddleware } = require('http-proxy-middleware');

/**
 * Convert a simple pattern to a regex
 * Supports:
 *   - /api/* -> matches /api/anything
 *   - /users/** -> matches /users/a/b/c (deep)
 *   - /exact/path -> matches exactly
 *   - /* -> matches everything (catch-all)
 */
function patternToRegex(pattern) {
  if (pattern === '/*' || pattern === '/**') {
    return /.*/;
  }

  let regexStr = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape special regex chars (except *)
    .replace(/\*\*/g, '___DOUBLESTAR___') // Temp placeholder for **
    .replace(/\*/g, '[^/]*') // * matches anything except /
    .replace(/___DOUBLESTAR___/g, '.*'); // ** matches anything including /

  return new RegExp(`^${regexStr}`);
}

/**
 * Extract the prefix from a pattern (the static part before wildcards)
 * e.g., /elca/* -> /elca, /service-a/** -> /service-a, /* -> ''
 */
function getPatternPrefix(pattern) {
  // Remove trailing wildcards and slashes
  const prefix = pattern.replace(/\/?\*+$/, '');
  return prefix;
}

/**
 * Rewrite the request path by stripping the pattern prefix
 * e.g., pattern: /elca/*, path: /elca/api/users -> /api/users
 */
function rewritePath(path, pattern) {
  const prefix = getPatternPrefix(pattern);
  
  // If no prefix (catch-all pattern), return path as-is
  if (!prefix) {
    return path;
  }
  
  // Strip the prefix from the path
  if (path.startsWith(prefix)) {
    const rewritten = path.slice(prefix.length);
    // Ensure path starts with /
    return rewritten.startsWith('/') ? rewritten : '/' + rewritten;
  }
  
  return path;
}

/**
 * Find the matching target for a request path
 * More specific patterns are checked first
 */
function findMatchingTarget(path, targets) {
  // Sort targets by specificity (longer patterns first, catch-all last)
  const sortedTargets = [...targets].sort((a, b) => {
    if (a.pattern === '/*' || a.pattern === '/**') return 1;
    if (b.pattern === '/*' || b.pattern === '/**') return -1;
    return b.pattern.length - a.pattern.length;
  });

  for (const target of sortedTargets) {
    const regex = patternToRegex(target.pattern);
    if (regex.test(path)) {
      return target;
    }
  }

  return null;
}

/**
 * Create a proxy middleware with common configuration
 * This middleware factory is used by both local and remote routers
 * 
 * @param {Object} target - Target configuration { name, target, cookies, headers }
 * @param {Object} logger - Logger instance
 * @param {Object} options - Additional options
 * @param {boolean} options.usePathRewrite - Whether to use pathRewrite (default: true)
 * @param {string} options.pattern - Pattern to rewrite (required if usePathRewrite is true)
 * @returns {Function} Express middleware
 */
function createProxyMiddlewareWithConfig(target, logger, options = {}) {
  const { usePathRewrite = true, pattern } = options;
  
  const config = {
    target: target.target,
    changeOrigin: true,
    // If not using pathRewrite (remote router), use router function to accept all paths
    ...(usePathRewrite ? {} : { router: () => target.target }),
    onProxyReq: (proxyReq, req, res) => {
      const startTime = Date.now();
      req._proxyStartTime = startTime;
      req._targetName = target.name;

      // Attach cookies (only if non-empty)
      if (target.cookies && target.cookies.trim()) {
        proxyReq.setHeader('Cookie', target.cookies);
      }

      // Attach custom headers
      if (target.headers) {
        Object.entries(target.headers).forEach(([key, value]) => {
          proxyReq.setHeader(key, value);
        });
      }

      // Log with rewritten path if available
      const finalPath = req._rewrittenPath || req._finalPath || req.path;
      logger.logRequest(req, target.name, target.target, finalPath);
    },
    onProxyRes: (proxyRes, req, res) => {
      const duration = Date.now() - (req._proxyStartTime || Date.now());
      logger.logResponse(req, proxyRes, target.name, duration);
    },
    onError: (err, req, res) => {
      logger.logError(req, err, target.name);
      if (!res.headersSent) {
        res.status(502).json({
          error: 'Proxy error',
          message: err.message,
          target: target.name,
        });
      }
    },
  };

  // Add pathRewrite if requested (used by local router)
  if (usePathRewrite && pattern) {
    config.pathRewrite = (path, req) => {
      const rewritten = rewritePath(path, pattern);
      req._rewrittenPath = rewritten;
      return rewritten;
    };
  }

  return createProxyMiddleware(config);
}

module.exports = {
  patternToRegex,
  getPatternPrefix,
  rewritePath,
  findMatchingTarget,
  createProxyMiddlewareWithConfig,
};
