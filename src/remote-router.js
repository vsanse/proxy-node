/**
 * Remote Router - Routes proxy requests based on user tokens
 * Each user has isolated targets accessible via their unique token
 */

const { 
  patternToRegex, 
  getPatternPrefix, 
  rewritePath, 
  findMatchingTarget,
  createProxyMiddlewareWithConfig 
} = require('./proxy-utils');
const userStorage = require('./user-storage');

/**
 * Extract user token from request
 * Token can be in:
 * 1. X-Proxy-Token header
 * 2. Query parameter ?token=xxx
 * 3. Path prefix: /t/{token}/rest/of/path
 */
function extractToken(req) {
  // Check header first
  if (req.headers['x-proxy-token']) {
    return { token: req.headers['x-proxy-token'], path: req.path, stripQuery: false };
  }
  
  // Check query parameter
  if (req.query.token) {
    return { token: req.query.token, path: req.path, stripQuery: true };
  }
  
  // Check path prefix: /t/{token}/...
  const pathMatch = req.path.match(/^\/t\/([a-f0-9]{32})(\/.*)?$/);
  if (pathMatch) {
    return { 
      token: pathMatch[1], 
      path: pathMatch[2] || '/',
      stripQuery: false
    };
  }
  
  return { token: null, path: req.path, stripQuery: false };
}

/**
 * Cache for proxy middlewares - keyed by target URL only
 * We handle path rewriting ourselves before passing to the middleware
 */
const middlewareCache = new Map();

function getOrCreateMiddleware(targetConfig, logger) {
  const targetUrl = targetConfig.target;
  
  if (!middlewareCache.has(targetUrl)) {
    const { createProxyMiddleware } = require('http-proxy-middleware');
    const middleware = createProxyMiddleware({
      target: targetUrl,
      changeOrigin: true,
      // Use pathRewrite to return the already-rewritten path stored in req._finalPath
      pathRewrite: (path, req) => {
        const rewritten = req._finalPath || path;
        req._rewrittenPath = rewritten;
        return rewritten;
      },
      onProxyReq: (proxyReq, req, res) => {
        const startTime = Date.now();
        req._proxyStartTime = startTime;
        req._targetName = targetConfig.name;

        // Apply target-specific cookies
        if (targetConfig.cookies && targetConfig.cookies.trim()) {
          proxyReq.setHeader('Cookie', targetConfig.cookies);
        }

        // Apply target-specific headers
        if (targetConfig.headers) {
          Object.entries(targetConfig.headers).forEach(([key, value]) => {
            proxyReq.setHeader(key, value);
          });
        }

        // Log the final path that will be sent
        logger.logRequest(req, targetConfig.name, targetUrl, req._finalPath || req.url);
      },
      onProxyRes: (proxyRes, req, res) => {
        const duration = Date.now() - (req._proxyStartTime || Date.now());
        logger.logResponse(req, proxyRes, targetConfig.name, duration);
      },
      onError: (err, req, res) => {
        logger.logError(req, err, targetConfig.name);
        if (!res.headersSent) {
          res.status(502).json({
            error: 'Proxy error',
            message: err.message,
            target: targetConfig.name,
          });
        }
      },
    });
    middlewareCache.set(targetUrl, middleware);
  }
  
  return middlewareCache.get(targetUrl);
}

/**
 * Create the remote router middleware
 * This router looks up user config based on token and routes accordingly
 */
function createRemoteRouter(logger, baseUrl) {
  return (req, res, next) => {
    try {
      const { token, path: actualPath, stripQuery } = extractToken(req);
      
      // No token provided
      if (!token) {
        return res.status(401).json({
          error: 'No token provided',
          message: 'Please provide your proxy token via X-Proxy-Token header, ?token= query parameter, or /t/{token}/path format',
          createSession: `${baseUrl}/_remote/session`,
          docs: `${baseUrl}/_remote`,
        });
      }
      
      // Invalid/expired token
      const userConfig = userStorage.getUserConfig(token);
      if (!userConfig) {
        return res.status(401).json({
          error: 'Invalid or expired token',
          message: 'Your session has expired or the token is invalid. Please create a new session.',
          createSession: `${baseUrl}/_remote/session`,
        });
      }
      
      // No targets configured
      if (!userConfig.targets || userConfig.targets.length === 0) {
        return res.status(503).json({
          error: 'No targets configured',
          message: 'Please configure at least one target for your session',
          configUI: `${baseUrl}/_remote/config?token=${token}`,
          apiDocs: `${baseUrl}/_remote`,
        });
      }
      
      // Build query string, stripping token if it was passed as query param
      let queryString = '';
      if (req.url.includes('?')) {
        const urlQuery = req.url.substring(req.url.indexOf('?'));
        if (stripQuery) {
          // Remove token from query string
          const params = new URLSearchParams(urlQuery);
          params.delete('token');
          const remaining = params.toString();
          queryString = remaining ? '?' + remaining : '';
        } else {
          queryString = urlQuery;
        }
      }
      
      // Update req.path to use actual path (without token prefix)
      req._originalPath = req.path;
      req._originalUrl = req.url;
      
      // Find matching target
      const target = findMatchingTarget(actualPath, userConfig.targets);
      
      if (!target) {
        return res.status(404).json({
          error: 'No matching target',
          path: actualPath,
          availablePatterns: userConfig.targets.map(t => t.pattern),
        });
      }
      
      // Rewrite the path: strip the pattern prefix (e.g., /lt/* pattern strips /lt)
      const rewrittenPath = rewritePath(actualPath, target.pattern);
      
      // Store final path on request for the middleware to use in logging and pathRewrite
      req._finalPath = rewrittenPath;
      
      // Get middleware for this target and proxy the request
      // The middleware's pathRewrite will use req._finalPath
      const middleware = getOrCreateMiddleware(target, logger);
      middleware(req, res, next);
    } catch (error) {
      return res.status(500).json({
        error: 'Router error',
        message: error.message,
        stack: error.stack,
      });
    }
  };
}

module.exports = {
  createRemoteRouter,
  extractToken,
};
