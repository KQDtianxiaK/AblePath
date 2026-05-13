import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import {
  ScreenCaptureRequest,
  ScreenCaptureResponse,
  ScreenRegion,
  ScreenStatusResponse,
} from '@ablepath/shared';

const execFileAsync = promisify(execFile);

type ScreenBackend = 'screencapture' | 'grim' | 'scrot' | 'gnome-screenshot' | 'import' | 'powershell';

export function getScreenStatus(): ScreenStatusResponse {
  const backend = detectScreenBackend();
  return {
    canCapture: backend !== null,
    backend,
    missingCommands: backend ? [] : platformScreenshotCommands(),
    setupHints: backend
      ? []
      : [
          screenshotSetupHint(),
        ],
  };
}

export async function captureScreen(
  options: ScreenCaptureRequest = {},
  homeDir?: string,
): Promise<ScreenCaptureResponse> {
  const backend = detectScreenBackend();
  if (!backend) {
    throw new Error('No screen capture backend found. Install grim, scrot, gnome-screenshot, or ImageMagick import.');
  }

  const captureDir = path.join(
    homeDir ?? process.env.ABLEPATH_HOME ?? path.join(os.homedir(), '.config', 'ablepath'),
    'data',
    'screenshots',
  );
  fs.mkdirSync(captureDir, { recursive: true });

  const mimeType = backend === 'screencapture' || backend === 'grim' || backend === 'gnome-screenshot'
    ? 'image/png'
    : 'image/png';
  const outFile = path.join(captureDir, `screen-${Date.now()}.png`);
  await runCaptureBackend(backend, outFile, normalizeRegion(options.region));

  const stat = fs.statSync(outFile);
  if (stat.size === 0) throw new Error('Screen capture file is empty.');
  const dimensions = readPngDimensions(outFile);

  return {
    path: outFile,
    mimeType,
    sizeBytes: stat.size,
    ...dimensions,
    capturedAt: new Date().toISOString(),
    backend,
    imageBase64: options.includeImageBase64 ? fs.readFileSync(outFile).toString('base64') : undefined,
  };
}

function readPngDimensions(filePath: string): { width?: number; height?: number } {
  try {
    const header = fs.readFileSync(filePath).subarray(0, 24);
    if (
      header.length >= 24 &&
      header[0] === 0x89 &&
      header[1] === 0x50 &&
      header[2] === 0x4e &&
      header[3] === 0x47
    ) {
      return {
        width: header.readUInt32BE(16),
        height: header.readUInt32BE(20),
      };
    }
  } catch {
    // Dimension metadata is a best-effort aid for coordinate planning.
  }
  return {};
}

export function cleanupOldScreenshots(homeDir?: string, retentionMs = 24 * 60 * 60 * 1000): number {
  const captureDir = path.join(
    homeDir ?? process.env.ABLEPATH_HOME ?? path.join(os.homedir(), '.config', 'ablepath'),
    'data',
    'screenshots',
  );
  if (!fs.existsSync(captureDir)) return 0;

  let removed = 0;
  const now = Date.now();
  for (const file of fs.readdirSync(captureDir)) {
    const filepath = path.join(captureDir, file);
    try {
      const stat = fs.statSync(filepath);
      if (stat.isFile() && now - stat.mtimeMs > retentionMs) {
        fs.unlinkSync(filepath);
        removed += 1;
      }
    } catch {
      // Ignore cleanup errors.
    }
  }
  return removed;
}

function detectScreenBackend(): ScreenBackend | null {
  if (process.platform === 'darwin' && commandExists('screencapture')) return 'screencapture';
  if (process.platform === 'win32' && (commandExists('powershell.exe') || commandExists('powershell'))) return 'powershell';
  if (process.platform === 'linux') {
    for (const command of ['grim', 'scrot', 'gnome-screenshot', 'import'] as const) {
      if (commandExists(command)) return command;
    }
    if (commandExists('powershell.exe') && commandExists('wslpath')) return 'powershell';
  }
  return null;
}

async function runCaptureBackend(
  backend: ScreenBackend,
  outFile: string,
  region?: ScreenRegion,
): Promise<void> {
  if (backend === 'screencapture') {
    await execFileAsync('screencapture', [...(region ? [`-R${region.x},${region.y},${region.width},${region.height}`] : []), '-x', outFile], {
      timeout: 5000,
    });
    return;
  }

  if (backend === 'grim') {
    await execFileAsync('grim', [...(region ? ['-g', `${region.x},${region.y} ${region.width}x${region.height}`] : []), outFile], {
      timeout: 5000,
    });
    return;
  }

  if (backend === 'scrot') {
    await execFileAsync('scrot', [...(region ? ['-a', `${region.x},${region.y},${region.width},${region.height}`] : []), outFile], {
      timeout: 5000,
    });
    return;
  }

  if (backend === 'gnome-screenshot') {
    await execFileAsync('gnome-screenshot', ['-f', outFile], { timeout: 5000 });
    return;
  }

  if (backend === 'powershell') {
    await captureWithPowerShell(outFile, region);
    return;
  }

  await execFileAsync('import', ['-window', 'root', outFile], { timeout: 10000 });
}

async function captureWithPowerShell(outFile: string, region?: ScreenRegion): Promise<void> {
  const windowsPath = process.platform === 'win32'
    ? path.resolve(outFile)
    : execFileSync('wslpath', ['-w', outFile], { encoding: 'utf-8' }).trim();
  const boundsExpression = region
    ? `New-Object System.Drawing.Rectangle ${region.x}, ${region.y}, ${region.width}, ${region.height}`
    : '[System.Windows.Forms.Screen]::PrimaryScreen.Bounds';
  const script = [
    `$path = ${powerShellString(windowsPath)}`,
    'Add-Type -AssemblyName System.Windows.Forms',
    'Add-Type -AssemblyName System.Drawing',
    `$bounds = ${boundsExpression}`,
    '$bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height',
    '$graphics = [System.Drawing.Graphics]::FromImage($bitmap)',
    '$graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)',
    '$bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)',
    '$graphics.Dispose()',
    '$bitmap.Dispose()',
  ].join('; ');
  await execFileAsync(getPowerShellCommand(), ['-NoProfile', '-STA', '-Command', script], { timeout: 10000 });
}

function getPowerShellCommand(): string {
  if (commandExists('powershell.exe')) return 'powershell.exe';
  return 'powershell';
}

function normalizeRegion(region?: ScreenRegion): ScreenRegion | undefined {
  if (!region) return undefined;
  const values = [region.x, region.y, region.width, region.height];
  if (!values.every((value) => Number.isFinite(value))) return undefined;
  if (region.width <= 0 || region.height <= 0) return undefined;
  return {
    x: Math.max(0, Math.round(region.x)),
    y: Math.max(0, Math.round(region.y)),
    width: Math.round(region.width),
    height: Math.round(region.height),
  };
}

function platformScreenshotCommands(): string[] {
  if (process.platform === 'darwin') return ['screencapture'];
  if (process.platform === 'win32') return ['powershell.exe', 'powershell'];
  if (process.platform === 'linux') return ['grim', 'scrot', 'gnome-screenshot', 'import', 'powershell.exe'];
  return [];
}

function screenshotSetupHint(): string {
  if (process.platform === 'darwin') return 'macOS screen capture uses the built-in screencapture command.';
  if (process.platform === 'win32') {
    return 'Windows screen capture requires Windows PowerShell with System.Windows.Forms and System.Drawing.';
  }
  return 'Linux/WSL screen capture requires a desktop session plus grim, scrot, gnome-screenshot, ImageMagick import, or Windows PowerShell from WSL.';
}

function powerShellString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function commandExists(command: string): boolean {
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', [command], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
