import { Condition } from '@ehr/shared';
import { FHIRCondition } from '../FHIRClient';
import { v4 as uuid } from 'uuid';

export function normalizeCondition(
  fhirCondition: FHIRCondition,
  patientId: string
): Condition {
  const code = fhirCondition.code?.coding?.[0]?.code;
  const display =
    fhirCondition.code?.text ??
    fhirCondition.code?.coding?.[0]?.display ??
    undefined;

  const status = fhirCondition.clinicalStatus?.coding?.[0]?.code;

  return {
    id: uuid(),
    patientId,
    fhirId: fhirCondition.id!,
    code,
    display,
    onsetDate: fhirCondition.onsetDateTime ? new Date(fhirCondition.onsetDateTime) : undefined,
    status,
  };
}
