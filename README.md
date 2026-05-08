# EHR Integration System

AI-powered EHR integration backend for 2care.ai's post-discharge care platform.

**Three core capabilities:**
- **Ingest** — pull patient data from a FHIR R4 server into a normalized store
- **Update** — write care plans and clinical actions back to the EHR
- **Extract** — parse doctor notes with Groq AI (Llama 4 Scout) to produce structured clinical actions

**Tech stack:** Node.js 22 · TypeScript · Fastify · PostgreSQL + pgvector · Redis · BullMQ · MinIO · HAPI FHIR R4 · Groq API

> **Implementation status:** Core pipeline (ingest → extract → writeback) is fully working. Features marked _(planned)_ below are designed and scaffolded but not yet implemented.

---

## Quick Start

**Prerequisites:** Docker Desktop, Node.js 22, a Groq API key

```bash
# 1. Clone and configure
git clone <repo-url> ehr && cd ehr
cp .env.example .env
# Edit .env — set GROQ_API_KEY=gsk_...

# 2. Start all infrastructure (includes local HAPI FHIR server)
docker compose up -d

# 3. Install dependencies
npm install

# 4. Seed the local FHIR server with synthetic patients
npm run seed:fhir

# 5. Run the end-to-end demo
npm run seed:demo
```

That's it. The demo ingests 5 synthetic FHIR patients, extracts clinical actions using Groq (Llama 4 Scout), writes a CarePlan back to the local FHIR server, and demonstrates Redis caching.

---

## Service URLs

| Service | URL | Description |
|---|---|---|
| patient-service | http://localhost:3001 | REST API — ingest, patients, jobs, care plans |
| nlp-pipeline | http://localhost:3002 | Notes extraction via Groq AI (Llama 4 Scout) |
| webhook-service | http://localhost:3003 | Inbound FHIR subscription webhook receiver |
| HAPI FHIR | http://localhost:8080/fhir | Local FHIR R4 server |
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

### Ingest patients from HAPI FHIR
```bash
curl -X POST http://localhost:3001/api/v1/patients/ingest \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "epic-sandbox",
    "patient_ids": ["patient-theodore","patient-camila"],
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
# Response: { extraction_id, actions: [...], summary: "..." }
```

### Submit care plan (writeback to FHIR)
```bash
curl -X PUT http://localhost:3001/api/v1/patients/<patient_id>/care-plan \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "encounter_id": "<encounter_id>",
    "updates": [{"type":"CarePlan","action":"add","data":{"title":"Post-discharge plan","activities":[{"detail":"Follow up cardiology within 7 days"}]}}]
  }'
# Response: 202 { job_id }
# Job completes with status: "completed" — CarePlan written to local HAPI FHIR
```

---

## FHIR Server

The system ships with a local **HAPI FHIR** server (Docker) for development and demo.

| Environment | URL | Auth | Write? |
|---|---|---|---|
| Local HAPI FHIR | http://localhost:8080/fhir | None required | Read + Write |
| Epic SMART (production) | https://fhir.epic.com/... | Client credentials (RS384 JWT) | Read + Write |

The default config (`FHIR_AUTH_TYPE=none`) targets the local HAPI server — no registration or internet access needed for FHIR operations.

### Why HAPI FHIR locally?

Epic's sandbox (`fhir.epic.com`) requires OAuth credentials for all requests, including patient reads. HAPI FHIR provides a full FHIR R4 implementation with no auth required, making it ideal for local development and CI.

---

## Epic App Registration (production writeback)

To point the system at Epic FHIR instead of the local HAPI server:

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
FHIR_BASE_URL=https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4
FHIR_CLIENT_ID=<your-client-id>
FHIR_PRIVATE_KEY_PATH=./keys/epic-private.pem
FHIR_TOKEN_URL=https://fhir.epic.com/interconnect-fhir-oauth/oauth2/token
```

**4. Restart the worker:**
```bash
docker compose restart job-worker
```

> The private key is gitignored (`keys/*.pem`) and never committed.

---

## What's Implemented vs Planned

| Feature | Status | Notes |
|---|---|---|
| Patient ingest (FHIR → PostgreSQL) | **Implemented** | |
| Redis caching on patient reads (`X-Cache` headers) | **Implemented** | 5-min TTL |
| Groq AI action extraction (tool-calling) | **Implemented** | Llama 4 Scout |
| CarePlan writeback to FHIR | **Implemented** | Works with HAPI and Epic SMART |
| Raw FHIR bundle storage in MinIO | **Implemented** | |
| FHIR rate limiter + retry policy | **Implemented** | Token bucket, exponential backoff |
| Note-extract async worker | **Implemented** | Triggered manually via API |
| Webhook receiver (inbound FHIR subscriptions) | **Implemented** | Receives + enqueues ingest jobs |
| FHIR subscription registration | _(planned)_ | Webhook receipt works; auto-registration does not exist yet |
| Auto-trigger note extraction from ingest | _(planned)_ | `DocumentReference` not yet fetched/processed during ingest |
| Redis pub/sub consumers | _(planned)_ | Events are published (`patient.ingested`, `action.extracted`) but nothing subscribes yet |
| Semantic search via pgvector | _(planned)_ | Schema + index ready; no embedding generation or search endpoint |
| PHI redaction in logs | _(planned)_ | Logging is plain Winston; no field-level redaction |

---

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full system design including:
- Component diagram (Mermaid)
- SMART on FHIR authentication flow
- Groq tool-calling schema
- Data flow diagrams
- Trade-off analysis
