/**
 * Skills and availability are saved together (PUT /v1/me/profile/details), but edited in two
 * sections: each sends the other's current values unchanged.
 */
import type { MyProfile } from "@/components/account-profile";

export function currentDetails(p: MyProfile["profile"]) {
  return {
    specialties: p.specialties,
    brands: p.brands,
    availableDays: p.availableDays,
    employmentTypes: p.employmentTypes,
    availableFrom: p.availableFrom ?? "",
    travelKm: p.travelKm ?? "",
    payMin: p.payMin ?? "",
    payPeriod: p.payPeriod,
  };
}
