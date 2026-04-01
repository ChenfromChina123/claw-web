# Claude Code Web

<p align="right"><a href="./README.md">中文</a> | <strong>English</strong></p>

A **Web interface version** of Claude Code, supporting any Anthropic-compatible API endpoint (such as MiniMax, OpenRouter, etc.), providing complete AI conversation and tool calling capabilities.

> This project is a Web frontend implementation of Claude Code, working with a WebSocket server to provide session management and user authentication.

<p align="center">
  <img src="docs/00runtime.png" alt="Runtime screenshot" width="800">
</p>

## Features

- Complete Web interaction interface
- MCP server, plugin, and Skills support
- Custom API endpoint and model support
- **WebSocket server** for session management and AI conversation
- **User authentication system** (register, login, password recovery)

---

## Quick Start

### 1. Install Bun

This project requires [Bun](https://bun.sh). If Bun is not installed on your machine yet, use one of the following methods:

```bash
# macOS / Linux (official install script)
curl -fsSL https://bun.sh/install | bash
```

If a minimal Linux image reports `unzip is required to install bun`, install `unzip` first:

```bash
# Ubuntu / Debian
apt update && apt install -y unzip
```

```bash
# macOS (Homebrew)
brew install bun
```

```powershell
# Windows (PowerShell)
powershell -c "irm bun.sh/install.ps1 | iex"
```

After installation, reopen the terminal and verify:

```bash
bun --version
```

### 2. Install project dependencies

```bash
bun install
```

### 3. Configure environment variables

Copy the example file and fill in your API key:

```bash
cp .env.example .env
```

Edit `.env`:

```env
# API authentication (choose one)
ANTHROPIC_API_KEY=sk-xxx          # Standard API key via x-api-key header
ANTHROPIC_AUTH_TOKEN=sk-xxx       # Bearer token via Authorization header

# API endpoint (optional, defaults to Anthropic)
ANTHROPIC_BASE_URL=https://api.minimaxi.com/anthropic

# Model configuration
ANTHROPIC_MODEL=MiniMax-M2.7-highspeed
ANTHROPIC_DEFAULT_SONNET_MODEL=MiniMax-M2.7-highspeed
ANTHROPIC_DEFAULT_HAIKU_MODEL=MiniMax-M2.7-highspeed
ANTHROPIC_DEFAULT_OPUS_MODEL=MiniMax-M2.7-highspeed

# Timeout in milliseconds
API_TIMEOUT_MS=3000000

# Disable telemetry and non-essential network traffic
DISABLE_TELEMETRY=1
CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
```

### 4. Start

#### Start the server

```bash
cd server
bun install
bun run src/index.ts
```

#### Start the Web frontend

```bash
cd web
bun install
bun run dev
```

Server runs at `ws://localhost:3000` and `http://localhost:3000`
Web frontend runs at `http://localhost:5173`

---

## API Endpoints

| Endpoint                                 | Method | Description              |
| ---------------------------------------- | ------ | ------------------------ |
| `/api/health`                            | GET    | Health check             |
| `/api/models`                            | GET    | List available models    |
| `/api/tools`                             | GET    | List available tools     |
| `/api/auth/register/send-code`           | POST   | Send registration code   |
| `/api/auth/register`                     | POST   | User registration        |
| `/api/auth/login`                        | POST   | User login              |
| `/api/auth/forgot-password/send-code`   | POST   | Send password reset code |
| `/api/auth/forgot-password`              | POST   | Reset password           |
| `/api/auth/me`                           | GET    | Get current user info    |

### Authentication Flow

#### 1. Send registration code

```bash
curl -X POST http://localhost:3000/api/auth/register/send-code \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com"}'
```

#### 2. Register

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "username": "username",
    "password": "123456",
    "code": "123456"
  }'
```

#### 3. Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "123456"
  }'
```

Success response:

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "tokenType": "Bearer",
    "userId": "uuid",
    "username": "username",
    "email": "user@example.com",
    "isAdmin": false,
    "avatar": "/avatars/default.png"
  }
}
```

#### 4. Password Recovery

Send password reset code:

```bash
curl -X POST http://localhost:3000/api/auth/forgot-password/send-code \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com"}'
```

Reset password:

```bash
curl -X POST http://localhost:3000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "code": "123456",
    "newPassword": "newpassword123"
  }'
```

#### 5. Get Current User

```bash
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer your_access_token"
```

### WebSocket Message Types

| Message Type      | Description        |
| ----------------- | ------------------ |
| `register`        | Register new user  |
| `login`           | Login with token   |
| `create_session`  | Create new session |
| `load_session`    | Load session history |
| `list_sessions`   | List user sessions |
| `user_message`    | Send user message  |
| `delete_session`  | Delete session     |
| `rename_session`  | Rename session     |
| `clear_session`   | Clear session messages |

### Database Configuration

The server uses MySQL database. Configure the following environment variables:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=claude_code_web
JWT_SECRET=your-super-secret-key-change-in-production-min-32-chars
JWT_EXPIRATION=24h
```

---

## Environment Variables

| Variable                                  | Required     | Description                              |
| ----------------------------------------- | ------------ | ---------------------------------------- |
| `ANTHROPIC_API_KEY`                       | One of two   | API key sent via `x-api-key` header      |
| `ANTHROPIC_AUTH_TOKEN`                    | One of two   | Auth token sent via `Authorization` header |
| `ANTHROPIC_BASE_URL`                      | No           | Custom API endpoint, defaults to Anthropic |
| `ANTHROPIC_MODEL`                         | No           | Default model                            |
| `ANTHROPIC_DEFAULT_SONNET_MODEL`          | No           | Sonnet-tier model mapping                 |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL`           | No           | Haiku-tier model mapping                  |
| `ANTHROPIC_DEFAULT_OPUS_MODEL`            | No           | Opus-tier model mapping                   |
| `API_TIMEOUT_MS`                          | No           | API request timeout, default 600000 (10min) |
| `DISABLE_TELEMETRY`                       | No           | Set to `1` to disable telemetry          |
| `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` | No           | Set to `1` to disable non-essential traffic |
| `DB_HOST`                                 | Server mode  | Database host                            |
| `DB_PORT`                                 | Server mode  | Database port                            |
| `DB_USER`                                 | Server mode  | Database username                        |
| `DB_PASSWORD`                             | Server mode  | Database password                        |
| `DB_NAME`                                 | Server mode  | Database name                            |
| `JWT_SECRET`                               | Server mode  | JWT secret (must change in production)    |
| `JWT_EXPIRATION`                          | Server mode  | JWT expiration time                      |

---

## Project Structure

```
web/                      # Web frontend
├── src/
│   ├── App.vue          # Main app component
│   ├── components/      # UI components
│   └── services/        # API services
server/                   # WebSocket server
├── src/
│   ├── index.ts         # Server main entry
│   ├── db/              # Database connection and schema
│   ├── models/          # Data type definitions
│   └── services/        # Business services (auth, session, JWT)
```

---

## Tech Stack

| Category    | Technology                          |
| ----------- | ---------------------------------- |
| Runtime     | [Bun](https://bun.sh)              |
| Language    | TypeScript                         |
| Frontend    | Vue 3                              |
| Build Tool  | Vite                               |
| API         | Anthropic SDK                      |
| Server      | Bun.serve (WebSocket + REST)       |
| Database    | MySQL                              |
| Auth        | JWT + bcrypt                       |

---

## Disclaimer

This project is a Web version implementation of Claude Code. All original source code copyrights belong to [Anthropic](https://www.anthropic.com). It is provided for learning and research purposes only.
