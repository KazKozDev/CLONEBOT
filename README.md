CLONEBOT is a chatbot built on Ollama (gpt-oss:20b) that doesn't just run the model — it wraps it in an intelligent system. Advanced context management, reasoning chains, a suite of tools — everything is tuned to squeeze the maximum from an open-source LLM and bring the experience close to frontier models. No subscriptions. No API keys. No compromises on privacy. Just your hardware, your data, your control.

## Project status

- ✅ **Module 1**: Message Bus (Pub/Sub)
- ✅ **Module 2**: Session Store
- ✅ **Module 3**: Context Assembler
- ✅ **Module 4**: Model Adapter
- ✅ **Module 5**: Tool Executor
- ✅ **Module 6**: Agent Loop
- ✅ **Module 7**: Block Streamer (Markdown formatting)
- ✅ **Module 8**: Gateway Server (HTTP/WebSocket)
- ✅ **Module 9**: Telegram Adapter
- ✅ **Module 10**: Memory Store (long-term memory)

## Features

- **Agent loop execution**: tool calling, multi‑turn runs, retries, and streaming events.
- **Context assembly**: session history, skills, tool availability, and optional user profile context.
- **Tool execution**: validated parameters, permissions, timeouts, result normalization, and audit hooks.
- **Memory**: session storage plus long‑term memory/user profile integration.
- **Interfaces**:
	- Web UI (streaming NDJSON)
	- Telegram bot integration
	- CLI runner for tests and checkpoints
- **Artifacts**: create and view generated documents, SVG, mermaid, web, and React outputs.
- **Skills registry**: load and execute skill tools with filtering and permissions.
- **Gateway server**: HTTP/WebSocket API for chat, artifacts, projects, and memory endpoints.

## Core functionality

- **Message Bus**: pub/sub messaging across modules.
- **Session Store**: persistent chat sessions with artifacts and metadata.
- **Model Adapter**: provider‑agnostic model interface and streaming deltas.
- **Context Assembler**: system prompt build, tool list collection, token budgeting.
- **Tool Executor**: parameter schema validation, permission gating, timeouts, error handling.
- **Block Streamer**: markdown rendering for streamed responses.

## Requirements

- Node.js + npm
- Ollama running on http://localhost:11434 (used by default)

## Setup

1. Install dependencies

	npm install

2. Ensure Web UI static assets are present

	cp -r art/web/static/* web/static/

3. Start the Web UI server

	./start-dev.sh

4. Stop the dev server

	./stop-dev.sh

## Installation

1. Clone the repository

	git clone <repo_url>
	cd CLONEBOT

2. Install dependencies

	npm install

3. Ensure Web UI static assets are present

	cp -r art/web/static/* web/static/

4. Start Ollama locally

	ollama serve

## Run (three entry points)

1. **Web UI (full integration)**

	./start-dev.sh

2. **Gateway server only**

	npm run start:gateway

3. **CLI / Telegram**

	npm run cli

	# or Telegram (requires TELEGRAM_BOT_TOKEN)
	npm run start

## Configuration

Environment variables used by the dev script:

- `WEB_PORT` (default: 3001)
- `WEB_HOST` (default: 127.0.0.1)
- `DATA_DIR` (default: ./data)

Optional runtime variables (CLI / gateway):

- `TELEGRAM_BOT_TOKEN` (Telegram bot token)
- `GATEWAY_PORT` (Gateway server port)

## Scripts

- `npm run build` — TypeScript build
- `npm test` / `npm run test:watch` / `npm run test:coverage`
- `npm run cli` — CLI entry
- `npm run chat` — CLI chat
- `npm run start:gateway` — Gateway server
- `npm run web` — Web UI server
- `npm run web:dev` — Web UI on port 3000
- `npm run checkpoint` and `npm run checkpoint:*` — integration checkpoints

## CLI

Entry point: `cli.ts` (commands: start, telegram, gateway, test, build, info).

## Project structure (high level)

- `src/` — core framework (agent loop, tools, adapters, gateway)
- `web/` — Next.js app + static Web UI assets
- `art/` — Artifact Studio and deep-thinking reference implementation
- `skills/` — skills registry and examples
- `data/` — chats, artifacts, projects, memory
- `scripts/` — helper scripts

## Tests

Jest configuration is in `jest.config.js`. Tests live under `src/**/__tests__`.

## Contributing

Contributions are welcome. Keep changes focused and documented.

- Open an issue for bugs or feature proposals.
- Follow existing folder structure.
- Add or update tests when changing core behavior.
- For UI changes, include screenshots or short notes.
- Keep PRs small and single‑purpose when possible.

