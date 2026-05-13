import { execFileSync, spawn } from 'node:child_process';

import { TTSResponse } from '@ablepath/shared';

let currentProcess: ReturnType<typeof spawn> | null = null;

export async function speakText(
  text: string,
  priority: 'low' | 'normal' | 'high' | 'critical',
): Promise<TTSResponse> {
  if (!text.trim()) {
    return { ok: true, engine: 'none', spoken: false };
  }

  if (priority === 'critical' && currentProcess) {
    currentProcess.kill('SIGTERM');
    currentProcess = null;
  }

  const engine = detectTTSEngine();
  if (!engine) {
    return { ok: true, engine: 'none', spoken: false };
  }

  await runTTS(engine, text);
  return { ok: true, engine, spoken: true };
}

export function getTTSStatus(): {
  engine: TTSEngine | null;
  canSpeak: boolean;
  missingCommands: string[];
} {
  const engine = detectTTSEngine();
  return {
    engine,
    canSpeak: engine !== null,
    missingCommands: engine ? [] : process.platform === 'darwin' ? ['say'] : ['espeak-ng', 'espeak', 'powershell.exe'],
  };
}

type TTSEngine = 'say' | 'espeak-ng' | 'espeak' | 'powershell';

function detectTTSEngine(): TTSEngine | null {
  if (process.platform === 'darwin' && commandExists('say')) return 'say';
  if (commandExists('espeak-ng')) return 'espeak-ng';
  if (commandExists('espeak')) return 'espeak';
  if (commandExists('powershell.exe')) return 'powershell';
  if (commandExists('powershell')) return 'powershell';
  return null;
}

function commandExists(command: string): boolean {
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', [command], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function runTTS(engine: TTSEngine, text: string): Promise<void> {
  const command = engine === 'powershell' ? getPowerShellCommand() : engine;
  const args = buildTTSArgs(engine, text);
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: 'ignore' });
    currentProcess = proc;
    proc.on('error', reject);
    proc.on('close', (code) => {
      currentProcess = null;
      if (code === 0) resolve();
      else reject(new Error(`TTS engine exited with code ${code}`));
    });
  });
}

function getPowerShellCommand(): string {
  if (commandExists('powershell.exe')) return 'powershell.exe';
  return 'powershell';
}

function buildTTSArgs(engine: TTSEngine, text: string): string[] {
  if (engine === 'say') return [text];
  if (engine === 'powershell') {
    return [
      '-NoProfile',
      '-Command',
      [
        'Add-Type -AssemblyName System.Speech',
        '$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer',
        `$speaker.Speak(${powerShellString(text)})`,
      ].join('; '),
    ];
  }
  return ['-v', 'zh', text];
}

function powerShellString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
