export interface Patient {
  id: string;
  fhirId: string;
  tenantId: string;
  mrn?: string;
  demographics: PatientDemographics;
  createdAt: Date;
  updatedAt: Date;
}

export interface PatientDemographics {
  name?: string;
  dob?: string;
  gender?: string;
  phone?: string;
  email?: string;
}

export interface Encounter {
  id: string;
  patientId: string;
  fhirId: string;
  type?: string;
  periodStart?: Date;
  periodEnd?: Date;
  status?: string;
  data: Record<string, unknown>;
}

export interface Medication {
  id: string;
  patientId: string;
  encounterId?: string;
  fhirId: string;
  name?: string;
  dosage?: string;
  status?: string;
  data: Record<string, unknown>;
}

export interface Condition {
  id: string;
  patientId: string;
  fhirId: string;
  code?: string;
  display?: string;
  onsetDate?: Date;
  status?: string;
}

export interface ClinicalDocument {
  id: string;
  patientId: string;
  encounterId?: string;
  fhirId?: string;
  type?: string;
  rawText?: string;
  s3Key?: string;
  processedAt?: Date;
}

export type ActionType =
  | 'medication_change'
  | 'new_medication'
  | 'discontinue_medication'
  | 'follow_up'
  | 'referral'
  | 'lab_order'
  | 'imaging_order'
  | 'patient_instruction'
  | 'dietary_restriction'
  | 'activity_restriction';

export type ActionStatus = 'pending' | 'approved' | 'rejected' | 'skipped';
export type ActionUrgency = 'routine' | 'urgent' | 'stat' | 'conditional';

export interface ExtractedAction {
  id: string;
  documentId?: string;
  patientId: string;
  actionType: ActionType;
  details: Record<string, unknown>;
  confidence?: number;
  verbatimSource?: string;
  urgency?: ActionUrgency;
  status: ActionStatus;
  createdAt: Date;
}

export type JobType = 'bulk-ingest' | 'note-extract' | 'ehr-writeback' | 'sync-poll';
export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'skipped';

export interface Job {
  id: string;
  type: JobType;
  status: JobStatus;
  tenantId?: string;
  payload: Record<string, unknown>;
  progress: JobProgress;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

export interface JobProgress {
  total: number;
  completed: number;
  failed: number;
}

export interface SyncLog {
  id: string;
  tenantId?: string;
  resourceType?: string;
  direction: 'inbound' | 'outbound';
  status: 'success' | 'failed';
  error?: string;
  fhirResourceId?: string;
  timestamp: Date;
}

export interface Tenant {
  id: string;
  slug: string;
  fhirBaseUrl: string;
  createdAt: Date;
}
