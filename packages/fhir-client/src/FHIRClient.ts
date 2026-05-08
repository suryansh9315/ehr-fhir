import axios, { AxiosInstance } from 'axios';
import { AuthManager, AuthConfig } from './auth/AuthManager';
import { RateLimiter } from './RateLimiter';
import { RetryPolicy } from './RetryPolicy';
import { createLogger } from '@ehr/shared';

const logger = createLogger('fhir-client');

export interface FHIRClientConfig {
  baseUrl: string;
  auth: AuthConfig;
  tenantId: string;
  rateLimitPerMinute?: number;
}

// Minimal FHIR R4 type definitions
export interface FHIRResource {
  resourceType: string;
  id?: string;
}

export interface FHIRBundle {
  resourceType: 'Bundle';
  total?: number;
  link?: Array<{ relation: string; url: string }>;
  entry?: Array<{ resource: FHIRResource }>;
}

export interface FHIRPatient extends FHIRResource {
  resourceType: 'Patient';
  identifier?: Array<{ system?: string; value?: string }>;
  name?: Array<{ family?: string; given?: string[]; text?: string }>;
  birthDate?: string;
  gender?: string;
  telecom?: Array<{ system?: string; value?: string }>;
}

export interface FHIREncounter extends FHIRResource {
  resourceType: 'Encounter';
  status?: string;
  class?: { code?: string; display?: string };
  type?: Array<{ text?: string; coding?: Array<{ display?: string }> }>;
  subject?: { reference?: string };
  period?: { start?: string; end?: string };
}

export interface FHIRMedicationRequest extends FHIRResource {
  resourceType: 'MedicationRequest';
  status?: string;
  medicationCodeableConcept?: { text?: string; coding?: Array<{ display?: string }> };
  subject?: { reference?: string };
  dosageInstruction?: Array<{ text?: string }>;
}

export interface FHIRCondition extends FHIRResource {
  resourceType: 'Condition';
  code?: { text?: string; coding?: Array<{ code?: string; display?: string }> };
  subject?: { reference?: string };
  onsetDateTime?: string;
  clinicalStatus?: { coding?: Array<{ code?: string }> };
}

export interface FHIRCarePlan extends FHIRResource {
  resourceType: 'CarePlan';
  status?: string;
  intent?: string;
  title?: string;
  subject?: { reference?: string };
  period?: { start?: string };
  activity?: Array<{
    detail?: {
      kind?: string;
      status?: string;
      description?: string;
    };
  }>;
}

export interface FHIRCapabilityStatement extends FHIRResource {
  resourceType: 'CapabilityStatement';
  fhirVersion?: string;
  status?: string;
}

export class FHIRClient {
  private http: AxiosInstance;
  private authManager: AuthManager;
  private rateLimiter: RateLimiter;
  private retryPolicy: RetryPolicy;

  constructor(private config: FHIRClientConfig) {
    this.authManager = new AuthManager(config.auth);
    this.rateLimiter = new RateLimiter({
      tenantId: config.tenantId,
      maxPerMinute: config.rateLimitPerMinute ?? 40,
    });
    this.retryPolicy = new RetryPolicy({ maxRetries: 3, baseDelayMs: 1000 });
    this.http = axios.create({
      baseURL: config.baseUrl,
      timeout: 30_000,
    });
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    await this.rateLimiter.acquire();

    return this.retryPolicy.execute(async () => {
      const token = await this.authManager.getToken();
      const headers: Record<string, string> = {
        Accept: 'application/fhir+json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      if (body) {
        headers['Content-Type'] = 'application/fhir+json';
      }

      logger.debug('FHIR request', { method, path });
      const response = await this.http.request<T>({ method, url: path, data: body, headers });
      return response.data;
    });
  }

  getMetadata(): Promise<FHIRCapabilityStatement> {
    return this.request<FHIRCapabilityStatement>('GET', '/metadata');
  }

  getPatient(fhirId: string): Promise<FHIRPatient> {
    return this.request<FHIRPatient>('GET', `/Patient/${fhirId}`);
  }

  searchPatients(params: Record<string, string>): Promise<FHIRBundle> {
    const qs = new URLSearchParams(params).toString();
    return this.request<FHIRBundle>('GET', `/Patient?${qs}`);
  }

  getEncounters(patientFhirId: string): Promise<FHIRBundle> {
    return this.request<FHIRBundle>('GET', `/Encounter?patient=${patientFhirId}`);
  }

  getMedications(patientFhirId: string): Promise<FHIRBundle> {
    return this.request<FHIRBundle>('GET', `/MedicationRequest?patient=${patientFhirId}`);
  }

  getConditions(patientFhirId: string): Promise<FHIRBundle> {
    return this.request<FHIRBundle>('GET', `/Condition?patient=${patientFhirId}`);
  }

  createCarePlan(carePlan: FHIRCarePlan): Promise<FHIRCarePlan> {
    return this.request<FHIRCarePlan>('POST', '/CarePlan', carePlan);
  }
}

/**
 * Create a FHIRClient from environment variables.
 * Used by workers so they contain no auth configuration logic.
 */
export function createFHIRClientFromEnv(tenantId: string): FHIRClient {
  return new FHIRClient({
    baseUrl: process.env.FHIR_BASE_URL!,
    auth: {
      authType: (process.env.FHIR_AUTH_TYPE ?? 'none') as 'none' | 'smart',
      clientId: process.env.FHIR_CLIENT_ID,
      privateKeyPath: process.env.FHIR_PRIVATE_KEY_PATH,
      tokenUrl: process.env.FHIR_TOKEN_URL,
    },
    tenantId,
    rateLimitPerMinute: 40,
  });
}
