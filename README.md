# QuoteAI HVAC

AI-assisted quoting, scheduling, and client-to-technician matching platform for HVAC services.

## Main features

- Conversational diagnostics in French and Arabic.
- Regional pricing in the local currency using a controlled service catalog.
- Technician ranking by specialty, availability, and distance.
- Appointments, calendars, leads, notifications, and real-time messaging.
- Technician price lists imported from CSV, Excel, or text-based PDF files.
- Client ratings and actual intervention price tracking.
- Live client and technician locations with map and route support.

## Architecture

- React/Vite frontend structured with React Router.
- Single Node.js/Express backend.
- PostgreSQL with pgvector as the pricing source of truth.
- Configurable AI Service supporting DeepSeek, OpenAI, and Anthropic/Claude.
- Independent Embedding Service supporting Gemini and OpenAI-compatible providers.
- Deterministic and auditable JavaScript pricing engine.
- React Leaflet with configurable tile and directions providers.
- Socket.IO for messages, notifications, appointments, and live locations.
- JWT authentication stored in a secure HttpOnly cookie.

The pricing flow is exposed through `POST /api/pricing/quote`. Scores below `0.50` and upstream AI
service failures are transferred to human processing. If the AI-generated wording fails the
consistency judge three times, the validated calculation is returned using deterministic wording.

## Requirements

- Node.js 22 and npm.
- PostgreSQL with the `vector` and `unaccent` extensions.
- An API key for the selected AI provider.
- An embedding service compatible with the selected configuration.
- Docker, optionally, for local services and deployment.

## Local installation

1. Install dependencies:

   ```bash
   npm --prefix backend install
   npm --prefix frontend install
   ```

2. Copy `.env.example` to `.env` at the repository root and replace the demonstration values,
   especially `DATABASE_URL`, `JWT_SECRET`, and the external service keys.

3. Create the PostgreSQL database and initialize the schema:

   ```bash
   npm run backend:db:init
   ```

4. Import the pricing catalog and generate its embeddings:

   ```bash
   npm --prefix backend run pricing:import
   npm --prefix backend run pricing:embed
   ```

5. Start the API and frontend in two terminals:

   ```bash
   npm run backend:dev
   npm run frontend
   ```

By default, the API listens on `http://127.0.0.1:5000` and Vite on
`http://127.0.0.1:5174`.

## Pricing catalog

After import, PostgreSQL becomes the pricing source of truth. The Excel workbook is never read
during a client request. Reimport it only when the source catalog changes, then regenerate the
embeddings.

### Local embedding server

The default local configuration expects an OpenAI-compatible `POST /v1/embeddings` endpoint on
port 8081. Port 8080 is reserved by EnterpriseDB in the reference development environment.

With an NVIDIA GPU, Qwen3 can be served through Hugging Face Text Embeddings Inference:

```bash
docker run --gpus all -p 8081:80 -v hf_cache:/data \
  ghcr.io/huggingface/text-embeddings-inference:1.9 \
  --model-id Qwen/Qwen3-Embedding-8B --dtype float16
```

For a CPU environment, BGE-M3 can be used:

```bash
docker run --name quoteai_embeddings_bge_lean --restart unless-stopped \
  -p 8081:80 -v hf_cache:/data \
  ghcr.io/huggingface/text-embeddings-inference:cpu-1.9 \
  --model-id BAAI/bge-m3 --tokenization-workers 2 \
  --max-concurrent-requests 16 --max-batch-tokens 2048 \
  --max-client-batch-size 16
```

```dotenv
EMBEDDING_PROVIDER=openai-compatible
EMBEDDING_MODEL=BAAI/bge-m3
EMBEDDING_QUERY_INSTRUCTION=
```

If Docker has less than 12 GB of memory, use `multilingual-e5-large-instruct`. It is supported by
TEI CPU and its native dimension is already 1024:

```bash
docker run -p 8081:80 -v hf_cache:/data \
  ghcr.io/huggingface/text-embeddings-inference:cpu-1.9 \
  --model-id intfloat/multilingual-e5-large-instruct \
  --tokenization-workers 2 --max-batch-tokens 4096
```

```dotenv
EMBEDDING_MODEL=intfloat/multilingual-e5-large-instruct
EMBEDDING_QUERY_INSTRUCTION=Retrieve the HVAC fault catalog entry that best matches the user request
```

Run `npm --prefix backend run pricing:embed` after every model or dimension change. Vectors are
reduced to 1024 dimensions and normalized by the backend to remain compatible with the pgvector
schema.

CPU embedding defaults use batches of eight documents and a 180-second timeout. These values can
be changed through `EMBEDDING_BATCH_SIZE` and `EMBEDDING_TIMEOUT_MS`.

### Gemini embeddings

The Render configuration currently uses Gemini:

```dotenv
EMBEDDING_PROVIDER=gemini
EMBEDDING_BASE_URL=https://generativelanguage.googleapis.com/v1beta
EMBEDDING_MODEL=gemini-embedding-2
EMBEDDING_DIMENSIONS=1024
EMBEDDING_API_KEY=...
```

The pricing engine calls only the Embedding Service. Switching between Gemini, OpenAI, BGE-M3, or
another OpenAI-compatible server does not require changes to routes or business logic.

### Conversation consistency and minimum prices

The chat sends recent messages to the pricing engine so short answers can be resolved within their
conversation context. A simple maintenance question, such as how to access a dirty filter, receives
safe maintenance guidance before any commercial proposal. A quote is calculated only when the
client is actually requesting an intervention.

Small interventions use a local service minimum to avoid artificially low amounts. Initial
calibrations are 2,500 DZD in Algeria and 45 TND in Tunisia. They are stored in
`pricing_service_minimums` and can be updated without changing the calculation engine.

If AI-generated wording fails the consistency check three times, the backend generates
deterministic text from the validated calculation. The client therefore receives a consistent
estimate instead of a false technical failure.

### Technician price-list import

The technician dashboard accepts CSV, Excel `.xlsx`/`.xlsm`, and text-based PDF files up to 5 MB.
The parser recognizes French and English variants of the `Service`, `Price`, `Unit`, and `Category`
columns even when the header is not on the first row. Image-only PDFs require OCR before import.

## Interchangeable AI provider

The pricing engine depends only on the `extract()`, `redact()`, and `judge()` AI Service interface.
DeepSeek, OpenAI, and Anthropic/Claude adapters can be selected without modifying the orchestrator:

```dotenv
AI_PROVIDER=deepseek # deepseek | openai | anthropic
AI_API_KEY=...
AI_BASE_URL=https://api.deepseek.com
AI_MODEL=deepseek-chat
```

OpenAI uses a base URL ending in `/v1`. Anthropic normally uses
`https://api.anthropic.com/v1`. The legacy `LLM_*` variables remain supported for existing
deployments.

## Maps and geocoding

Map tiles, attribution, directions, and geocoding are configurable independently:

```dotenv
VITE_MAP_TILE_URL=https://tile.openstreetmap.org/{z}/{x}/{y}.png
VITE_MAP_TILE_ATTRIBUTION=&copy; OpenStreetMap contributors
VITE_DIRECTIONS_PROVIDER=google
VITE_DIRECTIONS_BASE_URL=https://www.google.com/maps/dir/

GEOCODING_PROVIDER=nominatim
GEOCODING_BASE_URL=https://nominatim.openstreetmap.org
MAP_TILE_ORIGINS=https://tile.openstreetmap.org
```

When changing tile providers, add the new image origin to `MAP_TILE_ORIGINS` so the backend Content
Security Policy allows it.

## Authentication

Authentication uses a signed JWT stored in the `quoteai_session` cookie. In production the cookie
is `HttpOnly`, `Secure`, and `SameSite=Lax`. The browser sends it automatically for Axios and
Socket.IO requests. The token is not stored in `localStorage` or `sessionStorage`.

## Verification

```bash
npm --prefix backend test
npm --prefix frontend run lint
npm --prefix frontend run build
```

## Deployment

The project uses a multi-stage Docker image. Vite compiles the frontend, then Express serves the
static application, API, and Socket.IO from the same domain. The health endpoint is `GET /health`.

1. Create a PostgreSQL database with pgvector and run `npm run backend:db:init`.
2. Configure at least `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS`, `AI_PROVIDER`, the selected AI
   credentials, and the embedding variables.
3. Build the image:

   ```bash
   docker build -t quoteai-hvac .
   ```

4. Run it:

   ```bash
   docker run --env-file .env.production -p 5000:5000 quoteai-hvac
   ```

`render.yaml` also supports a Render Blueprint deployment. At startup, the container initializes
the schema, loads demonstration accounts, imports the pricing catalog, and starts embedding
indexation in the background. Secrets marked `sync: false` must be configured in the Render
dashboard.

Never deploy or commit the local `.env` file.
