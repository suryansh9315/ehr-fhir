export interface BulkIngestJobData {
  jobId: string;
  tenantId: string;
  patientFhirIds?: string[];
  resources: string[];
}

export interface NoteExtractJobData {
  documentId: string;
  patientId: string;
  noteText: string;
  noteType: string;
}

export interface CarePlanUpdate {
  type: string;
  action: 'add' | 'update' | 'remove';
  data: Record<string, unknown>;
}

export interface EhrWritebackJobData {
  jobId: string;
  patientId: string;
  patientFhirId: string;
  encounterId: string;
  encounterFhirId?: string;
  tenantId: string;
  updates: CarePlanUpdate[];
}
