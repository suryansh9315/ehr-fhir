import { EhrWritebackJobData, CarePlanUpdate } from '@ehr/shared';
import { FHIRCarePlan } from '@ehr/fhir-client';

function formatActivityDescription(update: CarePlanUpdate): string {
  const data = update.data as Record<string, unknown>;
  if (typeof data.detail === 'string') return data.detail;

  const activities = data.activities as Array<{ detail: string }> | undefined;
  if (activities?.length) {
    return activities.map((a) => a.detail).join('; ');
  }

  return data.title as string ?? 'Care plan activity';
}

export function buildCarePlan(jobData: EhrWritebackJobData): FHIRCarePlan {
  const activities = jobData.updates.map((update) => ({
    detail: {
      kind: 'ServiceRequest',
      status: 'scheduled',
      description: formatActivityDescription(update),
    },
  }));

  const title = (jobData.updates[0]?.data as Record<string, unknown>)?.title as string
    ?? 'Post-discharge Care Plan';

  const carePlan: FHIRCarePlan = {
    resourceType: 'CarePlan',
    status: 'active',
    intent: 'plan',
    title,
    subject: { reference: `Patient/${jobData.patientFhirId}` },
    period: { start: new Date().toISOString() },
    activity: activities,
  };

  if (jobData.encounterFhirId) {
    carePlan.activity = activities; // already set
    // Add encounter reference via extension pattern (FHIR R4 CarePlan supports encounter)
    (carePlan as unknown as Record<string, unknown>)['encounter'] = {
      reference: `Encounter/${jobData.encounterFhirId}`,
    };
  }

  return carePlan;
}

export function validateCarePlan(carePlan: FHIRCarePlan): void {
  if (carePlan.resourceType !== 'CarePlan') {
    throw new Error('Invalid resource type');
  }
  if (!carePlan.status) {
    throw new Error('CarePlan.status is required');
  }
  if (!carePlan.intent) {
    throw new Error('CarePlan.intent is required');
  }
  if (!carePlan.subject?.reference) {
    throw new Error('CarePlan.subject is required');
  }
  if (!carePlan.activity?.length) {
    throw new Error('CarePlan must have at least one activity');
  }
}
