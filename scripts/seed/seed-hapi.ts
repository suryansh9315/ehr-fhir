/**
 * Seeds the local HAPI FHIR server with synthetic test patients.
 * Run once after `docker compose up -d` before running the demo.
 * Usage: npm run seed:fhir
 */
import 'dotenv/config';
import axios from 'axios';

const FHIR_BASE = process.env.FHIR_BASE_URL ?? 'http://localhost:8080/fhir';

const PATIENTS = [
  {
    resourceType: 'Patient',
    id: 'patient-camila',
    identifier: [{ system: 'urn:oid:mrn', value: 'MRN001' }],
    name: [{ use: 'official', family: 'Lopez', given: ['Camila'] }],
    gender: 'female',
    birthDate: '1971-08-07',
    telecom: [
      { system: 'phone', value: '555-0101' },
      { system: 'email', value: 'camila.lopez@example.com' },
    ],
  },
  {
    resourceType: 'Patient',
    id: 'patient-derrick',
    identifier: [{ system: 'urn:oid:mrn', value: 'MRN002' }],
    name: [{ use: 'official', family: 'Lin', given: ['Derrick'] }],
    gender: 'male',
    birthDate: '1965-03-14',
    telecom: [{ system: 'phone', value: '555-0102' }],
  },
  {
    resourceType: 'Patient',
    id: 'patient-jessica',
    identifier: [{ system: 'urn:oid:mrn', value: 'MRN003' }],
    name: [{ use: 'official', family: 'Martinez', given: ['Jessica'] }],
    gender: 'female',
    birthDate: '1980-11-22',
    telecom: [{ system: 'email', value: 'jessica.martinez@example.com' }],
  },
  {
    resourceType: 'Patient',
    id: 'patient-theodore',
    identifier: [{ system: 'urn:oid:mrn', value: 'MRN004' }],
    name: [{ use: 'official', family: 'Franklin', given: ['Theodore'] }],
    gender: 'male',
    birthDate: '1952-06-30',
    telecom: [{ system: 'phone', value: '555-0104' }],
  },
  {
    resourceType: 'Patient',
    id: 'patient-leonardo',
    identifier: [{ system: 'urn:oid:mrn', value: 'MRN005' }],
    name: [{ use: 'official', family: 'Patterson', given: ['Leonardo'] }],
    gender: 'male',
    birthDate: '1958-09-18',
    telecom: [{ system: 'phone', value: '555-0105' }],
  },
];

const ENCOUNTERS = [
  {
    resourceType: 'Encounter',
    status: 'finished',
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'IMP', display: 'inpatient encounter' },
    type: [{ text: 'Admission' }],
    subject: { reference: 'Patient/patient-theodore' },
    period: { start: '2026-04-28T08:00:00Z', end: '2026-05-02T14:00:00Z' },
    reasonCode: [{ text: 'Acute exacerbation of congestive heart failure' }],
  },
  {
    resourceType: 'Encounter',
    status: 'finished',
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB', display: 'ambulatory' },
    type: [{ text: 'Office visit' }],
    subject: { reference: 'Patient/patient-camila' },
    period: { start: '2026-04-15T09:30:00Z', end: '2026-04-15T10:00:00Z' },
  },
];

const MEDICATIONS = [
  {
    resourceType: 'MedicationRequest',
    status: 'active',
    intent: 'order',
    subject: { reference: 'Patient/patient-theodore' },
    medicationCodeableConcept: { text: 'Furosemide (Lasix) 40mg BID' },
    dosageInstruction: [{ text: '40mg twice daily' }],
  },
  {
    resourceType: 'MedicationRequest',
    status: 'active',
    intent: 'order',
    subject: { reference: 'Patient/patient-theodore' },
    medicationCodeableConcept: { text: 'Metoprolol succinate 50mg daily' },
    dosageInstruction: [{ text: '50mg once daily' }],
  },
  {
    resourceType: 'MedicationRequest',
    status: 'active',
    intent: 'order',
    subject: { reference: 'Patient/patient-camila' },
    medicationCodeableConcept: { text: 'Metformin 1000mg BID' },
    dosageInstruction: [{ text: '1000mg twice daily' }],
  },
];

const CONDITIONS = [
  {
    resourceType: 'Condition',
    clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }] },
    subject: { reference: 'Patient/patient-theodore' },
    code: { text: 'Congestive heart failure' },
    onsetDateTime: '2020-01-15',
  },
  {
    resourceType: 'Condition',
    clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }] },
    subject: { reference: 'Patient/patient-camila' },
    code: { text: 'Type 2 diabetes mellitus' },
    onsetDateTime: '2018-06-20',
  },
  {
    resourceType: 'Condition',
    clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }] },
    subject: { reference: 'Patient/patient-derrick' },
    code: { text: 'Chronic obstructive pulmonary disease' },
    onsetDateTime: '2019-03-10',
  },
];

async function upsert(resource: { resourceType: string; id?: string }) {
  const url = resource.id
    ? `${FHIR_BASE}/${resource.resourceType}/${resource.id}`
    : `${FHIR_BASE}/${resource.resourceType}`;

  const method = resource.id ? 'put' : 'post';
  const resp = await axios[method](url, resource, {
    headers: { 'Content-Type': 'application/fhir+json', Accept: 'application/fhir+json' },
  });
  return resp.data as { id: string };
}

async function main() {
  console.log(`Seeding HAPI FHIR at ${FHIR_BASE}...`);

  // Wait for HAPI to be ready
  for (let i = 0; i < 20; i++) {
    try {
      await axios.get(`${FHIR_BASE}/metadata`, { timeout: 5000 });
      break;
    } catch {
      if (i === 19) throw new Error('HAPI FHIR not reachable after 20 attempts');
      process.stdout.write('.');
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  console.log('\nHAPI FHIR is ready.');

  for (const p of PATIENTS) {
    await upsert(p);
    console.log(`  ✓ Patient/${p.id}`);
  }

  for (const r of [...ENCOUNTERS, ...MEDICATIONS, ...CONDITIONS]) {
    const result = await upsert(r);
    console.log(`  ✓ ${r.resourceType}/${result.id}`);
  }

  console.log(`\nSeeded ${PATIENTS.length} patients, ${ENCOUNTERS.length} encounters, ${MEDICATIONS.length} medications, ${CONDITIONS.length} conditions.`);
}

main().catch((err) => {
  console.error('Seed failed:', err.response?.data ?? err.message);
  process.exit(1);
});
