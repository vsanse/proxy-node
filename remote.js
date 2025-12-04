/**
 * Remote Proxy Server
 * 
 * A multi-tenant proxy server with:
 * - CORS enabled for all origins
 * - User-specific configurations via unique tokens
 * - In-memory storage (no file-based config conflicts)
 * 
 * Usage:
 *   npm run remote
 *   PORT=3002 npm run remote
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const logger = require('./src/logger');
const { createRemoteRouter } = require('./src/remote-router');
const remoteConfigUI = require('./src/remote-config-ui');
const userStorage = require('./src/user-storage');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3001;

// Get base URL for responses
function getBaseUrl(req) {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${protocol}://${host}`;
}

// Initialize logger with minimal config (no file logging in remote mode)
const logConfig = {
  port: PORT,
  logging: {
    enabled: process.env.LOG_ENABLED !== 'false',
    logToFile: false, // Don't write logs to file in remote mode
    logDir: './logs',
    logRequestBody: process.env.LOG_REQUEST_BODY === 'true',
    logResponseBody: process.env.LOG_RESPONSE_BODY === 'true',
  },
  targets: [],
};

logger.init(logConfig);

// ============ Express Middleware ============
// Parse query parameters (required for ?token=xxx)
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ============ CORS - Allow all origins ============
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Proxy-Token', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Length', 'Content-Type'],
  credentials: false, // Must be false when origin is *
  maxAge: 86400, // 24 hours
}));

// Handle preflight requests
app.options('*', cors());

// ============ Remote Configuration UI ============
app.use('/_remote', remoteConfigUI);

// ============ Health Check ============
app.get('/_health', (req, res) => {
  res.json({
    status: 'healthy',
    mode: 'remote',
    uptime: process.uptime(),
    activeSessions: userStorage.getActiveSessionCount(),
  });
});

// ============ Landing Page ============
app.get('/_info', (req, res) => {
  const baseUrl = getBaseUrl(req);
  
  res.json({
    name: 'Remote Proxy Server',
    mode: 'remote',
    description: 'Multi-tenant proxy server with user-isolated configurations',
    docs: `${baseUrl}/_remote`,
    endpoints: {
      createSession: {
        method: 'POST',
        url: `${baseUrl}/_remote/api/session`,
        description: 'Create a new session and get your unique token',
      },
      configUI: {
        method: 'GET',
        url: `${baseUrl}/_remote/config?token=YOUR_TOKEN`,
        description: 'Web UI to manage your proxy targets',
      },
      addTarget: {
        method: 'POST',
        url: `${baseUrl}/_remote/api/targets?token=YOUR_TOKEN`,
        description: 'Add a proxy target',
        body: {
          name: 'my-api',
          pattern: '/api/*',
          target: 'https://api.example.com',
          cookies: 'optional-cookies',
          headers: { Authorization: 'Bearer token' },
        },
      },
      proxy: {
        description: 'Make requests through the proxy',
        methods: [
          `curl -H "X-Proxy-Token: YOUR_TOKEN" ${baseUrl}/api/users`,
          `curl "${baseUrl}/api/users?token=YOUR_TOKEN"`,
          `curl ${baseUrl}/t/YOUR_TOKEN/api/users`,
        ],
      },
    },
    health: `${baseUrl}/_health`,
  });
});

// ============ Proxy Router ============
// This must be last - it handles all other requests
app.use('/', (req, res, next) => {
  // Skip internal routes - let them 404 naturally if not matched
  if (req.path.startsWith('/_')) {
    return next();
  }
  
  // Update baseUrl for router and handle the proxy request
  const baseUrl = getBaseUrl(req);
  const router = createRemoteRouter(logger, baseUrl);
  router(req, res, next);
});

// ============ Error Handler ============
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

// ============ Start Server ============
app.listen(PORT, () => {
  console.log('\n🌐 ========================================');
  console.log('   REMOTE PROXY SERVER');
  console.log('   ========================================\n');
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`🔧 Configuration UI: http://localhost:${PORT}/_remote`);
  console.log(`💚 Health check: http://localhost:${PORT}/_health`);
  console.log('\n📋 Quick Start:');
  console.log(`   1. Create a session: POST http://localhost:${PORT}/_remote/api/session`);
  console.log(`   2. Add targets via UI: http://localhost:${PORT}/_remote/config?token=YOUR_TOKEN`);
  console.log(`   3. Proxy requests with X-Proxy-Token header\n`);
  console.log('🌍 CORS: Enabled for all origins');
  console.log('💾 Storage: In-memory with file backup (.remote-sessions.json)\n');
});

// ============ Graceful Shutdown ============
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down remote proxy server...');
  userStorage.forceSave();
  logger.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down remote proxy server...');
  userStorage.forceSave();
  logger.close();
  process.exit(0);
});
