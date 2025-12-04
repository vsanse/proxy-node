/**
 * Configuration UI - Web interface for managing proxy settings
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const pug = require('pug');
const router = express.Router();
const config = require('./config');

// Compile the Pug template
const viewsPath = path.join(__dirname, 'views');
let configTemplate = pug.compileFile(path.join(viewsPath, 'config.pug'));

// SSE clients for live reload
const sseClients = new Set();

// Watch for config file changes
const configFilePath = config.CONFIG_FILE;
let lastConfigMtime = 0;

// Also watch the views directory for template changes
const watchPaths = [configFilePath, viewsPath];

watchPaths.forEach(watchPath => {
  if (fs.existsSync(watchPath)) {
    fs.watch(watchPath, { recursive: true }, (eventType, filename) => {
      // Recompile template if pug/css files change
      if (filename && (filename.endsWith('.pug') || filename.endsWith('.css'))) {
        try {
          configTemplate = pug.compileFile(path.join(viewsPath, 'config.pug'));
          console.log('🔄 Template recompiled');
        } catch (err) {
          console.error('Template compile error:', err.message);
        }
      }
      
      // Notify all SSE clients to reload
      notifyClients('reload');
    });
  }
});

/**
 * Notify all connected SSE clients
 */
function notifyClients(event, data = {}) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(client => {
    client.write(message);
  });
}

// SSE endpoint for live reload
router.get('/live-reload', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  
  // Send initial connection message
  res.write('event: connected\ndata: {}\n\n');
  
  // Add client to set
  sseClients.add(res);
  console.log(`🔌 Live reload client connected (${sseClients.size} total)`);
  
  // Remove client on disconnect
  req.on('close', () => {
    sseClients.delete(res);
    console.log(`🔌 Live reload client disconnected (${sseClients.size} remaining)`);
  });
});

// Main configuration page
router.get('/', (req, res) => {
  const cfg = config.getConfig();
  const message = req.query.message 
    ? { type: req.query.type || 'success', text: req.query.message } 
    : null;
  
  const html = configTemplate({ config: cfg, message });
  res.send(html);
});

// Add new target
router.post('/targets', express.urlencoded({ extended: true }), (req, res) => {
  try {
    const { name, pattern, target, cookies, headers } = req.body;

    if (!name || !pattern || !target) {
      return res.redirect('/_config?type=error&message=' + encodeURIComponent('Name, pattern, and target are required'));
    }

    let parsedHeaders = {};
    if (headers && headers.trim()) {
      try {
        parsedHeaders = JSON.parse(headers);
      } catch (e) {
        return res.redirect('/_config?type=error&message=' + encodeURIComponent('Invalid JSON in headers'));
      }
    }

    config.addTarget({
      name,
      pattern,
      target,
      cookies: cookies || '',
      headers: parsedHeaders,
    });

    res.redirect('/_config?message=' + encodeURIComponent(`Target "${name}" added successfully. Changes applied immediately.`));
  } catch (err) {
    res.redirect('/_config?type=error&message=' + encodeURIComponent(err.message));
  }
});

// Delete target
router.post('/targets/:name/delete', (req, res) => {
  try {
    config.removeTarget(req.params.name);
    res.redirect('/_config?message=' + encodeURIComponent(`Target "${req.params.name}" deleted. Changes applied immediately.`));
  } catch (err) {
    res.redirect('/_config?type=error&message=' + encodeURIComponent(err.message));
  }
});

// Edit target
router.post('/targets/:name/edit', express.urlencoded({ extended: true }), (req, res) => {
  try {
    const originalName = req.params.name;
    const { name, pattern, target, cookies, headers } = req.body;

    if (!name || !pattern || !target) {
      return res.redirect('/_config?type=error&message=' + encodeURIComponent('Name, pattern, and target are required'));
    }

    let parsedHeaders = {};
    if (headers && headers.trim()) {
      try {
        parsedHeaders = JSON.parse(headers);
      } catch (e) {
        return res.redirect('/_config?type=error&message=' + encodeURIComponent('Invalid JSON in headers'));
      }
    }

    config.updateTarget(originalName, {
      name,
      pattern,
      target,
      cookies: cookies || '',
      headers: parsedHeaders,
    });

    res.redirect('/_config?message=' + encodeURIComponent(`Target "${name}" updated successfully. Changes applied immediately.`));
  } catch (err) {
    res.redirect('/_config?type=error&message=' + encodeURIComponent(err.message));
  }
});

// Update logging settings
router.post('/logging', express.urlencoded({ extended: true }), (req, res) => {
  try {
    const cfg = config.getConfig();
    cfg.logging = {
      enabled: req.body.enabled === 'on',
      logToFile: req.body.logToFile === 'on',
      logDir: req.body.logDir || './logs',
      logRequestBody: req.body.logRequestBody === 'on',
      logResponseBody: req.body.logResponseBody === 'on',
    };
    config.saveConfigToFile(cfg);
    res.redirect('/_config?message=' + encodeURIComponent('Logging settings saved. Changes applied immediately.'));
  } catch (err) {
    res.redirect('/_config?type=error&message=' + encodeURIComponent(err.message));
  }
});

// API endpoints for programmatic access
router.get('/api/status', (req, res) => {
  const cfg = config.getConfig();
  res.json({
    status: 'running',
    port: cfg.port,
    targets: cfg.targets.map((t) => ({
      name: t.name,
      pattern: t.pattern,
      target: t.target,
      hasCookies: !!(t.cookies && t.cookies.trim()),
      headerCount: Object.keys(t.headers || {}).length,
    })),
    logging: cfg.logging,
  });
});

router.get('/api/targets', (req, res) => {
  const cfg = config.getConfig();
  res.json(cfg.targets);
});

router.post('/api/targets', express.json(), (req, res) => {
  try {
    const { name, pattern, target, cookies, headers } = req.body;
    if (!name || !pattern || !target) {
      return res.status(400).json({ error: 'Name, pattern, and target are required' });
    }
    config.addTarget({ name, pattern, target, cookies: cookies || '', headers: headers || {} });
    res.json({ success: true, message: 'Target added. Changes applied immediately.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/targets/:name', (req, res) => {
  try {
    config.removeTarget(req.params.name);
    res.json({ success: true, message: 'Target removed. Changes applied immediately.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/api/targets/:name', express.json(), (req, res) => {
  try {
    const { name, pattern, target, cookies, headers } = req.body;
    if (!name || !pattern || !target) {
      return res.status(400).json({ error: 'Name, pattern, and target are required' });
    }
    config.updateTarget(req.params.name, { name, pattern, target, cookies: cookies || '', headers: headers || {} });
    res.json({ success: true, message: 'Target updated. Changes applied immediately.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
