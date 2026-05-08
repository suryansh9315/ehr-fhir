/**
 * End-to-end demo flow
 * Usage: npm run seed:demo
 *
 * Runs the full pipeline:
 * 1. Verify Epic sandbox connectivity
 * 2. Ingest 5 Epic test patients
 * 3. Fetch patient record (demonstrate Redis caching)
 * 4. Extract clinical actions from a sample discharge note
 * 5. Trigger EHR writeback (CarePlan)
 * 6. Print summary
 */
import 'dotenv/config';
import axios from 'axios';
import { EPIC_TEST_PATIENTS } from '../seed/epic-patients';
import { signToken } from '../../packages/shared/src/auth/jwt';

const PATIENT_SERVICE = process.env.PATIENT_SERVICE_URL ?? 'http://localhost:3001';
const NLP_SERVICE = process.env.NLP_SERVICE_URL ?? 'http://localhost:3002';

const token = signToken({
  sub: 'demo-user',
  tenantId: 'epic-sandbox',
  scopes: ['patient:read', 'patient:write', 'notes:extract'],
});

const authHeaders = { Authorization: `Bearer ${token}` };

const SAMPLE_DISCHARGE_NOTE = `
DISCHARGE SUMMARY

PATIENT: Theodore Franklin
ADMISSION DIAGNOSIS: Acute exacerbation of congestive heart failure (CHF)

HOSPITAL COURSE:
72-year-old male presenting with worsening dyspnea and lower extremity edema.
BNP elevated at 1450. Chest X-ray showed pulmonary vascular congestion.
Patient responded well to IV diuresis.

DISCHARGE MEDICATIONS:
- Furosemide (Lasix) 40mg BID - INCREASED from 20mg BID
- Metoprolol succinate 50mg daily - continue
- Lisinopril 10mg daily - continue
- Spironolactone 25mg daily - NEW medication

FOLLOW-UP:
Patient to follow up with cardiology clinic within 5-7 days of discharge.

PATIENT INSTRUCTIONS:
- Weigh yourself every morning. If weight increases more than 3 pounds in 24 hours, call the clinic immediately.
- Restrict sodium intake to less than 2 grams per day.
- Refer to outpatient cardiac rehabilitation program.
- Activity: no strenuous activity for 2 weeks.
`.trim();

function print(step: number, total: number, msg: string) {
  console.log(`\n[${step}/${total}] ${msg}`);
}

function ok(msg: string) {
  console.log(`      ✓ ${msg}`);
}

function info(msg: string) {
  console.log(`      → ${msg}`);
}

async function waitForJob(jobId: string, timeoutMs = 60_000): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 2000));
    const resp = await axios.get(`${PATIENT_SERVICE}/api/v1/jobs/${jobId}`, { headers: authHeaders });
    const { status } = resp.data;
    if (['completed', 'failed', 'skipped'].includes(status)) {
      return status;
    }
    process.stdout.write('.');
  }
  throw new Error(`Job ${jobId} timed out after ${timeoutMs}ms`);
}

async function main() {
  console.log('\n' + '═'.repeat(60));
  console.log('  EHR Integration System — End-to-End Demo');
  console.log('═'.repeat(60));

  const STEPS = 5;

  // ─── Step 1: Epic connectivity ───────────────────────────────
  print(1, STEPS, 'Checking HAPI FHIR server connectivity...');
  try {
    const resp = await axios.get(
      `${process.env.FHIR_BASE_URL ?? 'http://localhost:8080/fhir'}/metadata`,
      { headers: { Accept: 'application/fhir+json' }, timeout: 10_000 }
    );
    ok(`CapabilityStatement received (FHIR ${resp.data.fhirVersion ?? 'R4'})`);
  } catch (err) {
    console.error('✗ Epic sandbox unreachable:', (err as Error).message);
    console.error('  Check your internet connection and FHIR_BASE_URL in .env');
    process.exit(1);
  }

  // ─── Step 2: Bulk ingest ──────────────────────────────────────
  print(2, STEPS, `Ingesting ${EPIC_TEST_PATIENTS.length} patients from HAPI FHIR...`);

  const ingestResp = await axios.post(
    `${PATIENT_SERVICE}/api/v1/patients/ingest`,
    {
      tenant_id: 'epic-sandbox',
      patient_ids: EPIC_TEST_PATIENTS.map((p) => p.fhirId),
      resources: ['Patient', 'Encounter', 'MedicationRequest', 'Condition'],
    },
    { headers: { ...authHeaders, 'Content-Type': 'application/json' } }
  );

  const { job_id: ingestJobId } = ingestResp.data;
  info(`Job queued: ${ingestJobId}`);
  info('Polling...');

  const ingestStatus = await waitForJob(ingestJobId);
  ok(`Ingest ${ingestStatus} (${EPIC_TEST_PATIENTS.length} patients processed)`);

  // ─── Step 3: Fetch patient + caching ─────────────────────────
  print(3, STEPS, 'Fetching patient record (demonstrating Redis cache)...');

  const patientsResp = await axios.get(
    `${PATIENT_SERVICE}/api/v1/patients?tenant_id=epic-sandbox`,
    { headers: authHeaders }
  );

  const patients = patientsResp.data.patients ?? [];
  if (!patients.length) {
    console.error('✗ No patients found — ingest may have failed');
    process.exit(1);
  }

  // Prefer a patient with encounters for the writeback demo; fall back to first
  const firstPatient = patients.find((p: { demographics?: { name?: string } }) =>
    p.demographics?.name?.includes('Franklin')
  ) ?? patients[0];
  const patientId = firstPatient.id;
  const patientName = firstPatient.demographics?.name ?? 'Unknown';

  // First request — cache miss
  const p1 = await axios.get(
    `${PATIENT_SERVICE}/api/v1/patients/${patientId}?include=encounters,medications,conditions`,
    { headers: authHeaders }
  );
  info(`First request: X-Cache: ${p1.headers['x-cache'] ?? 'n/a'}`);

  // Second request — cache hit
  const p2 = await axios.get(
    `${PATIENT_SERVICE}/api/v1/patients/${patientId}?include=encounters,medications,conditions`,
    { headers: authHeaders }
  );
  info(`Second request: X-Cache: ${p2.headers['x-cache'] ?? 'n/a'}`);

  const encounterCount = (p2.data.encounters ?? []).length;
  const medicationCount = (p2.data.medications ?? []).length;

  ok(`Patient: ${patientName} | Encounters: ${encounterCount} | Medications: ${medicationCount}`);

  // ─── Step 4: NLP extraction ───────────────────────────────────
  print(4, STEPS, 'Extracting clinical actions from discharge note (Groq AI — Llama 4 Scout)...');

  const extractResp = await axios.post(
    `${NLP_SERVICE}/api/v1/notes/extract`,
    {
      patient_id: patientId,
      note_text: SAMPLE_DISCHARGE_NOTE,
      note_type: 'discharge_summary',
    },
    { headers: { ...authHeaders, 'Content-Type': 'application/json' } }
  );

  const { actions, summary } = extractResp.data;
  const avgConfidence = actions.length
    ? (actions.reduce((sum: number, a: { confidence: number }) => sum + a.confidence, 0) / actions.length).toFixed(2)
    : '0';

  ok(`${actions.length} actions extracted (avg confidence: ${avgConfidence})`);
  info(`Summary: ${summary}`);
  for (const action of actions) {
    info(`  [${action.type}] "${action.verbatim_source?.substring(0, 60)}..." (conf: ${action.confidence})`);
  }

  // ─── Step 5: EHR writeback ────────────────────────────────────
  print(5, STEPS, 'Triggering EHR writeback (CarePlan to HAPI FHIR)...');

  // Get an encounter ID if available
  const encounterId = p2.data.encounters?.[0]?.id;

  let writebackSummary = 'skipped (no encounter)';

  if (!encounterId) {
    info('No encounters found for this patient — skipping writeback');
  } else {
    const writebackResp = await axios.put(
      `${PATIENT_SERVICE}/api/v1/patients/${patientId}/care-plan`,
      {
        encounter_id: encounterId,
        updates: [
          {
            type: 'CarePlan',
            action: 'add',
            data: {
              title: 'Post-discharge CHF Care Plan',
              activities: [
                { detail: 'Follow up with cardiology within 5-7 days' },
                { detail: 'Daily weight monitoring — call clinic if +3 lbs in 24h' },
                { detail: 'Cardiac rehabilitation referral' },
              ],
            },
          },
        ],
      },
      { headers: { ...authHeaders, 'Content-Type': 'application/json' } }
    );

    const writebackJobId = writebackResp.data.job_id;
    info(`Job queued: ${writebackJobId}`);
    info('Polling...');

    const writebackStatus = await waitForJob(writebackJobId);
    const jobDetails = await axios.get(
      `${PATIENT_SERVICE}/api/v1/jobs/${writebackJobId}`,
      { headers: authHeaders }
    );

    if (writebackStatus === 'skipped') {
      writebackSummary = 'skipped';
      info(`Status: skipped — ${jobDetails.data.error ?? ''}`);
    } else if (writebackStatus === 'completed') {
      writebackSummary = 'completed';
      ok('CarePlan written to HAPI FHIR');
    } else {
      writebackSummary = writebackStatus;
      info(`Status: ${writebackStatus} — ${jobDetails.data.error ?? ''}`);
    }
  }

  // ─── Summary ─────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(60));
  console.log('  Demo Complete — Summary');
  console.log('─'.repeat(60));
  console.log(`  Patients ingested:    ${patients.length}`);
  console.log(`  Encounters:           ${encounterCount}`);
  console.log(`  Medications:          ${medicationCount}`);
  console.log(`  Actions extracted:    ${actions.length}`);
  console.log(`  Writeback:            ${writebackSummary}`);
  console.log('');
  console.log('  Service URLs:');
  console.log(`    patient-service:  ${PATIENT_SERVICE}/health`);
  console.log(`    nlp-pipeline:     ${NLP_SERVICE}/health`);
  console.log(`    webhook-service:  http://localhost:3003/health`);
  console.log('═'.repeat(60) + '\n');
}

main().catch((err) => {
  console.error('\n✗ Demo failed:', err.response?.data ?? err.message);
  process.exit(1);
});
