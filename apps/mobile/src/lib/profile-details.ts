import type { DetailsInput, SeekerProfile } from '@/lib/api';

/**
 * Skills, availability and pay are saved together (PUT /v1/me/profile/details) but edited on two
 * screens: each sends the other's current values unchanged.
 */
export function currentDetails(p: SeekerProfile): DetailsInput {
  return {
    specialties: p.specialties,
    brands: p.brands,
    availableDays: p.availableDays as DetailsInput['availableDays'],
    employmentTypes: p.employmentTypes,
    availableFrom: p.availableFrom ?? '',
    travelKm: p.travelKm,
    payMin: p.payMin,
    payPeriod: p.payPeriod,
  };
}

/** "Balayage, Foils ,," → ["Balayage", "Foils"] */
export function splitList(text: string): string[] {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
