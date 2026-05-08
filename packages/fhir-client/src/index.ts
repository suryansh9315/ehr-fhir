export { FHIRClient, createFHIRClientFromEnv } from './FHIRClient';
export type {
  FHIRClientConfig,
  FHIRResource,
  FHIRBundle,
  FHIRPatient,
  FHIREncounter,
  FHIRMedicationRequest,
  FHIRCondition,
  FHIRCarePlan,
  FHIRCapabilityStatement,
} from './FHIRClient';
export { AuthManager } from './auth/AuthManager';
export type { AuthConfig } from './auth/AuthManager';
export { normalizePatient } from './normalizers/normalizePatient';
export { normalizeEncounter } from './normalizers/normalizeEncounter';
export { normalizeMedication } from './normalizers/normalizeMedication';
export { normalizeCondition } from './normalizers/normalizeCondition';
