import { execFile, execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import { promisify } from 'node:util';

import {
  ActionPlan,
  ControlAction,
  ControlActionResult,
  ControlExecuteResponse,
  ControlStatusResponse,
} from '@ablepath/shared';

const execFileAsync = promisify(execFile);

export function getControlStatus(): ControlStatusResponse {
  const opener = getOpenCommand();
  const xdotool = commandExists('xdotool');
  const windowsControl = hasWindowsControlBackend();
  const desktopControl = xdotool || windowsControl;

  return {
    canExecute: Boolean(opener || desktopControl),
    capabilities: {
      click: desktopControl,
      doubleClick: desktopControl,
      type: desktopControl,
      hotkey: desktopControl,
      scroll: desktopControl,
      openUrl: Boolean(opener),
      openApp: desktopControl,
      switchWindow: desktopControl,
      wait: true,
      finished: true,
      callUser: true,
    },
    missingCommands: [
      ...(opener ? [] : ['xdg-open/open/start']),
      ...(desktopControl ? [] : ['xdotool or powershell.exe']),
    ],
    setupHints: desktopControl
      ? []
      : [process.platform === 'win32' || os.release().toLowerCase().includes('microsoft')
          ? 'Windows desktop control requires PowerShell access to user32.dll and System.Windows.Forms.'
          : 'Linux desktop control requires xdotool for click, typing, hotkey, scroll, and window switching.'],
  };
}

export async function executeControlPlan(
  plan: ActionPlan,
  options: { confirmed?: boolean; dryRun?: boolean },
): Promise<ControlExecuteResponse> {
  const dryRun = options.dryRun ?? false;
  if (plan.requiresConfirmation && !options.confirmed) {
    throw new Error('Control plan requires confirmation before execution.');
  }

  if (plan.steps.length === 0) {
    return { planId: plan.id, executed: false, dryRun, results: [] };
  }

  const results: ControlActionResult[] = [];
  for (const step of plan.steps) {
    if (dryRun) {
      results.push({ actionId: step.id, ok: true, skipped: true });
      continue;
    }

    try {
      await executeAction(step);
      results.push({ actionId: step.id, ok: true });
    } catch (err) {
      results.push({
        actionId: step.id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
      break;
    }
  }

  return {
    planId: plan.id,
    executed: results.some((result) => result.ok && !result.skipped),
    dryRun,
    results,
  };
}

async function executeAction(action: ControlAction): Promise<void> {
  if (action.type === 'wait') {
    const durationMs = Math.max(100, Math.min(Math.round(Number(action.params.durationMs ?? 1000)), 10_000));
    await new Promise((resolve) => setTimeout(resolve, Number.isFinite(durationMs) ? durationMs : 1000));
    return;
  }

  if (action.type === 'finished' || action.type === 'callUser') {
    return;
  }

  if (action.type === 'openUrl') {
    const url = String(action.params.url ?? '');
    if (!url) throw new Error('Missing URL.');
    const opener = action.params.browser === 'chrome' ? getChromeOpenCommand() ?? getOpenCommand() : getOpenCommand();
    if (!opener) throw new Error('No URL opener found.');
    await launchDetached(opener.command, [...opener.args, url]);
    await delay(2500);
    return;
  }

  if (action.type === 'openApp') {
    const name = String(action.params.name ?? '');
    if (!name) throw new Error('Missing app name.');
    if (hasWindowsControlBackend()) {
      await runWindowsControlScript(buildWindowsOpenAppScript(name), 20_000);
      await delay(1500);
      return;
    }
    if (process.platform === 'darwin' && commandExists('open')) {
      await launchDetached('open', ['-a', name]);
      await delay(1500);
      return;
    }
    await launchDetached(name, []);
    await delay(1500);
    return;
  }

  if (action.type === 'type') {
    const text = String(action.params.text ?? '');
    if (!text) throw new Error('Missing text.');
    if (hasWindowsControlBackend()) {
      await runWindowsControlScript(buildWindowsTypeScript(text));
      return;
    }
    await runXdotool(['type', '--clearmodifiers', text]);
    return;
  }

  if (action.type === 'hotkey') {
    const keys = Array.isArray(action.params.keys) ? action.params.keys.map(String) : [];
    if (keys.length === 0) throw new Error('Missing hotkey keys.');
    if (hasWindowsControlBackend()) {
      await runWindowsControlScript(buildWindowsSendKeysScript(windowsSendKeysForHotkey(keys)));
      return;
    }
    await runXdotool(['key', keys.join('+')]);
    return;
  }

  if (action.type === 'click' || action.type === 'doubleClick') {
    const x = Number(action.params.x);
    const y = Number(action.params.y);
    if (hasWindowsControlBackend()) {
      await runWindowsControlScript(buildWindowsClickScript(
        Number.isFinite(x) ? Math.round(x) : undefined,
        Number.isFinite(y) ? Math.round(y) : undefined,
        action.type === 'doubleClick' ? 2 : 1,
      ));
      return;
    }
    if (Number.isFinite(x) && Number.isFinite(y)) {
      await runXdotool(action.type === 'doubleClick'
        ? ['mousemove', String(x), String(y), 'click', '--repeat', '2', '1']
        : ['mousemove', String(x), String(y), 'click', '1']);
    } else {
      await runXdotool(action.type === 'doubleClick' ? ['click', '--repeat', '2', '1'] : ['click', '1']);
    }
    return;
  }

  if (action.type === 'scroll') {
    const direction = action.params.direction === 'up' ? '4' : '5';
    const amount = Math.max(1, Math.min(Number(action.params.amount ?? 5), 20));
    if (hasWindowsControlBackend()) {
      await runWindowsControlScript(buildWindowsScrollScript(action.params.direction === 'up' ? 'up' : 'down', amount));
      return;
    }
    for (let i = 0; i < amount; i++) {
      await runXdotool(['click', direction]);
    }
    return;
  }

  if (action.type === 'switchWindow') {
    if (hasWindowsControlBackend()) {
      await runWindowsControlScript(buildWindowsSendKeysScript('%{TAB}'));
      return;
    }
    await runXdotool(['key', 'Alt+Tab']);
  }
}

async function runXdotool(args: string[]): Promise<void> {
  if (!commandExists('xdotool')) {
    throw new Error('xdotool is not installed.');
  }
  await execFileAsync('xdotool', args, { timeout: 10000 });
}

function getOpenCommand(): { command: string; args: string[] } | null {
  if (process.platform === 'darwin' && commandExists('open')) return { command: 'open', args: [] };
  if (process.platform === 'win32') return { command: 'cmd', args: ['/c', 'start', ''] };
  if (commandExists('xdg-open')) return { command: 'xdg-open', args: [] };
  if (os.release().toLowerCase().includes('microsoft') && commandExists('wslview')) {
    return { command: 'wslview', args: [] };
  }
  return null;
}

function getChromeOpenCommand(): { command: string; args: string[] } | null {
  if (process.platform === 'win32') {
    const candidates = [
      process.env.ProgramFiles ? `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe` : '',
      process.env['ProgramFiles(x86)'] ? `${process.env['ProgramFiles(x86)']}\\Google\\Chrome\\Application\\chrome.exe` : '',
      process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe` : '',
    ].filter(Boolean);
    const found = candidates.find((candidate) => fs.existsSync(candidate));
    if (found) return { command: found, args: [] };
    if (commandExists('chrome')) return { command: 'chrome', args: [] };
    if (commandExists('chrome.exe')) return { command: 'chrome.exe', args: [] };
    return null;
  }
  if (process.platform === 'darwin') return commandExists('open') ? { command: 'open', args: ['-a', 'Google Chrome'] } : null;
  for (const command of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    if (commandExists(command)) return { command, args: [] };
  }
  return null;
}

function hasWindowsControlBackend(): boolean {
  return commandExists('powershell.exe') || (process.platform === 'win32' && commandExists('powershell'));
}

function getPowerShellCommand(): string {
  if (commandExists('powershell.exe')) return 'powershell.exe';
  return 'powershell';
}

async function runWindowsControlScript(script: string, timeout = 10_000): Promise<void> {
  await execFileAsync(getPowerShellCommand(), ['-NoProfile', '-STA', '-Command', script], { timeout });
}

function launchDetached(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
    let settled = false;
    child.once('error', (err) => {
      settled = true;
      reject(err);
    });
    child.unref();
    setTimeout(() => {
      if (!settled) resolve();
    }, 250);
  });
}

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function buildWindowsClickScript(x?: number, y?: number, clicks = 1): string {
  const clickLines = [
    '[AblePathInput]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)',
    '[AblePathInput]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)',
  ];
  return [
    windowsUser32Prelude(),
    Number.isFinite(x) && Number.isFinite(y) ? `[AblePathInput]::SetCursorPos(${x}, ${y}) | Out-Null` : '',
    'Start-Sleep -Milliseconds 80',
    ...Array.from({ length: Math.max(1, Math.min(clicks, 2)) }, () => clickLines).flatMap((lines, index) => [
      lines[0],
      'Start-Sleep -Milliseconds 50',
      lines[1],
      index === 0 && clicks > 1 ? 'Start-Sleep -Milliseconds 80' : '',
    ]),
  ].filter(Boolean).join('\n');
}

function buildWindowsScrollScript(direction: 'up' | 'down', amount: number): string {
  const delta = (direction === 'up' ? 120 : -120) * Math.max(1, Math.min(Math.round(amount), 20));
  return [
    windowsUser32Prelude(),
    `[AblePathInput]::mouse_event(0x0800, 0, 0, ${delta}, [UIntPtr]::Zero)`,
  ].join('\n');
}

function buildWindowsTypeScript(text: string): string {
  return [
    'Add-Type -AssemblyName System.Windows.Forms',
    `[System.Windows.Forms.Clipboard]::SetText(${powerShellString(text)})`,
    '[System.Windows.Forms.SendKeys]::SendWait("^v")',
  ].join('; ');
}

function buildWindowsSendKeysScript(sendKeys: string): string {
  return [
    'Add-Type -AssemblyName System.Windows.Forms',
    `[System.Windows.Forms.SendKeys]::SendWait(${powerShellString(sendKeys)})`,
  ].join('; ');
}

function buildWindowsOpenAppScript(name: string): string {
  const appName = powerShellString(name);
  return [
    `$name = ${appName}`,
    'if ($name -match "(?i)^(Recycle Bin|\\u56de\\u6536\\u7ad9)$") { Start-Process "shell:RecycleBinFolder"; exit 0 }',
    '$errors = New-Object System.Collections.Generic.List[string]',
    'try { Start-Process $name; exit 0 } catch { $errors.Add($_.Exception.Message) }',
    '$folders = @(',
    '  [Environment]::GetFolderPath("Programs"),',
    '  [Environment]::GetFolderPath("CommonPrograms"),',
    '  "$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs",',
    '  "$env:ProgramData\\Microsoft\\Windows\\Start Menu\\Programs"',
    ') | Where-Object { $_ -and (Test-Path $_) }',
    '$shortcut = Get-ChildItem -Path $folders -Recurse -Include *.lnk -ErrorAction SilentlyContinue | Where-Object { $_.BaseName -like "*$name*" } | Select-Object -First 1',
    'if ($shortcut) { Start-Process $shortcut.FullName; exit 0 }',
    'throw "Application not found or not launchable: " + $name + ". " + ($errors -join " ")',
  ].join('; ');
}

function windowsUser32Prelude(): string {
  return [
    'Add-Type -TypeDefinition @\'',
    'using System;',
    'using System.Runtime.InteropServices;',
    'public class AblePathInput {',
    '  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);',
    '  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, int data, UIntPtr extra);',
    '}',
    '\'@',
  ].join('\n');
}

export function windowsSendKeysForHotkey(keys: string[]): string {
  const normalized = keys.map((key) => key.trim().toLowerCase()).filter(Boolean);
  const modifiers = normalized.filter((key) => ['ctrl', 'control', 'alt', 'shift'].includes(key));
  const normalKeys = normalized.filter((key) => !['ctrl', 'control', 'alt', 'shift'].includes(key));
  const prefix = modifiers.map((key) => {
    if (key === 'ctrl' || key === 'control') return '^';
    if (key === 'alt') return '%';
    return '+';
  }).join('');
  return `${prefix}${sendKeysToken(normalKeys[0] ?? '')}`;
}

function sendKeysToken(key: string): string {
  const map: Record<string, string> = {
    enter: '{ENTER}',
    return: '{ENTER}',
    escape: '{ESC}',
    esc: '{ESC}',
    tab: '{TAB}',
    space: ' ',
    arrowleft: '{LEFT}',
    left: '{LEFT}',
    arrowright: '{RIGHT}',
    right: '{RIGHT}',
    arrowup: '{UP}',
    up: '{UP}',
    arrowdown: '{DOWN}',
    down: '{DOWN}',
    backspace: '{BACKSPACE}',
    delete: '{DELETE}',
  };
  if (map[key]) return map[key];
  if (/^f([1-9]|1[0-2])$/.test(key)) return `{${key.toUpperCase()}}`;
  if (key.length === 1) return key;
  return `{${key.toUpperCase()}}`;
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
