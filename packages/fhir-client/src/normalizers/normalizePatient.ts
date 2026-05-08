import { Patient } from '@ehr/shared';
import { FHIRPatient } from '../FHIRClient';
import { v4 as uuid } from 'uuid';

export function normalizePatient(fhirPatient: FHIRPatient, tenantId: string): Omit<Patient, 'createdAt' | 'updatedAt'> {
  const name =
    fhirPatient.name?.[0]?.text ??
    [fhirPatient.name?.[0]?.given?.join(' '), fhirPatient.name?.[0]?.family]
      .filter(Boolean)
      .join(' ') ??
    undefined;

  const mrn = fhirPatient.identifier?.find(
    (id) => id.system?.includes('MR') || id.system?.includes('mrn')
  )?.value;

  const phone = fhirPatient.telecom?.find((t) => t.system === 'phone')?.value;
  const email = fhirPatient.telecom?.find((t) => t.system === 'email')?.value;

  return {
    id: uuid(),
    fhirId: fhirPatient.id!,
    tenantId,
    mrn,
    demographics: {
      name,
      dob: fhirPatient.birthDate,
      gender: fhirPatient.gender,
      phone,
      email,
    },
  };
}
