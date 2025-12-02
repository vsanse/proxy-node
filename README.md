# Proxy Server

A simple Express proxy server that forwards API requests and attaches a cookie header. Useful when you need to work with staging APIs but can't use browser extensions to set cookies.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file (copy from `.env.example`):
   ```bash
   cp .env.example .env
   ```

3. Edit `.env` with your values:
   ```
   TARGET_API=https://your-staging-api.com
   COOKIE_STRING=your_full_cookie_string_here
   
   # Optional: Add custom headers as JSON
   CUSTOM_HEADERS={"Authorization": "Bearer token123", "X-Custom-Header": "value"}
   ```

## Usage

Start the server:
```bash
npm start
```

Or with auto-reload during development:
```bash
npm run dev
```

The proxy will run on `http://localhost:3001` by default (configurable via `PORT` env variable).

**Point your local app to `http://localhost:3001`** instead of the staging API URL. All requests will be forwarded to the target API with the cookie header attached.
