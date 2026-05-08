-- EHR Integration System — PostgreSQL Schema
-- Applied automatically on first postgres container start

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tenants (EHR systems / hospitals)
CREATE TABLE IF NOT EXISTS tenants (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug          TEXT UNIQUE NOT NULL,
  fhir_base_url TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Patients (normalized internal model)
CREATE TABLE IF NOT EXISTS patients (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fhir_id       TEXT NOT NULL,
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  mrn           TEXT,
  demographics  JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (fhir_id, tenant_id)
);

-- Encounters
CREATE TABLE IF NOT EXISTS encounters (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id    UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  fhir_id       TEXT NOT NULL,
  type          TEXT,
  period_start  TIMESTAMPTZ,
  period_end    TIMESTAMPTZ,
  status        TEXT,
  data          JSONB NOT NULL DEFAULT '{}'
);

-- Medications
CREATE TABLE IF NOT EXISTS medications (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id    UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  encounter_id  UUID REFERENCES encounters(id),
  fhir_id       TEXT NOT NULL,
  name          TEXT,
  dosage        TEXT,
  status        TEXT,
  data          JSONB NOT NULL DEFAULT '{}'
);

-- Conditions
CREATE TABLE IF NOT EXISTS conditions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id    UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  fhir_id       TEXT NOT NULL,
  code          TEXT,
  display       TEXT,
  onset_date    DATE,
  status        TEXT
);

-- Clinical documents (discharge notes, etc.)
CREATE TABLE IF NOT EXISTS clinical_documents (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id    UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  encounter_id  UUID REFERENCES encounters(id),
  fhir_id       TEXT,
  type          TEXT,
  raw_text      TEXT,
  s3_key        TEXT,
  processed_at  TIMESTAMPTZ
);

-- Extracted clinical actions (from NLP pipeline)
CREATE TABLE IF NOT EXISTS extracted_actions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id     UUID REFERENCES clinical_documents(id),
  patient_id      UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  action_type     TEXT NOT NULL,
  details         JSONB NOT NULL DEFAULT '{}',
  confidence      NUMERIC(4,3),
  verbatim_source TEXT,
  urgency         TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Note embeddings (pgvector — for semantic search)
CREATE TABLE IF NOT EXISTS note_embeddings (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id   UUID NOT NULL REFERENCES clinical_documents(id) ON DELETE CASCADE,
  embedding     vector(1536),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS note_embeddings_vec_idx
  ON note_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Async job tracking
CREATE TABLE IF NOT EXISTS jobs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'queued',
  tenant_id     UUID REFERENCES tenants(id),
  payload       JSONB NOT NULL DEFAULT '{}',
  progress      JSONB NOT NULL DEFAULT '{"total":0,"completed":0,"failed":0}',
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);

-- EHR sync audit log
CREATE TABLE IF NOT EXISTS sync_log (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID REFERENCES tenants(id),
  resource_type     TEXT,
  direction         TEXT,
  status            TEXT,
  error             TEXT,
  fhir_resource_id  TEXT,
  timestamp         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sync_log_tenant_idx ON sync_log(tenant_id, timestamp DESC);
