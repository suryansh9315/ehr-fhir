/**
 * Epic open sandbox test patients (open.epic.com)
 * These are publicly available test patient IDs — not real PHI.
 * Full list: https://open.epic.com/MyApps/Endpoints
 */
export const EPIC_TEST_PATIENTS = [
  {
    fhirId: 'eQUelYbRC.bFXMDBgGKHpsA3',
    name: 'Camila Lopez',
    condition: 'Diabetes',
  },
  {
    fhirId: 'erXuFYUfucBZaryVksYEcMg3',
    name: 'Derrick Lin',
    condition: 'COPD',
  },
  {
    fhirId: 'eq081-VQEgP8drUUqCWzHfw3',
    name: 'Jessica Martinez',
    condition: 'Hypertension',
  },
  {
    fhirId: 'eAB3mDIBBcyUKviyzrxsnAw3',
    name: 'Theodore Franklin',
    condition: 'CHF',
  },
  {
    fhirId: 'e63wRTbPfr1p8UW81d8Seiw3',
    name: 'Leonardo Patterson',
    condition: 'CKD',
  },
] as const;

export type EpicTestPatient = (typeof EPIC_TEST_PATIENTS)[number];
