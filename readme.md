# Sightline

A realtime **Live Agent** built with TypeScript, Gemini Live API, microphone streaming, camera-frame streaming, and interruption handling.

## what this app does

- Starts a Gemini Live session over WebSocket.
- Streams microphone audio in realtime (`audio/pcm`).
- Streams camera frames in realtime (`image/jpeg`).
- Shows live user transcription + live model transcript.
- Supports interruption (`activity.start` / `activity.end`) and barge-in behavior.
- Uses `@google/genai` Live API on the backend.

## stack

- frontend: React + Vite + TypeScript
- backend: Node.js + TypeScript + `ws`
- ai: Google GenAI SDK (`@google/genai`) with `ai.live.connect`
- deploy target: Google Cloud Run

## project structure

```text
src/
  client/
    components/
    hooks/
    lib/
  server/
    lib/
    live/
  shared/
    types/
docs/
  architecture.md
```

## prerequisites

- Node.js 20+
- pnpm 9+
- Gemini API key

## env setup

Copy env template:

```bash
cp .env.example .env
```

Set values:

```env
GEMINI_API_KEY=your-key
GEMINI_LIVE_MODEL=gemini-2.5-flash-native-audio-preview-12-2025
PORT=8080
CORS_ORIGIN=http://localhost:5173
VITE_WS_BASE_URL=
```

## local run

```bash
pnpm install
pnpm run dev
```

- app: `http://localhost:5173`
- health: `http://localhost:8080/api/health`

Browser flow:

1. Click **start live session**.
2. Enable **stream microphone audio**.
3. Enable **stream camera frames**.
4. Speak naturally.
5. Interrupt by speaking again or pressing **interrupt now**.

## build and start

```bash
pnpm run typecheck
pnpm run build
pnpm run start
```

## deploy to cloud run

### option 1: cloud build

```bash
gcloud builds submit --config cloudbuild.yaml
```

### option 1b: automatic deploy on push

Set a Cloud Build trigger that runs `cloudbuild.yaml` on push to `main`.

Required one-time IAM for Cloud Build service account (`PROJECT_NUMBER@cloudbuild.gserviceaccount.com`):

- `roles/run.admin`
- `roles/artifactregistry.writer`
- `roles/iam.serviceAccountUser`

### option 2: manual container

```bash
docker build -f Dockerfile -t sightline-live .
docker run -p 8080:8080 --env-file .env sightline-live
```

## notes

- Keep API keys server-side only.
- If the selected model is unavailable in your account, set `GEMINI_LIVE_MODEL` to a model available in your project.
