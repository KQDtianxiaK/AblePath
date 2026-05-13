export type ViewKey =
  | 'dashboard'
  | 'chat'
  | 'control'
  | 'tasks'
  | 'screen'
  | 'activity'
  | 'emergency'
  | 'caregiver'
  | 'settings';

export function isCaregiverPublicPath(pathname: string): boolean {
  return pathname === '/caregiver' || pathname.startsWith('/caregiver/');
}

export function initialViewForPath(pathname: string): ViewKey {
  return isCaregiverPublicPath(pathname) ? 'caregiver' : 'dashboard';
}

export function shouldConnectOwnerEventStream(pathname: string): boolean {
  return !isCaregiverPublicPath(pathname);
}

export function buildEventWebSocketUrl(protocol: string, host: string): string {
  const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
  return `${wsProtocol}//${host}/ws/events`;
}
