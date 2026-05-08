import { Encounter } from '@ehr/shared';
import { FHIREncounter } from '../FHIRClient';
import { v4 as uuid } from 'uuid';

export function normalizeEncounter(
  fhirEncounter: FHIREncounter,
  patientId: string
): Omit<Encounter, never> {
  const type =
    fhirEncounter.type?.[0]?.text ??
    fhirEncounter.type?.[0]?.coding?.[0]?.display ??
    fhirEncounter.class?.display ??
    undefined;

  return {
    id: uuid(),
    patientId,
    fhirId: fhirEncounter.id!,
    type,
    periodStart: fhirEncounter.period?.start ? new Date(fhirEncounter.period.start) : undefined,
    periodEnd: fhirEncounter.period?.end ? new Date(fhirEncounter.period.end) : undefined,
    status: fhirEncounter.status,
    data: fhirEncounter as unknown as Record<string, unknown>,
  };
}
