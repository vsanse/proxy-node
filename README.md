# Proxy Server

A powerful Express proxy server that forwards API requests with automatic authentication injection. Perfect for local development with staging APIs, especially when using Chrome DevTools MCP with AI coding assistants like GitHub Copilot or Cursor.

## ✨ Features

- **🔐 Automatic Authentication** - Injects cookies, bearer tokens, and custom headers
- **🎯 Multiple Target APIs** - Route different paths to different backend APIs
- **📝 Request/Response Logging** - Console and file-based logging for debugging
- **🔧 Configuration UI** - Web interface to manage settings without editing files
- **⚡ Live Reload** - Browser auto-refresh when config or templates change
- **🔌 Hot Reload** - Server auto-restart on code changes via nodemon
- **🌐 Remote Mode** - Multi-tenant server with CORS enabled and user-isolated configs

## 🚀 Quick Start

### Installation

```bash
git clone https://github.com/vsanse/proxy-node
cd proxy-node
npm install
```

### Basic Setup (Single Target)

1. Create a `.env` file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your values:
   ```env
   TARGET_API=https://your-staging-api.com
   
   # Optional: Cookie string (can be omitted if only using headers)
   COOKIE_STRING=your_full_cookie_string_here
   
   # Optional: Add custom headers as JSON
   CUSTOM_HEADERS={"Authorization": "Bearer token123", "X-Custom-Header": "value"}
   ```

3. Start the server:
   ```bash
   npm start
   ```

   The server uses nodemon for auto-restart when files change.

4. Point your local app to `http://localhost:3001` instead of the staging API URL.

### Using Config File (Recommended for Multiple Targets)

1. Copy the sample config:
   ```bash
   cp proxy-config.sample.json proxy-config.json
   ```

2. Edit `proxy-config.json` with your targets (cookies are optional):
   ```json
   {
     "targets": [
       {
         "name": "api",
         "pattern": "/api/*",
         "target": "https://api.example.com",
         "cookies": "",
         "headers": {"Authorization": "Bearer token123"}
       }
     ]
   }
   ```

3. Start the server:
   ```bash
   npm start
   ```

## 🎯 Multiple Target APIs

Route different paths to different backend APIs by setting the `TARGETS` environment variable:

```env
TARGETS=[
  {
    "name": "main-api",
    "pattern": "/api/*",
    "target": "https://api.example.com",
    "cookies": "session=abc123",
    "headers": {"Authorization": "Bearer token1"}
  },
  {
    "name": "auth-service",
    "pattern": "/auth/**",
    "target": "https://auth.example.com",
    "cookies": "auth_session=xyz789",
    "headers": {}
  },
  {
    "name": "fallback",
    "pattern": "/*",
    "target": "https://default.example.com",
    "cookies": "",
    "headers": {}
  }
]
```

### Pattern Matching

- `/api/*` - Matches `/api/users`, `/api/posts` (single level)
- `/auth/**` - Matches `/auth/login`, `/auth/oauth/callback` (deep matching)
- `/*` - Catch-all fallback (should be last)

Patterns are matched from most specific to least specific.

## 📝 Logging

### Environment Variables

```env
LOG_ENABLED=true          # Enable/disable logging (default: true)
LOG_TO_FILE=true          # Write logs to files (default: false)
LOG_DIR=./logs            # Log directory (default: ./logs)
LOG_REQUEST_BODY=true     # Log request bodies (default: false)
LOG_RESPONSE_BODY=true    # Log response bodies (default: false)
```

### Log Output

Console logs show request/response flow:
```
➡️  [GET] /api/users -> https://api.example.com/api/users
⬅️  [200] /api/users (45ms)
```

File logs (JSON format) include:
- Timestamp
- Method, path, target
- Headers (sensitive data redacted)
- Request/response bodies (if enabled)
- Response times

## 🔧 Configuration UI

Access the configuration UI at `http://localhost:3001/_config`

Features:
- View all configured targets
- Add new targets with patterns
- Delete existing targets
- Configure logging settings
- Quick reference information

### API Endpoints

```
GET  /_config                    # Web UI
GET  /_config/api/status         # JSON status
GET  /_config/api/targets        # List all targets
POST /_config/api/targets        # Add a target
DELETE /_config/api/targets/:name # Remove a target
GET  /_health                    # Health check
```

## 📁 Configuration File

You can also use a `proxy-config.json` file for persistent configuration:

```json
{
  "port": 3001,
  "logging": {
    "enabled": true,
    "logToFile": false,
    "logDir": "./logs",
    "logRequestBody": false,
    "logResponseBody": false
  },
  "targets": [
    {
      "name": "default",
      "pattern": "/*",
      "target": "https://api.example.com",
      "cookies": "session=abc123",
      "headers": {
        "Authorization": "Bearer token123"
      }
    }
  ]
}
```

**Priority:** Environment variables > Config file > Defaults

## 🔍 Use Cases

### 1. Chrome DevTools MCP Authentication

When using Chrome DevTools MCP with AI coding assistants, the spawned Chrome instance can't install extensions. This proxy solves that by injecting authentication transparently:

1. Start the proxy with your staging API credentials
2. Point your frontend to `http://localhost:3001`
3. Chrome DevTools MCP can now access authenticated endpoints

**Configure via UI:**
1. Open `http://localhost:3001/_config`
2. Click "Add New Target"
3. Fill in:
   - **Name:** `staging-api`
   - **Pattern:** `/*`
   - **Target URL:** `https://staging.example.com`
   - **Cookies:** *(paste from browser DevTools)*
4. Click "Add Target"

---

### 2. Multiple Microservices with Different Auth

Your app calls multiple backend services, each requiring different authentication:

**Scenario:** 
- `https://api.example.com` - Main API (needs Cookie + Bearer token)
- `https://auth.example.com` - Auth service (needs API key)
- `https://analytics.example.com` - Analytics (needs different Bearer token)

**Configure via UI** at `http://localhost:3001/_config`:

| Name | Pattern | Target URL | Cookies | Headers |
|------|---------|------------|---------|---------|
| main-api | `/api/**` | `https://api.example.com` | `session=abc123` | `{"Authorization": "Bearer main-token"}` |
| auth-service | `/auth/**` | `https://auth.example.com` | | `{"X-API-Key": "auth-service-key"}` |
| analytics | `/analytics/**` | `https://analytics.example.com` | | `{"Authorization": "Bearer analytics-token"}` |

**Or via `proxy-config.json`:**
```json
{
  "port": 3001,
  "targets": [
    {
      "name": "main-api",
      "pattern": "/api/**",
      "target": "https://api.example.com",
      "cookies": "session=abc123",
      "headers": { "Authorization": "Bearer main-token" }
    },
    {
      "name": "auth-service",
      "pattern": "/auth/**",
      "target": "https://auth.example.com",
      "cookies": "",
      "headers": { "X-API-Key": "auth-service-key" }
    },
    {
      "name": "analytics",
      "pattern": "/analytics/**",
      "target": "https://analytics.example.com",
      "cookies": "",
      "headers": { "Authorization": "Bearer analytics-token" }
    }
  ]
}
```

**Frontend usage:**
```javascript
// All go through http://localhost:3001
fetch('/api/users');           // -> https://api.example.com/api/users
fetch('/auth/login');          // -> https://auth.example.com/auth/login  
fetch('/analytics/events');    // -> https://analytics.example.com/analytics/events
```

---

### 3. Multi-Domain API Routing (Different Subdomains)

Your app calls APIs on different subdomains with different credentials:

**Scenario:**
- `https://a.mycompany.com` - Service A
- `https://b.mycompany.com` - Service B

**Configure via UI** at `http://localhost:3001/_config`:

| Name | Pattern | Target URL | Cookies | Headers |
|------|---------|------------|---------|---------|
| service-a | `/service-a/**` | `https://a.mycompany.com` | `auth=token-for-a` | `{"X-Service": "A"}` |
| service-b | `/service-b/**` | `https://b.mycompany.com` | `auth=token-for-b` | `{"X-Service": "B"}` |

**Or via `proxy-config.json`:**
```json
{
  "port": 3001,
  "targets": [
    {
      "name": "service-a",
      "pattern": "/service-a/**",
      "target": "https://a.mycompany.com",
      "cookies": "auth=token-for-a",
      "headers": { "X-Service": "A" }
    },
    {
      "name": "service-b",
      "pattern": "/service-b/**",
      "target": "https://b.mycompany.com",
      "cookies": "auth=token-for-b",
      "headers": { "X-Service": "B" }
    }
  ]
}
```

**Frontend configuration:**
```javascript
// config.js
const API_CONFIG = {
  serviceA: process.env.NODE_ENV === 'development' 
    ? 'http://localhost:3001/service-a'   // Via proxy (dev)
    : 'https://a.mycompany.com',          // Direct (prod)
    
  serviceB: process.env.NODE_ENV === 'development'
    ? 'http://localhost:3001/service-b'   // Via proxy (dev)
    : 'https://b.mycompany.com',          // Direct (prod)
};

// Usage
fetch(`${API_CONFIG.serviceA}/api/users`);  // Dev: localhost:3001/service-a/api/users
fetch(`${API_CONFIG.serviceB}/api/orders`); // Dev: localhost:3001/service-b/api/orders
```

---

### 4. Debugging API Issues

Enable comprehensive logging to debug request/response issues:

**Configure via UI** at `http://localhost:3001/_config`:
1. Scroll to "Logging Settings"
2. Enable:
   - ✅ Enable Logging
   - ✅ Log to File
   - ✅ Log Request Bodies
   - ✅ Log Response Bodies
3. Click "Save Logging Settings"

**Or via `.env`:**
```env
TARGET_API=https://api.example.com
COOKIE_STRING=session=abc123
LOG_TO_FILE=true
LOG_REQUEST_BODY=true
LOG_RESPONSE_BODY=true
```

**Log output (`logs/proxy-2024-01-15.log`):**
```json
{"timestamp":"2024-01-15T10:30:00.000Z","type":"request","method":"POST","path":"/api/users","headers":{"content-type":"application/json"},"body":{"name":"John"}}
{"timestamp":"2024-01-15T10:30:00.150Z","type":"response","method":"POST","path":"/api/users","statusCode":201,"duration":"150ms"}
```

---

### 5. Testing with Different User Sessions

Quickly switch between user sessions by updating cookies:

**Via Config UI:**
1. Open `http://localhost:3001/_config`
2. Delete the existing target
3. Add a new target with updated cookies
4. UI auto-reloads with new configuration

**Via REST API:**
```bash
# Add new session target
curl -X POST http://localhost:3001/_config/api/targets \
  -H "Content-Type: application/json" \
  -d '{"name":"admin-session","pattern":"/*","target":"https://api.example.com","cookies":"session=admin-token","headers":{}}'

# Delete old session
curl -X DELETE http://localhost:3001/_config/api/targets/user-session
```

---

### 6. CORS Workaround for Development

When your frontend runs on `localhost:3000` but API doesn't allow CORS:

```
Frontend (localhost:3000) → Proxy (localhost:3001) → API (api.example.com)
```

**Configure via UI** at `http://localhost:3001/_config`:
1. Add target with pattern `/*`
2. Point to your API: `https://api.example.com`
3. Add any required auth headers/cookies

The proxy handles the cross-origin request, so CORS issues are bypassed in development.

---

### 7. GraphQL API with Authentication

Single GraphQL endpoint with authentication:

**Configure via UI** at `http://localhost:3001/_config`:

| Name | Pattern | Target URL | Headers |
|------|---------|------------|---------|
| graphql | `/graphql` | `https://api.example.com` | `{"Authorization": "Bearer graphql-token", "X-GraphQL-Client": "dev-proxy"}` |

**Or via `proxy-config.json`:**
```json
{
  "targets": [
    {
      "name": "graphql",
      "pattern": "/graphql",
      "target": "https://api.example.com",
      "cookies": "",
      "headers": {
        "Authorization": "Bearer graphql-token",
        "X-GraphQL-Client": "dev-proxy"
      }
    }
  ]
}
```

---

### 8. WebSocket-Friendly API Proxy

For REST APIs alongside WebSocket connections (proxy handles REST, WebSocket connects directly):

**Configure via UI** - Add REST API target:

| Name | Pattern | Target URL | Headers |
|------|---------|------------|---------|
| rest-api | `/api/**` | `https://api.example.com` | `{"Authorization": "Bearer token"}` |

**Frontend configuration:**
```javascript
const config = {
  restApi: 'http://localhost:3001/api',      // Proxied REST
  websocket: 'wss://api.example.com/ws',     // Direct WebSocket (with auth in URL or first message)
};
```

## 📋 All Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3001` |
| `TARGET_API` | Single target URL (legacy) | - |
| `COOKIE_STRING` | Cookies for single target | - |
| `CUSTOM_HEADERS` | Headers JSON for single target | `{}` |
| `TARGETS` | Multi-target configuration JSON | - |
| `LOG_ENABLED` | Enable logging | `true` |
| `LOG_TO_FILE` | Write logs to files | `false` |
| `LOG_DIR` | Log file directory | `./logs` |
| `LOG_REQUEST_BODY` | Log request bodies | `false` |
| `LOG_RESPONSE_BODY` | Log response bodies | `false` |

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 🚀 Future Enhancements

Potential features for future development:

### 🔐 Authentication & Security
- [ ] **OAuth 2.0 Flow Helper** - Built-in OAuth authorization code flow to automatically obtain and refresh tokens
- [ ] **Token Auto-Refresh** - Automatically refresh expired JWT/Bearer tokens
- [ ] **Credential Encryption** - Encrypt sensitive data in config files
- [ ] **Environment Profiles** - Switch between dev/staging/prod configs easily

### 🎯 Routing & Proxying  
- [ ] **WebSocket Support** - Proxy WebSocket connections with authentication
- [ ] **Request Transformation** - Modify request/response bodies on the fly
- [ ] **URL Rewriting** - Rewrite paths before forwarding (e.g., `/v2/api/*` → `/api/*`)
- [ ] **Load Balancing** - Round-robin between multiple backend instances
- [ ] **Rate Limiting** - Configurable rate limits per target

### 📊 Monitoring & Debugging
- [ ] **Request History UI** - View recent requests/responses in the config UI
- [ ] **Traffic Recording** - Record and replay API sessions for testing
- [ ] **Metrics Dashboard** - Request counts, response times, error rates
- [ ] **Mock Responses** - Return mock data for specific endpoints

### 🔧 Developer Experience
- [ ] **CLI Tool** - `npx proxy-node init` for quick setup
- [ ] **VS Code Extension** - Manage proxy from VS Code sidebar
- [ ] **Import from cURL** - Paste a cURL command to create a target config
- [ ] **Export to cURL** - Generate cURL commands from logged requests
- [ ] **Docker Support** - Official Docker image for containerized deployments

### 🔗 Integrations
- [ ] **Postman Collection Import** - Import targets from Postman collections
- [ ] **HAR File Import** - Import from browser HAR exports
- [ ] **OpenAPI/Swagger Integration** - Auto-generate targets from API specs

## 📄 License

MIT

---

## 🌐 Remote Server Mode

The remote server mode is designed for shared/deployed environments where multiple users need isolated proxy configurations without interfering with each other.

### Key Differences from Local Mode

| Feature | Local Mode (`npm start`) | Remote Mode (`npm run remote`) |
|---------|--------------------------|--------------------------------|
| CORS | Not configured | Enabled for all origins |
| Storage | File-based (`proxy-config.json`) | In-memory (per-user tokens) |
| Multi-user | Single user | Multiple isolated users |
| Persistence | Persistent (saved to file) | Session-based (24h expiry) |
| Default Port | 3001 | 3002 |

### Quick Start (Remote Mode)

```bash
# Install dependencies (includes cors package)
npm install

# Start the remote server
npm run remote

# Or with a custom port
PORT=8080 npm run remote
```

### Creating a Session

Each user gets a unique 32-character token that isolates their configuration:

```bash
# Create a new session via API
curl -X POST http://localhost:3002/_remote/api/session

# Response:
{
  "success": true,
  "token": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "message": "Session created. Save your token - it expires after 24 hours of inactivity."
}
```

Or use the Web UI at `http://localhost:3002/_remote`

### Adding Targets

Via API:
```bash
curl -X POST http://localhost:3002/_remote/api/targets?token=YOUR_TOKEN \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-api",
    "pattern": "/api/*",
    "target": "https://api.example.com",
    "cookies": "session=abc123",
    "headers": {"Authorization": "Bearer token123"}
  }'
```

Or via Web UI at `http://localhost:3002/_remote/config?token=YOUR_TOKEN`

### Making Proxy Requests

Three ways to authenticate your proxy requests:

**1. Header (Recommended)**
```bash
curl -H "X-Proxy-Token: YOUR_TOKEN" http://localhost:3002/api/users
```

**2. Query Parameter**
```bash
curl "http://localhost:3002/api/users?token=YOUR_TOKEN"
```

**3. Path Prefix**
```bash
curl http://localhost:3002/t/YOUR_TOKEN/api/users
```

### Frontend Integration (Remote Mode)

```javascript
// config.js
const PROXY_TOKEN = 'your-32-char-token';
const PROXY_URL = 'https://your-remote-proxy.com';

// Option 1: Using fetch with header
async function fetchWithProxy(path) {
  return fetch(`${PROXY_URL}${path}`, {
    headers: {
      'X-Proxy-Token': PROXY_TOKEN,
    },
  });
}

// Option 2: Using query parameter
async function fetchWithProxyQuery(path) {
  const separator = path.includes('?') ? '&' : '?';
  return fetch(`${PROXY_URL}${path}${separator}token=${PROXY_TOKEN}`);
}

// Usage
const users = await fetchWithProxy('/api/users');
```

### Remote API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/_remote` | GET | Landing page / documentation |
| `/_remote/api/session` | POST | Create new session, returns token |
| `/_remote/api/session` | DELETE | Delete session (requires token) |
| `/_remote/config?token=XXX` | GET | Web UI for configuration |
| `/_remote/api/config?token=XXX` | GET | Get user configuration |
| `/_remote/api/targets?token=XXX` | GET | List all targets |
| `/_remote/api/targets?token=XXX` | POST | Add a new target |
| `/_remote/api/targets/:name?token=XXX` | PUT | Update a target |
| `/_remote/api/targets/:name?token=XXX` | DELETE | Delete a target |
| `/_remote/api/stats` | GET | Server statistics |
| `/_health` | GET | Health check |

### Session Expiration

- Sessions expire after **24 hours of inactivity**
- Each request with a valid token resets the expiration timer
- Expired sessions are automatically cleaned up

### Deployment Considerations

1. **No persistent storage**: Configurations are lost on server restart. For production, consider implementing database-backed storage.

2. **Memory usage**: Each active session consumes memory. Monitor `/_remote/api/stats` for active session count.

3. **Security**: Tokens are randomly generated but transmitted in headers/URLs. Use HTTPS in production.

4. **Rate limiting**: Consider adding rate limiting for production deployments.

### Environment Variables (Remote Mode)

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3002` |
| `LOG_ENABLED` | Enable console logging | `true` |
| `LOG_REQUEST_BODY` | Log request bodies | `false` |
| `LOG_RESPONSE_BODY` | Log response bodies | `false` |
