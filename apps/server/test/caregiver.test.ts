import { describe, expect, it, vi } from 'vitest';

import { notifyEmergencyCaregivers } from '../src/caregiver.js';

describe('caregiver notifications', () => {
  it('skips caregivers without emergency permission or webhook', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const results = await notifyEmergencyCaregivers(
      [
        {
          id: 'c1',
          name: '家人',
          relationship: 'family',
          permissions: ['receive-emergency'],
        },
        {
          id: 'c2',
          name: '朋友',
          relationship: 'friend',
          permissions: ['view-activity'],
        },
      ],
      {
        id: 'emg-1',
        timestamp: new Date().toISOString(),
        state: 'active',
        trigger: 'manual',
        details: 'SOS',
      },
      fetchImpl,
    );

    expect(results).toEqual([
      { caregiverId: 'c1', caregiverName: '家人', ok: true, skipped: true },
    ]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('posts active emergency events to configured webhooks', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 200 }));
    const results = await notifyEmergencyCaregivers(
      [
        {
          id: 'c1',
          name: '家人',
          relationship: 'family',
          permissions: ['receive-emergency'],
          notificationWebhook: 'https://example.test/hook',
        },
      ],
      {
        id: 'emg-1',
        timestamp: new Date().toISOString(),
        state: 'active',
        trigger: 'manual',
        details: 'SOS',
      },
      fetchImpl,
    );

    expect(results[0]).toMatchObject({ caregiverId: 'c1', ok: true });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
