/**
 * Router for multi-target proxy support
 * Matches incoming requests to configured targets based on patterns
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
 * Create proxy middlewares for all targets
 */
function createProxyMiddlewares(targets, logger) {
  const middlewares = new Map();

  targets.forEach((target) => {
    const middleware = createProxyMiddleware({
      target: target.target,
      changeOrigin: true,
      pathRewrite: (path, req) => {
        // Strip the pattern prefix from the path
        const rewritten = rewritePath(path, target.pattern);
        req._rewrittenPath = rewritten; // Store for logging
        return rewritten;
      },
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

        // Log with rewritten path
        const finalPath = req._rewrittenPath || req.path;
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
    });

    middlewares.set(target.name, { target, middleware });
  });

  return middlewares;
}

/**
 * Create the main router middleware
 */
function createRouter(config, logger) {
  // Handle empty targets gracefully
  if (!config.targets || config.targets.length === 0) {
    return (req, res, next) => {
      return res.status(503).json({
        error: 'No targets configured',
        message: 'Please configure at least one target in proxy-config.json or via environment variables',
        configUI: `http://localhost:${config.port}/_config`,
      });
    };
  }

  const middlewares = createProxyMiddlewares(config.targets, logger);

  return (req, res, next) => {
    const target = findMatchingTarget(req.path, config.targets);

    if (!target) {
      return res.status(404).json({
        error: 'No matching target',
        path: req.path,
        availablePatterns: config.targets.map((t) => t.pattern),
      });
    }

    const { middleware } = middlewares.get(target.name);
    middleware(req, res, next);
  };
}

module.exports = {
  createRouter,
  findMatchingTarget,
  patternToRegex,
};
