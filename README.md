# MedTrack AI

Smart medication management app. Track prescriptions, log symptoms, and get AI-powered insights — all organized into a clear, shareable timeline.

## Tech Stack

- **Frontend:** Vite + React 19 + TypeScript + Tailwind CSS v4 + React Router
- **Backend:** Express + TypeScript + better-sqlite3
- **Runtime:** Bun

## Getting Started

### Prerequisites
- [Bun](https://bun.sh) (v1.3+)

### Install

```bash
cd medchron
bun install
cd frontend && bun install && cd ..
cd backend && bun install && cd ..
```

### Development

```bash
bun run dev
```

This starts:
- Frontend dev server on **http://localhost:5173** (with API proxy to backend)
- Backend API server on **http://localhost:3001**

### Build & Publish

```bash
bash publish.sh
```

Builds the frontend and backend, then starts the production server on **port 3000** serving both the static frontend and API.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/medications` | List all medications |
| GET | `/api/medications/:id` | Get a medication |
| POST | `/api/medications` | Create a medication |
| PUT | `/api/medications/:id` | Update a medication |
| DELETE | `/api/medications/:id` | Delete a medication |

## Project Structure

```
medchron/
├── frontend/          # Vite + React app
│   └── src/
│       ├── pages/     # Route pages
│       └── components/# Shared components
├── backend/           # Express API
│   └── src/
│       ├── routes/    # API route handlers
│       ├── db.ts      # SQLite setup
│       └── index.ts   # Server entry
├── publish.sh         # Production build & deploy
└── package.json       # Root workspace scripts
```
