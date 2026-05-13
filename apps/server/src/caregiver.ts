import {
  CaregiverNotificationResult,
  CaregiverProfile,
  EmergencyEvent,
} from '@ablepath/shared';

export async function notifyEmergencyCaregivers(
  caregivers: CaregiverProfile[],
  event: EmergencyEvent,
  fetchImpl: typeof fetch = fetch,
): Promise<CaregiverNotificationResult[]> {
  const recipients = caregivers.filter((caregiver) => caregiver.permissions.includes('receive-emergency'));
  if (recipients.length === 0) return [];

  const results: CaregiverNotificationResult[] = [];
  for (const caregiver of recipients) {
    if (!caregiver.notificationWebhook) {
      results.push({
        caregiverId: caregiver.id,
        caregiverName: caregiver.name,
        ok: true,
        skipped: true,
      });
      continue;
    }

    try {
      const response = await fetchImpl(caregiver.notificationWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product: 'AblePath',
          type: 'emergency',
          caregiverId: caregiver.id,
          event,
        }),
      });
      results.push({
        caregiverId: caregiver.id,
        caregiverName: caregiver.name,
        ok: response.ok,
        error: response.ok ? undefined : `HTTP ${response.status}`,
      });
    } catch (err) {
      results.push({
        caregiverId: caregiver.id,
        caregiverName: caregiver.name,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return results;
}
