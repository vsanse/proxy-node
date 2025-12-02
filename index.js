require('dotenv').config();
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3001;

const TARGET_API = process.env.TARGET_API;
const COOKIE_STRING = process.env.COOKIE_STRING;

if (!TARGET_API) {
  console.error('ERROR: TARGET_API is not set in .env file');
  process.exit(1);
}

if (!COOKIE_STRING) {
  console.error('ERROR: COOKIE_STRING is not set in .env file');
  process.exit(1);
}

console.log(`🚀 Proxy server starting...`);
console.log(`📡 Target API: ${TARGET_API}`);
console.log(`🍪 Cookie configured: ${COOKIE_STRING.substring(0, 30)}...`);

// Proxy middleware configuration
const proxyMiddleware = createProxyMiddleware({
  target: TARGET_API,
  changeOrigin: true,
  onProxyReq: (proxyReq, req, res) => {
    // Attach the cookie header to all outgoing requests
    proxyReq.setHeader('Cookie', COOKIE_STRING);
    
    console.log(`➡️  [${req.method}] ${req.originalUrl} -> ${TARGET_API}${req.originalUrl}`);
  },
  onProxyRes: (proxyRes, req, res) => {
    console.log(`⬅️  [${proxyRes.statusCode}] ${req.originalUrl}`);
  },
  onError: (err, req, res) => {
    console.error(`❌ Proxy error: ${err.message}`);
    res.status(500).json({ error: 'Proxy error', message: err.message });
  }
});

// Apply proxy to all routes
app.use('/', proxyMiddleware);

app.listen(PORT, () => {
  console.log(`✅ Proxy server running on http://localhost:${PORT}`);
  console.log(`\n📝 Point your local app to http://localhost:${PORT} instead of ${TARGET_API}\n`);
});
