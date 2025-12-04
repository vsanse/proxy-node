/**
 * Router for multi-target proxy support
 * Matches incoming requests to configured targets based on patterns
 */

const { 
  patternToRegex, 
  getPatternPrefix, 
  rewritePath, 
  findMatchingTarget,
  createProxyMiddlewareWithConfig 
} = require('./proxy-utils');

/**
 * Create proxy middlewares for all targets
 */
function createProxyMiddlewares(targets, logger) {
  const middlewares = new Map();

  targets.forEach((target) => {
    const middleware = createProxyMiddlewareWithConfig(target, logger, {
      usePathRewrite: true,
      pattern: target.pattern,
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

/**
 * Create a dynamic router that reloads config on each request
 * This allows hot-reloading of targets without server restart
 */
function createDynamicRouter(getConfig, logger) {
  // Cache for proxy middlewares, keyed by target config hash
  const middlewareCache = new Map();

  function getTargetKey(target) {
    return JSON.stringify({
      name: target.name,
      pattern: target.pattern,
      target: target.target,
      cookies: target.cookies,
      headers: target.headers,
    });
  }

  function getOrCreateMiddleware(target) {
    const key = getTargetKey(target);
    if (!middlewareCache.has(key)) {
      const middleware = createProxyMiddlewareWithConfig(target, logger, {
        usePathRewrite: true,
        pattern: target.pattern,
      });
      middlewareCache.set(key, middleware);
    }
    return middlewareCache.get(key);
  }

  return (req, res, next) => {
    // Reload config on each request
    const config = getConfig();

    // Handle empty targets
    if (!config.targets || config.targets.length === 0) {
      return res.status(503).json({
        error: 'No targets configured',
        message: 'Please configure at least one target in proxy-config.json or via environment variables',
        configUI: `http://localhost:${config.port}/_config`,
      });
    }

    const target = findMatchingTarget(req.path, config.targets);

    if (!target) {
      return res.status(404).json({
        error: 'No matching target',
        path: req.path,
        availablePatterns: config.targets.map((t) => t.pattern),
      });
    }

    const middleware = getOrCreateMiddleware(target);
    middleware(req, res, next);
  };
}

module.exports = {
  createRouter,
  createDynamicRouter,
  findMatchingTarget,
  patternToRegex,
};
