/**
 * Configuration management for the proxy server
 * Supports single target (legacy) and multiple targets (new)
 */

const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(process.cwd(), 'proxy-config.json');

// Default configuration structure
const defaultConfig = {
  port: 3001,
  logging: {
    enabled: true,
    logToFile: false,
    logDir: './logs',
    logRequestBody: false,
    logResponseBody: false,
  },
  targets: [],
};

/**
 * Parse targets from environment variables
 * Supports both legacy single-target and new multi-target format
 */
function parseTargetsFromEnv() {
  const targets = [];

  // Check for new TARGETS format (JSON array)
  if (process.env.TARGETS) {
    try {
      const parsedTargets = JSON.parse(process.env.TARGETS);
      if (Array.isArray(parsedTargets)) {
        return parsedTargets.map((t, index) => ({
          name: t.name || `target-${index + 1}`,
          pattern: t.pattern || '/*',
          target: t.target,
          cookies: t.cookies || '',
          headers: t.headers || {},
        }));
      }
    } catch (err) {
      console.error('ERROR: TARGETS is not valid JSON');
      process.exit(1);
    }
  }

  // Fall back to legacy single-target format
  if (process.env.TARGET_API) {
    let customHeaders = {};
    if (process.env.CUSTOM_HEADERS) {
      try {
        customHeaders = JSON.parse(process.env.CUSTOM_HEADERS);
      } catch (err) {
        console.error('ERROR: CUSTOM_HEADERS is not valid JSON');
        process.exit(1);
      }
    }

    targets.push({
      name: 'default',
      pattern: '/*',
      target: process.env.TARGET_API,
      cookies: process.env.COOKIE_STRING || '',
      headers: customHeaders,
    });
  }

  return targets;
}

/**
 * Load configuration from file or create default
 */
function loadConfigFromFile() {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
      return JSON.parse(data);
    } catch (err) {
      console.warn('Warning: Could not parse proxy-config.json, using defaults');
    }
  }
  return null;
}

/**
 * Save configuration to file
 */
function saveConfigToFile(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

/**
 * Get the full configuration
 * Priority: TARGETS env var > Config file > Legacy env vars (TARGET_API) > Defaults
 */
function getConfig() {
  const fileConfig = loadConfigFromFile();

  const config = {
    ...defaultConfig,
    ...fileConfig,
    port: parseInt(process.env.PORT, 10) || fileConfig?.port || defaultConfig.port,
    targetSource: 'file', // Track where targets come from
  };

  // Priority 1: TARGETS env var (explicit multi-target config)
  if (process.env.TARGETS) {
    try {
      const parsedTargets = JSON.parse(process.env.TARGETS);
      if (Array.isArray(parsedTargets)) {
        config.targets = parsedTargets.map((t, index) => ({
          name: t.name || `target-${index + 1}`,
          pattern: t.pattern || '/*',
          target: t.target,
          cookies: t.cookies || '',
          headers: t.headers || {},
          source: 'env',
        }));
        config.targetSource = 'env';
      }
    } catch (err) {
      console.error('ERROR: TARGETS is not valid JSON');
      process.exit(1);
    }
  }
  // Priority 2: Config file targets (if file exists and has targets)
  else if (fileConfig?.targets && fileConfig.targets.length > 0) {
    config.targets = fileConfig.targets.map(t => ({ ...t, source: 'file' }));
    config.targetSource = 'file';
  }
  // Priority 3: Legacy single-target from env vars
  else if (process.env.TARGET_API) {
    let customHeaders = {};
    if (process.env.CUSTOM_HEADERS) {
      try {
        customHeaders = JSON.parse(process.env.CUSTOM_HEADERS);
      } catch (err) {
        console.error('ERROR: CUSTOM_HEADERS is not valid JSON');
        process.exit(1);
      }
    }

    config.targets = [{
      name: 'default',
      pattern: '/*',
      target: process.env.TARGET_API,
      cookies: process.env.COOKIE_STRING || '',
      headers: customHeaders,
      source: 'env',
    }];
    config.targetSource = 'env';
  }

  // If no targets configured, create a default config file
  if (!config.targets || config.targets.length === 0) {
    console.log('⚠️  No targets configured. Creating default proxy-config.json...');
    
    const defaultTargetConfig = {
      port: config.port,
      logging: defaultConfig.logging,
      targets: [
      ],
    };
    
    saveConfigToFile(defaultTargetConfig);
    console.log('📝 Created proxy-config.json with example target.');
    console.log('👉 Edit the file or use the Config UI at http://localhost:' + config.port + '/_config');
    console.log('');
    
    config.targets = defaultTargetConfig.targets.map(t => ({ ...t, source: 'file' }));
    config.targetSource = 'file';
  }

  // Parse logging settings from env
  if (process.env.LOG_ENABLED !== undefined) {
    config.logging.enabled = process.env.LOG_ENABLED === 'true';
  }
  if (process.env.LOG_TO_FILE !== undefined) {
    config.logging.logToFile = process.env.LOG_TO_FILE === 'true';
  }
  if (process.env.LOG_DIR) {
    config.logging.logDir = process.env.LOG_DIR;
  }
  if (process.env.LOG_REQUEST_BODY !== undefined) {
    config.logging.logRequestBody = process.env.LOG_REQUEST_BODY === 'true';
  }
  if (process.env.LOG_RESPONSE_BODY !== undefined) {
    config.logging.logResponseBody = process.env.LOG_RESPONSE_BODY === 'true';
  }

  return config;
}

/**
 * Update configuration and save to file
 */
function updateConfig(updates) {
  const currentConfig = getConfig();
  const newConfig = { ...currentConfig, ...updates };
  saveConfigToFile(newConfig);
  return newConfig;
}

/**
 * Add a new target
 */
function addTarget(target) {
  const config = getConfig();
  config.targets.push(target);
  saveConfigToFile(config);
  return config;
}

/**
 * Remove a target by name
 * If removing the last target, creates a default example target
 */
function removeTarget(name) {
  const config = getConfig();
  config.targets = config.targets.filter((t) => t.name !== name);
  
  // If all targets removed, add an example placeholder
  // if (config.targets.length === 0) {
  //   config.targets = [{
  //     name: 'example',
  //     pattern: '/*',
  //     target: 'https://api.example.com',
  //     cookies: '',
  //     headers: {},
  //     source: 'file',
  //   }];
  //   console.log('⚠️  All targets removed. Created example target placeholder.');
  // }
  
  saveConfigToFile(config);
  return config;
}

/**
 * Update a target by name
 */
function updateTarget(name, updates) {
  const config = getConfig();
  const index = config.targets.findIndex((t) => t.name === name);
  if (index !== -1) {
    config.targets[index] = { ...config.targets[index], ...updates };
    saveConfigToFile(config);
  }
  return config;
}

module.exports = {
  getConfig,
  updateConfig,
  addTarget,
  removeTarget,
  updateTarget,
  saveConfigToFile,
  loadConfigFromFile,
  CONFIG_FILE,
};
