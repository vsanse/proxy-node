require('dotenv').config();
const express = require('express');
const { getConfig } = require('./src/config');
const logger = require('./src/logger');
const { createDynamicRouter } = require('./src/router');
const configUI = require('./src/config-ui');

const app = express();

// Load initial configuration
const initialConfig = getConfig();

// Initialize logger
logger.init(initialConfig);
logger.logStartup(initialConfig);

// Configuration UI routes (must be before proxy)
app.use('/_config', configUI);

// Health check endpoint (dynamically reads config)
app.get('/_health', (req, res) => {
  const config = getConfig();
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    targets: config.targets.length,
  });
});

// Create and apply the dynamic proxy router (reloads config on each request)
const proxyRouter = createDynamicRouter(getConfig, logger);
app.use('/', proxyRouter);

// Start server
app.listen(initialConfig.port, () => {
  console.log(`\n✅ Proxy server running on http://localhost:${initialConfig.port}`);
  console.log(`🔧 Configuration UI: http://localhost:${initialConfig.port}/_config`);
  console.log(`💚 Health check: http://localhost:${initialConfig.port}/_health`);
  console.log(`\n📝 Point your local app to http://localhost:${initialConfig.port}\n`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down proxy server...');
  logger.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down proxy server...');
  logger.close();
  process.exit(0);
});
