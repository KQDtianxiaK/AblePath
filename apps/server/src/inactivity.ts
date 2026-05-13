import {
  ActivityStore,
  ConfigStore,
  EmergencyStore,
} from '@ablepath/core';
import {
  AblePathConfig,
  EmergencyEvent,
  InactivityCheckResponse,
  InactivityStatusResponse,
} from '@ablepath/shared';

export function getInactivityStatus(
  activityStore: ActivityStore,
  emergencyStore: EmergencyStore,
  config: AblePathConfig,
  fallbackStartTimeMs: number,
  now = new Date(),
): InactivityStatusResponse {
  const lastActivityTime = activityStore.lastActivityTime();
  const lastTimeMs = lastActivityTime ? Date.parse(lastActivityTime) : fallbackStartTimeMs;
  const inactiveMs = Math.max(0, now.getTime() - lastTimeMs);
  const currentEmergency = emergencyStore.current(now);
  const enabled = config.safety.inactivityTimeoutMs > 0;
  return {
    enabled,
    timeoutMs: config.safety.inactivityTimeoutMs,
    lastActivityTime,
    inactiveMs,
    wouldTrigger:
      enabled &&
      inactiveMs >= config.safety.inactivityTimeoutMs &&
      (currentEmergency.state === 'normal' || currentEmergency.state === 'resolved'),
    emergencyState: currentEmergency.state,
  };
}

export function checkInactivity(
  activityStore: ActivityStore,
  emergencyStore: EmergencyStore,
  config: AblePathConfig,
  fallbackStartTimeMs: number,
  now = new Date(),
): InactivityCheckResponse {
  const status = getInactivityStatus(activityStore, emergencyStore, config, fallbackStartTimeMs, now);
  if (!status.wouldTrigger) return { ...status, triggered: false };

  const event = emergencyStore.trigger(
    {
      trigger: 'inactivity',
      details: `No activity detected for ${Math.round(status.inactiveMs / 1000)} seconds.`,
      confirmationTimeoutSec: config.safety.emergencyConfirmationTimeoutSec,
    },
    now,
  );
  return {
    ...getInactivityStatus(activityStore, emergencyStore, config, fallbackStartTimeMs, now),
    triggered: true,
    event,
  };
}

export async function runInactivityCheck(
  configStore: ConfigStore,
  activityStore: ActivityStore,
  emergencyStore: EmergencyStore,
  onTriggered: (event: EmergencyEvent) => Promise<void> | void,
  fallbackStartTimeMs: number,
): Promise<InactivityCheckResponse> {
  const response = checkInactivity(
    activityStore,
    emergencyStore,
    configStore.ensure(),
    fallbackStartTimeMs,
  );
  if (response.event) await onTriggered(response.event);
  return response;
}
