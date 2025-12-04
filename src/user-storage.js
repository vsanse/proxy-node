/**
 * User-specific in-memory storage for remote server mode
 * Each user gets isolated configuration via a unique token
 * Includes file-based backup for persistence across restarts
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// In-memory storage: Map<token, userConfig>
const userConfigs = new Map();

// Backup file path
const BACKUP_FILE = path.join(process.cwd(), '.remote-sessions.json');

// Token expiration time (24 hours)
const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000;

// Auto-save debounce timer
let saveTimer = null;
const SAVE_DEBOUNCE_MS = 5000; // Save 5 seconds after last change

// Default user configuration
const defaultUserConfig = {
  targets: [],
  logging: {
    enabled: true,
    logRequestBody: false,
    logResponseBody: false,
  },
  createdAt: null,
  lastAccessedAt: null,
};

/**
 * Generate a unique user token
 */
function generateToken() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Schedule a debounced save to backup file
 */
function scheduleSave() {
  if (saveTimer) {
    clearTimeout(saveTimer);
  }
  saveTimer = setTimeout(() => {
    saveToFile();
  }, SAVE_DEBOUNCE_MS);
}

/**
 * Save all sessions to backup file
 */
function saveToFile() {
  try {
    const data = {};
    for (const [token, config] of userConfigs.entries()) {
      data[token] = config;
    }
    fs.writeFileSync(BACKUP_FILE, JSON.stringify(data, null, 2));
    console.log(`💾 Saved ${userConfigs.size} sessions to backup`);
  } catch (err) {
    console.error('Failed to save sessions backup:', err.message);
  }
}

/**
 * Load sessions from backup file
 */
function loadFromFile() {
  try {
    if (fs.existsSync(BACKUP_FILE)) {
      const data = JSON.parse(fs.readFileSync(BACKUP_FILE, 'utf-8'));
      const now = Date.now();
      let loaded = 0;
      let expired = 0;
      
      for (const [token, config] of Object.entries(data)) {
        // Skip expired sessions
        if (now - config.lastAccessedAt > TOKEN_EXPIRY_MS) {
          expired++;
          continue;
        }
        userConfigs.set(token, config);
        loaded++;
      }
      
      if (loaded > 0 || expired > 0) {
        console.log(`📂 Loaded ${loaded} sessions from backup (${expired} expired sessions skipped)`);
      }
    }
  } catch (err) {
    console.error('Failed to load sessions backup:', err.message);
  }
}

// Load sessions on startup
loadFromFile();

/**
 * Clean up expired tokens periodically
 */
function cleanupExpiredTokens() {
  const now = Date.now();
  for (const [token, config] of userConfigs.entries()) {
    if (now - config.lastAccessedAt > TOKEN_EXPIRY_MS) {
      userConfigs.delete(token);
      console.log(`🧹 Cleaned up expired token: ${token.substring(0, 8)}...`);
    }
  }
}

// Run cleanup every hour
setInterval(cleanupExpiredTokens, 60 * 60 * 1000);

/**
 * Create a new user session with a unique token
 */
function createUserSession() {
  const token = generateToken();
  const now = Date.now();
  
  userConfigs.set(token, {
    ...JSON.parse(JSON.stringify(defaultUserConfig)),
    createdAt: now,
    lastAccessedAt: now,
  });
  
  console.log(`🆕 Created new user session: ${token.substring(0, 8)}...`);
  scheduleSave();
  return token;
}

/**
 * Get user configuration by token
 * Returns null if token is invalid or expired
 */
function getUserConfig(token) {
  if (!token || !userConfigs.has(token)) {
    return null;
  }
  
  const config = userConfigs.get(token);
  const now = Date.now();
  
  // Check if expired
  if (now - config.lastAccessedAt > TOKEN_EXPIRY_MS) {
    userConfigs.delete(token);
    return null;
  }
  
  // Update last accessed time
  config.lastAccessedAt = now;
  return config;
}

/**
 * Check if a token is valid
 */
function isValidToken(token) {
  return getUserConfig(token) !== null;
}

/**
 * Get targets for a user
 */
function getUserTargets(token) {
  const config = getUserConfig(token);
  return config ? config.targets : [];
}

/**
 * Add a target for a user
 */
function addUserTarget(token, target) {
  const config = getUserConfig(token);
  if (!config) {
    throw new Error('Invalid or expired token');
  }
  
  // Check for duplicate name
  if (config.targets.some(t => t.name === target.name)) {
    throw new Error(`Target with name "${target.name}" already exists`);
  }
  
  config.targets.push({
    name: target.name,
    pattern: target.pattern,
    target: target.target,
    cookies: target.cookies || '',
    headers: target.headers || {},
  });
  
  scheduleSave();
  return config;
}

/**
 * Update a target for a user
 */
function updateUserTarget(token, name, updates) {
  const config = getUserConfig(token);
  if (!config) {
    throw new Error('Invalid or expired token');
  }
  
  const index = config.targets.findIndex(t => t.name === name);
  if (index === -1) {
    throw new Error(`Target "${name}" not found`);
  }
  
  config.targets[index] = {
    ...config.targets[index],
    ...updates,
  };
  
  scheduleSave();
  return config;
}

/**
 * Remove a target for a user
 */
function removeUserTarget(token, name) {
  const config = getUserConfig(token);
  if (!config) {
    throw new Error('Invalid or expired token');
  }
  
  const index = config.targets.findIndex(t => t.name === name);
  if (index === -1) {
    throw new Error(`Target "${name}" not found`);
  }
  
  config.targets.splice(index, 1);
  scheduleSave();
  return config;
}

/**
 * Update logging settings for a user
 */
function updateUserLogging(token, logging) {
  const config = getUserConfig(token);
  if (!config) {
    throw new Error('Invalid or expired token');
  }
  
  config.logging = {
    ...config.logging,
    ...logging,
  };
  
  scheduleSave();
  return config;
}

/**
 * Get all active sessions count (for monitoring)
 */
function getActiveSessionCount() {
  return userConfigs.size;
}

/**
 * Delete a user session
 */
function deleteUserSession(token) {
  if (userConfigs.has(token)) {
    userConfigs.delete(token);
    console.log(`🗑️  Deleted user session: ${token.substring(0, 8)}...`);
    scheduleSave();
    return true;
  }
  return false;
}

/**
 * Force save (for graceful shutdown)
 */
function forceSave() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  saveToFile();
}

module.exports = {
  generateToken,
  createUserSession,
  getUserConfig,
  isValidToken,
  getUserTargets,
  addUserTarget,
  updateUserTarget,
  removeUserTarget,
  updateUserLogging,
  getActiveSessionCount,
  deleteUserSession,
  forceSave,
  TOKEN_EXPIRY_MS,
  BACKUP_FILE,
};
