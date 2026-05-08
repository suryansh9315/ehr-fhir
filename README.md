# EHR Integration System

AI-powered EHR integration backend for 2care.ai's post-discharge care platform.

**Three core capabilities:**
- **Ingest** — pull patient data from Epic FHIR R4 into a normalized store
- **Update** — write care plans and clinical actions back to the EHR
- **Extract** — parse doctor notes with Claude AI to produce structured clinical actions

**Tech stack:** Node.js 22 · TypeScript · Fastify · PostgreSQL + pgvector · Redis · BullMQ · MinIO · Epic FHIR R4 · Claude API

---

## Quick Start

**Prerequisites:** Docker Desktop, Node.js 22, an Anthropic API key, internet access (Epic sandbox)

```bash
# 1. Clone and configure
git clone <repo-url> ehr && cd ehr
cp .env.example .env
# Edit .env — set ANTHROPIC_API_KEY=sk-ant-...

# 2. Start infrastructure
docker compose up -d

# 3. Install dependencies
npm install

# 4. Run the end-to-end demo
npm run seed:demo
```

That's it. The demo ingests 5 real Epic sandbox patients, extracts clinical actions using Claude, and demonstrates the full pipeline.

---

## Service URLs

| Service | URL | Description |
|---|---|---|
| patient-service | http://localhost:3001 | REST API — ingest, patients, jobs, care plans |
| nlp-pipeline | http://localhost:3002 | Notes extraction via Claude AI |
| webhook-service | http://localhost:3003 | Inbound FHIR subscription webhooks |
| MinIO console | http://localhost:9001 | Object storage UI (user: `minio` / `minio_local`) |
| PostgreSQL | localhost:5432 | Database (`ehr` / `ehr_local`) |
| Redis | localhost:6379 | Cache + job queue |

Health checks:
```bash
curl http://localhost:3001/health
curl http://localhost:3002/health
curl http://localhost:3003/health
```

---

## API Reference

### Get a dev token
```bash
npm run token
# Prints: Bearer eyJ...
```

### Ingest patients from Epic
```bash
curl -X POST http://localhost:3001/api/v1/patients/ingest \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "epic-sandbox",
    "patient_ids": ["eQUelYbRC.bFXMDBgGKHpsA3"],
    "resources": ["Patient","Encounter","MedicationRequest","Condition"]
  }'
# Response: 202 { job_id, status: "queued", status_url }
```

### Check job status
```bash
curl http://localhost:3001/api/v1/jobs/<job_id> \
  -H "Authorization: Bearer <token>"
# Response: { status: "completed", progress: { total, completed, failed } }
```

### Get patient record
```bash
curl "http://localhost:3001/api/v1/patients/<patient_id>?include=encounters,medications,conditions" \
  -H "Authorization: Bearer <token>"
# X-Cache: MISS on first request, HIT on subsequent (5min TTL)
```

### Extract clinical actions from a note
```bash
curl -X POST http://localhost:3002/api/v1/notes/extract \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "patient_id": "<patient_id>",
    "note_text": "Discharge on Lasix 40mg BID, up from 20mg. Follow up cardiology 5-7 days. Refer cardiac rehab.",
    "note_type": "discharge_summary"
  }'
# Response: { actions: [...], summary: "..." }
```

### Submit care plan (writeback to Epic)
```bash
curl -X PUT http://localhost:3001/api/v1/patients/<patient_id>/care-plan \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "encounter_id": "<encounter_id>",
    "updates": [{"type":"CarePlan","action":"add","data":{"title":"Post-discharge plan","activities":[{"detail":"Follow up cardiology within 7 days"}]}}]
  }'
# Response: 202 { job_id }
# Job status will be "skipped" without SMART credentials (see below)
```

---

## Epic Sandbox

Two Epic sandbox environments are used:

| Environment | URL | Auth | Write? |
|---|---|---|---|
| Open sandbox | open.epic.com | None required | Read-only |
| SMART sandbox | fhir.epic.com | Client credentials (RS384 JWT) | Read + Write |

The default config (`FHIR_AUTH_TYPE=none`) uses the **open sandbox** — no registration needed.

Writeback operations (POST /CarePlan) require SMART credentials. Without them, jobs complete with `status: skipped` and a clear message explaining how to enable them.

---

## Epic App Registration (enables full writeback)

To enable writeback to Epic:

**1. Generate an RSA key pair:**
```bash
mkdir -p keys
openssl genrsa -out keys/epic-private.pem 2048
openssl rsa -in keys/epic-private.pem -pubout -out keys/epic-public.pem
```

**2. Register your app at https://fhir.epic.com:**
- Click "Register" → select "Backend Systems" (enables client credentials flow)
- Upload `keys/epic-public.pem` as your JWKS public key
- Note your assigned `client_id`

**3. Update `.env`:**
```bash
FHIR_AUTH_TYPE=smart
FHIR_CLIENT_ID=<your-client-id>
FHIR_PRIVATE_KEY_PATH=./keys/epic-private.pem
FHIR_TOKEN_URL=https://fhir.epic.com/interconnect-fhir-oauth/oauth2/token
```

**4. Restart the worker:**
```bash
docker compose restart job-worker
```

**5. Re-run the demo** — writeback jobs will now show `status: completed` and return a FHIR CarePlan ID.

> The private key is gitignored (`keys/*.pem`) and never committed.

---

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full system design including:
- Component diagram (Mermaid)
- SMART on FHIR authentication flow
- Claude tool-calling schema
- Data flow diagrams
- Trade-off analysis

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | — | Anthropic API key for Claude |
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `REDIS_URL` | Yes | `redis://localhost:6379` | Redis URL |
| `FHIR_BASE_URL` | Yes | Epic R4 URL | FHIR server base URL |
| `FHIR_AUTH_TYPE` | No | `none` | `none` or `smart` |
| `FHIR_CLIENT_ID` | If SMART | — | Epic app client ID |
| `FHIR_PRIVATE_KEY_PATH` | If SMART | — | Path to RS384 private key PEM |
| `FHIR_TOKEN_URL` | If SMART | — | Epic OAuth2 token endpoint |
| `JWT_SECRET` | No | `local-dev-secret` | JWT signing secret (local dev) |
| `SKIP_AUTH` | No | `false` | Set `true` to bypass JWT in dev |
| `S3_ENDPOINT` | No | MinIO URL | S3-compatible endpoint |
| `S3_BUCKET` | No | `ehr-documents` | Storage bucket name |

---

## Troubleshooting

**Epic sandbox returns 401:**
Make sure `FHIR_AUTH_TYPE=none` for the open sandbox. The open sandbox does not accept bearer tokens.

**pgvector extension missing:**
The docker-compose uses `ankane/pgvector:pg16` which includes pgvector. If using a different postgres image, run `CREATE EXTENSION IF NOT EXISTS vector;` manually.

**BullMQ jobs not processing:**
Check the job-worker container logs: `docker compose logs -f job-worker`

**Claude extraction fails:**
Verify `ANTHROPIC_API_KEY` is set correctly in `.env`. Check nlp-pipeline health: `curl http://localhost:3002/health`

**MinIO bucket not found:**
The job-worker creates the bucket on startup. If it fails, access the MinIO console at http://localhost:9001 and create an `ehr-documents` bucket manually.
