import { Medication } from '@ehr/shared';
import { FHIRMedicationRequest } from '../FHIRClient';
import { v4 as uuid } from 'uuid';

export function normalizeMedication(
  fhirMed: FHIRMedicationRequest,
  patientId: string
): Medication {
  const name =
    fhirMed.medicationCodeableConcept?.text ??
    fhirMed.medicationCodeableConcept?.coding?.[0]?.display ??
    undefined;

  return {
    id: uuid(),
    patientId,
    fhirId: fhirMed.id!,
    name,
    dosage: fhirMed.dosageInstruction?.[0]?.text,
    status: fhirMed.status,
    data: fhirMed as unknown as Record<string, unknown>,
  };
}
