/**
 * Test patients loaded into the local HAPI FHIR server by seed-hapi.ts.
 * These are synthetic patients — not real PHI.
 */
export const EPIC_TEST_PATIENTS = [
  {
    fhirId: 'patient-camila',
    name: 'Camila Lopez',
    condition: 'Diabetes',
  },
  {
    fhirId: 'patient-derrick',
    name: 'Derrick Lin',
    condition: 'COPD',
  },
  {
    fhirId: 'patient-jessica',
    name: 'Jessica Martinez',
    condition: 'Hypertension',
  },
  {
    fhirId: 'patient-theodore',
    name: 'Theodore Franklin',
    condition: 'CHF',
  },
  {
    fhirId: 'patient-leonardo',
    name: 'Leonardo Patterson',
    condition: 'CKD',
  },
] as const;

export type EpicTestPatient = (typeof EPIC_TEST_PATIENTS)[number];
