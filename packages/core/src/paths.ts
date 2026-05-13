import os from 'node:os';
import path from 'node:path';

export interface AblePathPaths {
  configDir: string;
  configFile: string;
  dataDir: string;
  activityFile: string;
  emergencyFile: string;
  taskFile: string;
  agentFile: string;
}

export function resolveAblePathPaths(baseDir?: string): AblePathPaths {
  const root = baseDir ?? process.env.ABLEPATH_HOME ?? path.join(os.homedir(), '.config', 'ablepath');
  const dataDir = path.join(root, 'data');
  return {
    configDir: root,
    configFile: path.join(root, 'config.json'),
    dataDir,
    activityFile: path.join(dataDir, 'activity-log.json'),
    emergencyFile: path.join(dataDir, 'emergency-log.json'),
    taskFile: path.join(dataDir, 'task-sessions.json'),
    agentFile: path.join(dataDir, 'agent-sessions.json'),
  };
}
