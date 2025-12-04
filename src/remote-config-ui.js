/**
 * Remote Configuration UI - Web interface for managing user-specific proxy settings
 * Each user has isolated configuration via unique tokens
 */

const express = require('express');
const path = require('path');
const pug = require('pug');
const router = express.Router();
const userStorage = require('./user-storage');

// Compile the Pug template
const viewsPath = path.join(__dirname, 'views');
let remoteConfigTemplate = pug.compileFile(path.join(viewsPath, 'remote-config.pug'));

/**
 * Helper to get base URL from request
 */
function getBaseUrl(req) {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${protocol}://${host}`;
}

/**
 * Helper to extract token from request
 */
function extractToken(req) {
  return req.query.token || req.headers['x-proxy-token'] || null;
}

// Landing page / documentation
router.get('/', (req, res) => {
  const token = extractToken(req);
  const baseUrl = getBaseUrl(req);
  
  if (token && userStorage.isValidToken(token)) {
    return res.redirect(`/_remote/config?token=${token}`);
  }
  
  const html = remoteConfigTemplate({ 
    title: 'Welcome',
    token: null,
    config: { targets: [], logging: {} },
    baseUrl,
    message: null,
  });
  res.send(html);
});

// Create new session
router.post('/session', (req, res) => {
  const token = userStorage.createUserSession();
  res.redirect(`/_remote/config?token=${token}&message=${encodeURIComponent('Session created! Save your token.')}&type=success`);
});

// Delete session
router.post('/session/delete', (req, res) => {
  const token = extractToken(req);
  
  if (!token) {
    return res.redirect('/_remote?message=' + encodeURIComponent('No token provided') + '&type=error');
  }
  
  userStorage.deleteUserSession(token);
  res.redirect('/_remote?message=' + encodeURIComponent('Session deleted successfully') + '&type=success');
});

// Configuration page
router.get('/config', (req, res) => {
  const token = extractToken(req);
  const baseUrl = getBaseUrl(req);
  
  if (!token) {
    return res.redirect('/_remote');
  }
  
  const userConfig = userStorage.getUserConfig(token);
  
  if (!userConfig) {
    return res.redirect('/_remote?message=' + encodeURIComponent('Invalid or expired token. Please create a new session.') + '&type=error');
  }
  
  const message = req.query.message 
    ? { type: req.query.type || 'success', text: req.query.message } 
    : null;
  
  const html = remoteConfigTemplate({ 
    title: 'Configuration',
    token,
    config: userConfig,
    baseUrl,
    message,
  });
  res.send(html);
});

// Add new target
router.post('/targets', express.urlencoded({ extended: true }), (req, res) => {
  const token = extractToken(req);
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const { name, pattern, target, cookies, headers } = req.body;

    if (!name || !pattern || !target) {
      return res.redirect(`/_remote/config?token=${token}&type=error&message=` + encodeURIComponent('Name, pattern, and target are required'));
    }

    let parsedHeaders = {};
    if (headers && headers.trim()) {
      try {
        parsedHeaders = JSON.parse(headers);
      } catch (e) {
        return res.redirect(`/_remote/config?token=${token}&type=error&message=` + encodeURIComponent('Invalid JSON in headers'));
      }
    }

    userStorage.addUserTarget(token, {
      name,
      pattern,
      target,
      cookies: cookies || '',
      headers: parsedHeaders,
    });

    res.redirect(`/_remote/config?token=${token}&message=` + encodeURIComponent(`Target "${name}" added successfully.`));
  } catch (err) {
    res.redirect(`/_remote/config?token=${token}&type=error&message=` + encodeURIComponent(err.message));
  }
});

// Delete target
router.post('/targets/:name/delete', (req, res) => {
  const token = extractToken(req);
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    userStorage.removeUserTarget(token, req.params.name);
    res.redirect(`/_remote/config?token=${token}&message=` + encodeURIComponent(`Target "${req.params.name}" deleted.`));
  } catch (err) {
    res.redirect(`/_remote/config?token=${token}&type=error&message=` + encodeURIComponent(err.message));
  }
});

// Edit target
router.post('/targets/:name/edit', express.urlencoded({ extended: true }), (req, res) => {
  const token = extractToken(req);
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const originalName = req.params.name;
    const { name, pattern, target, cookies, headers } = req.body;

    if (!name || !pattern || !target) {
      return res.redirect(`/_remote/config?token=${token}&type=error&message=` + encodeURIComponent('Name, pattern, and target are required'));
    }

    let parsedHeaders = {};
    if (headers && headers.trim()) {
      try {
        parsedHeaders = JSON.parse(headers);
      } catch (e) {
        return res.redirect(`/_remote/config?token=${token}&type=error&message=` + encodeURIComponent('Invalid JSON in headers'));
      }
    }

    userStorage.updateUserTarget(token, originalName, {
      name,
      pattern,
      target,
      cookies: cookies || '',
      headers: parsedHeaders,
    });

    res.redirect(`/_remote/config?token=${token}&message=` + encodeURIComponent(`Target "${name}" updated successfully.`));
  } catch (err) {
    res.redirect(`/_remote/config?token=${token}&type=error&message=` + encodeURIComponent(err.message));
  }
});

// ============ API Endpoints ============

// Get user config
router.get('/api/config', (req, res) => {
  const token = extractToken(req);
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const userConfig = userStorage.getUserConfig(token);
  
  if (!userConfig) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  
  res.json({
    targets: userConfig.targets,
    logging: userConfig.logging,
    createdAt: userConfig.createdAt,
    lastAccessedAt: userConfig.lastAccessedAt,
  });
});

// Get targets
router.get('/api/targets', (req, res) => {
  const token = extractToken(req);
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const targets = userStorage.getUserTargets(token);
    res.json(targets);
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

// Add target via API
router.post('/api/targets', express.json(), (req, res) => {
  const token = extractToken(req);
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const { name, pattern, target, cookies, headers } = req.body;
    
    if (!name || !pattern || !target) {
      return res.status(400).json({ error: 'Name, pattern, and target are required' });
    }
    
    userStorage.addUserTarget(token, { 
      name, 
      pattern, 
      target, 
      cookies: cookies || '', 
      headers: headers || {} 
    });
    
    res.json({ success: true, message: 'Target added.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update target via API
router.put('/api/targets/:name', express.json(), (req, res) => {
  const token = extractToken(req);
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const { name, pattern, target, cookies, headers } = req.body;
    
    if (!name || !pattern || !target) {
      return res.status(400).json({ error: 'Name, pattern, and target are required' });
    }
    
    userStorage.updateUserTarget(token, req.params.name, { 
      name, 
      pattern, 
      target, 
      cookies: cookies || '', 
      headers: headers || {} 
    });
    
    res.json({ success: true, message: 'Target updated.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete target via API
router.delete('/api/targets/:name', (req, res) => {
  const token = extractToken(req);
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    userStorage.removeUserTarget(token, req.params.name);
    res.json({ success: true, message: 'Target removed.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Create session via API
router.post('/api/session', (req, res) => {
  const token = userStorage.createUserSession();
  res.json({ 
    success: true, 
    token,
    message: 'Session created. Save your token - it expires after 24 hours of inactivity.',
    expiresIn: '24 hours of inactivity',
  });
});

// Delete session via API
router.delete('/api/session', (req, res) => {
  const token = extractToken(req);
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const deleted = userStorage.deleteUserSession(token);
  
  if (deleted) {
    res.json({ success: true, message: 'Session deleted.' });
  } else {
    res.status(404).json({ error: 'Session not found or already expired.' });
  }
});

// Server stats (for monitoring)
router.get('/api/stats', (req, res) => {
  res.json({
    activeSessions: userStorage.getActiveSessionCount(),
    uptime: process.uptime(),
  });
});

// Export configuration as JSON
router.get('/api/export', (req, res) => {
  const token = extractToken(req);
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const userConfig = userStorage.getUserConfig(token);
  
  if (!userConfig) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  
  // Create export with metadata
  const exportData = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    config: {
      targets: userConfig.targets,
      logging: userConfig.logging,
    },
  };
  
  // Set headers for file download
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="proxy-config-${token.substring(0, 8)}.json"`);
  res.json(exportData);
});

// Import configuration from JSON
router.post('/api/import', express.json(), (req, res) => {
  const token = extractToken(req);
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const userConfig = userStorage.getUserConfig(token);
  
  if (!userConfig) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  
  try {
    const importData = req.body;
    
    // Validate import data
    if (!importData || !importData.config) {
      return res.status(400).json({ error: 'Invalid import data format' });
    }
    
    const { targets, logging } = importData.config;
    
    // Validate targets
    if (targets && Array.isArray(targets)) {
      for (const target of targets) {
        if (!target.name || !target.pattern || !target.target) {
          return res.status(400).json({ 
            error: 'Invalid target format. Each target must have name, pattern, and target URL.' 
          });
        }
      }
      userConfig.targets = targets;
    }
    
    // Update logging if provided
    if (logging) {
      userConfig.logging = {
        enabled: logging.enabled !== false,
        logRequestBody: logging.logRequestBody === true,
        logResponseBody: logging.logResponseBody === true,
      };
    }
    
    // Force save to backup file
    userStorage.forceSave();
    
    res.json({ 
      success: true, 
      message: 'Configuration imported successfully',
      imported: {
        targets: userConfig.targets.length,
        logging: userConfig.logging.enabled,
      },
    });
  } catch (err) {
    res.status(400).json({ error: 'Failed to import configuration: ' + err.message });
  }
});

module.exports = router;
