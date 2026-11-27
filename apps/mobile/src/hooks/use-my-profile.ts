import { useRequest } from '@/hooks/use-request';
import { api } from '@/lib/api';

/** Your full profile (GET /v1/me/profile), fresh each time the screen comes into view. */
export function useMyProfile() {
  return useRequest(api.profile, { refetchOnFocus: true });
}
