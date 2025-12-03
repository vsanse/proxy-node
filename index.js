require('dotenv').config();
const express = require('express');
const { getConfig } = require('./src/config');
const logger = require('./src/logger');
const { createRouter } = require('./src/router');
const configUI = require('./src/config-ui');

const app = express();

// Load configuration
const config = getConfig();

// Initialize logger
logger.init(config);
logger.logStartup(config);

// Configuration UI routes (must be before proxy)
app.use('/_config', configUI);

// Health check endpoint
app.get('/_health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    targets: config.targets.length,
  });
});

// Create and apply the proxy router
const proxyRouter = createRouter(config, logger);
app.use('/', proxyRouter);

// Start server
app.listen(config.port, () => {
  console.log(`\n✅ Proxy server running on http://localhost:${config.port}`);
  console.log(`🔧 Configuration UI: http://localhost:${config.port}/_config`);
  console.log(`💚 Health check: http://localhost:${config.port}/_health`);
  console.log(`\n📝 Point your local app to http://localhost:${config.port}\n`);
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
