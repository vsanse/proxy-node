/**
 * Logger module for request/response logging
 * Supports console and file-based logging
 */

const fs = require('fs');
const path = require('path');

let config = null;
let logStream = null;

/**
 * Initialize the logger with configuration
 */
function init(cfg) {
  config = cfg;

  if (config.logging.logToFile) {
    const logDir = path.resolve(config.logging.logDir);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const logFile = path.join(logDir, `proxy-${getDateString()}.log`);
    logStream = fs.createWriteStream(logFile, { flags: 'a' });
    console.log(`📁 Logging to file: ${logFile}`);
  }
}

/**
 * Get date string for log file naming
 */
function getDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * Get timestamp for log entries
 */
function getTimestamp() {
  return new Date().toISOString();
}

/**
 * Format a log entry
 */
function formatLogEntry(entry) {
  return JSON.stringify({
    timestamp: getTimestamp(),
    ...entry,
  });
}

/**
 * Write to log output(s)
 */
function write(message) {
  if (!config?.logging?.enabled) return;

  if (logStream) {
    logStream.write(message + '\n');
  }
}

/**
 * Log an incoming request
 */
function logRequest(req, targetName, targetUrl, rewrittenPath) {
  if (!config?.logging?.enabled) return;

  const finalPath = rewrittenPath || req.originalUrl;
  
  const entry = {
    type: 'request',
    method: req.method,
    originalPath: req.originalUrl,
    rewrittenPath: finalPath,
    target: targetName,
    targetUrl: targetUrl,
    headers: sanitizeHeaders(req.headers),
  };

  if (config.logging.logRequestBody && req.body) {
    entry.body = req.body;
  }

  const formatted = formatLogEntry(entry);
  write(formatted);

  // Console output showing the rewrite
  if (rewrittenPath && rewrittenPath !== req.originalUrl) {
    console.log(`➡️  [${req.method}] ${req.originalUrl} -> ${targetUrl}${finalPath}`);
  } else {
    console.log(`➡️  [${req.method}] ${req.originalUrl} -> ${targetUrl}${req.originalUrl}`);
  }
}

/**
 * Log a proxy response
 */
function logResponse(req, res, targetName, duration) {
  if (!config?.logging?.enabled) return;

  const entry = {
    type: 'response',
    method: req.method,
    path: req.originalUrl,
    target: targetName,
    statusCode: res.statusCode,
    duration: `${duration}ms`,
  };

  const formatted = formatLogEntry(entry);
  write(formatted);

  // Console output with color based on status
  const statusEmoji = res.statusCode >= 400 ? '❌' : res.statusCode >= 300 ? '↪️' : '⬅️';
  console.log(`${statusEmoji}  [${res.statusCode}] ${req.originalUrl} (${duration}ms)`);
}

/**
 * Log a proxy error
 */
function logError(req, error, targetName) {
  if (!config?.logging?.enabled) return;

  const entry = {
    type: 'error',
    method: req.method,
    path: req.originalUrl,
    target: targetName,
    error: error.message,
    stack: error.stack,
  };

  const formatted = formatLogEntry(entry);
  write(formatted);

  console.error(`❌ Proxy error: ${error.message}`);
}

/**
 * Log server startup info
 */
function logStartup(config) {
  console.log(`\n🚀 ProxyKit starting...`);
  console.log(`📡 Port: ${config.port}`);
  console.log(`📋 Configured targets:`);
  config.targets.forEach((t, i) => {
    console.log(`   ${i + 1}. [${t.name}] ${t.pattern} -> ${t.target}`);
    if (t.cookies && t.cookies.trim()) {
      console.log(`      🍪 Cookies: ${t.cookies.substring(0, 30)}...`);
    }
    if (t.headers && Object.keys(t.headers).length > 0) {
      console.log(`      📎 Headers: ${Object.keys(t.headers).join(', ')}`);
    }
  });
  console.log(`\n📝 Logging: ${config.logging.enabled ? 'enabled' : 'disabled'}`);
  if (config.logging.logToFile) {
    console.log(`📁 Log directory: ${config.logging.logDir}`);
  }
}

/**
 * Sanitize headers for logging (remove sensitive data)
 */
function sanitizeHeaders(headers) {
  const sanitized = { ...headers };
  const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key', 'x-auth-token'];

  sensitiveHeaders.forEach((h) => {
    if (sanitized[h]) {
      sanitized[h] = '[REDACTED]';
    }
  });

  return sanitized;
}

/**
 * Close the logger
 */
function close() {
  if (logStream) {
    logStream.end();
    logStream = null;
  }
}

module.exports = {
  init,
  logRequest,
  logResponse,
  logError,
  logStartup,
  close,
};
