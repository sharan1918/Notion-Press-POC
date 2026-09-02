# Production Deployment & CI/CD Guide

This guide covers the production architecture, zero-cost deployment workflow, and automated CI/CD pipelines for the **Notion Press AI Email Processing System**.

---

## 🏗 Architecture

```text
                    GitHub Repository
                           │
             ┌─────────────┼─────────────┐
             ↓             ↓             ↓
          Robin           CI            CD
        AI Review       pytest        Deploy
         (PR bot)        lint           │
                         build          │
                                        │
                         ┌──────────────┴──────────────┐
                         ↓                             ↓
                      Vercel                         Koyeb
                   React + Vite                     FastAPI
                   (Global CDN)                 (Docker Engine)
                         │                             │
                         └──────────────┬──────────────┘
                                        ↓
                               LangGraph + SQLite
                                        ↓
                                   Gemini / Groq
```

---

## 🚀 Deployment Step-by-Step

### 1. Backend Deployment on Koyeb (Free Tier)

[Koyeb](https://www.koyeb.com/) runs standard Docker containers with fast wake times and no VPS overhead.

1. **Sign in to Koyeb** and click **Create Service** → **Web Service**.
2. **Source**: Select **GitHub** and authorize your repository `Notion-Press-POC`.
3. **Build & Deployment Settings**:
   - **Builder**: `Dockerfile`
   - **Work directory**: `backend`
   - **Dockerfile location**: `backend/Dockerfile`
4. **Environment Variables**:
   Add the following under **Environment variables**:
   - `GOOGLE_API_KEY`: `AIzaSy...` (Your Gemini API Key)
   - `GROQ_API_KEY`: `gsk_...` (Your Groq API Key)
   - `PORT`: `8000`
5. **Instance & Scaling**: Select **Nano (Free Tier)**.
6. **Deploy**: Click **Deploy**. Koyeb will build the container and provide your live API domain:
   `https://<your-app-name>.koyeb.app`
7. Verify health: `https://<your-app-name>.koyeb.app/api/health` should return `{"status": "ok"}`.

---

### 2. Frontend Deployment on Vercel (Free Tier)

[Vercel](https://vercel.com/) hosts modern React/Vite frontends with global edge caching and automatic preview branches for every PR.

1. **Sign in to Vercel** and click **Add New...** → **Project**.
2. **Import Git Repository**: Select `Notion-Press-POC`.
3. **Configure Project**:
   - **Framework Preset**: `Vite`
   - **Root Directory**: Click *Edit* and select `frontend`.
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. **Environment Variables**:
   - `VITE_API_BASE_URL`: `https://<your-app-name>.koyeb.app/api`
5. Click **Deploy**. Vercel will build and assign a domain (e.g. `https://notion-press-poc.vercel.app`).

---

## 🔄 CI/CD Pipelines (GitHub Actions)

### 1. Continuous Integration (`.github/workflows/ci.yml`)
Triggers automatically on every `push` and `pull_request` to `main` and `develop`:
- **Backend Job**:
  - Installs Python 3.11 with `uv`
  - Installs all dependencies from `requirements.txt`
  - Runs the full `pytest` suite (`backend/tests/test_graph.py`)
- **Frontend Job**:
  - Sets up Node.js 20 with npm caching
  - Runs `oxlint` static code analysis
  - Runs TypeScript typecheck & Vite build (`npm run build`)

### 2. Continuous Deployment (`.github/workflows/deploy.yml`)
- Automatically triggered on push to `main`.
- Supports direct GitHub auto-deploy (zero configuration) or token/webhook triggers.

### 3. Robin AI Review Bot (`.github/workflows/robin.yml`)
- Automatically reviews Pull Requests when triggered via PR comments.

---

## 🔐 Environment Variables Reference

### Backend (`backend/.env`)
| Variable | Required | Description | Example |
| :--- | :--- | :--- | :--- |
| `GOOGLE_API_KEY` | Yes | Google Gemini API Key | `AIzaSy...` |
| `GROQ_API_KEY` | Optional | Groq API Key (Failover LLM) | `gsk_...` |
| `CORS_ORIGINS` | Optional | Allowed CORS origins (comma-separated) | `http://localhost:5173,https://my-app.vercel.app` |
| `CORS_ORIGIN_REGEX` | Optional | Regex for dynamic preview domains | `https://.*\.vercel\.app` |
| `PORT` | Optional | Backend listen port (defaults to 8000) | `8000` |

### Frontend (`frontend/.env`)
| Variable | Required | Description | Example |
| :--- | :--- | :--- | :--- |
| `VITE_API_BASE_URL` | Yes | Endpoint base URL for backend API | `https://<app>.koyeb.app/api` |

---

## 💾 Storage & Persistence Roadmap

| Environment | Checkpointer | Feedback Storage | Notes |
| :--- | :--- | :--- | :--- |
| **Current POC** | SQLite (`checkpoints.sqlite`) | JSON (`corrections.json`) | Retained across container lifespan. Ideal for POC demonstrations. |
| **Production Upgrade** | PostgreSQL / Supabase | PostgreSQL / Supabase | Replace `SqliteSaver` with `PostgresSaver` for distributed multi-instance durability. |
