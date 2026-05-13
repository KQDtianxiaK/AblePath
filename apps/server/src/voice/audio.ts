import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { AudioDevice, ListenResponse } from '@ablepath/shared';

import { transcribeWithVolcASR } from './volc-asr.js';

export type AudioBackend = 'parecord' | 'arecord' | 'sox' | 'powershell';

export interface RecordAudioOptions {
  durationSec: number;
  deviceId?: string;
}

export function getAudioStatus(): {
  backend: AudioBackend | null;
  canRecord: boolean;
  missingRecordCommands: string[];
} {
  const backend = detectAudioBackend();
  return {
    backend,
    canRecord: backend !== null,
    missingRecordCommands: backend ? [] : platformRecordCommands(),
  };
}

export function listAudioDevices(): AudioDevice[] {
  const backend = detectAudioBackend();
  if (!backend) return [];
  const devices: AudioDevice[] = [
    {
      id: 'default',
      label: `Default microphone (${backend})`,
      backend,
      isDefault: true,
    },
  ];

  try {
    if (backend === 'parecord') {
      const output = execFileSync('pactl', ['list', 'sources'], { encoding: 'utf-8', timeout: 5000 });
      for (const block of output.split(/^Source #/m).slice(1)) {
        const name = block.match(/^\s*Name:\s*(.+)$/m)?.[1]?.trim();
        const label = block.match(/^\s*Description:\s*(.+)$/m)?.[1]?.trim();
        if (name) {
          devices.push({ id: name, label: label ?? name, backend, isDefault: false });
        }
      }
    }

    if (backend === 'arecord') {
      const output = execFileSync('arecord', ['-l'], { encoding: 'utf-8', timeout: 5000 });
      for (const line of output.split('\n')) {
        const match = line.match(/^card (\d+):.*\[(.+?)\].*device (\d+):.*\[(.+?)\]/);
        if (match) {
          devices.push({
            id: `hw:${match[1]},${match[3]}`,
            label: `${match[2]} - ${match[4]}`,
            backend,
            isDefault: false,
          });
        }
      }
    }
  } catch {
    // Keep the default device fallback.
  }

  return devices;
}

export function recordAudio(options: RecordAudioOptions): Promise<string> {
  const backend = detectAudioBackend();
  if (!backend) {
    return Promise.reject(new Error(noAudioBackendMessage()));
  }

  const audioDir = path.join(process.env.ABLEPATH_HOME ?? path.join(os.homedir(), '.config', 'ablepath'), 'data', 'audio');
  fs.mkdirSync(audioDir, { recursive: true });
  const outFile = path.join(audioDir, `recording-${Date.now()}.wav`);

  const args = buildRecordArgs(backend, outFile, options);
  return new Promise((resolve, reject) => {
    const proc = spawn(args.command, args.args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Recording failed (${code}): ${stderr.trim()}`));
        return;
      }
      if (!fs.existsSync(outFile) || fs.statSync(outFile).size <= 44) {
        reject(new Error('Recording file is empty. Check microphone permissions and device selection.'));
        return;
      }
      resolve(outFile);
    });
  });
}

export async function transcribeAudio(
  audioPath: string,
  env: Record<string, string | undefined>,
): Promise<Omit<ListenResponse, 'audioPath' | 'durationSec'>> {
  if (env.VOLC_ASR_APP_KEY && env.VOLC_ASR_ACCESS_KEY) {
    const result = await transcribeWithVolcASR(audioPath, {
      appKey: env.VOLC_ASR_APP_KEY,
      accessKey: env.VOLC_ASR_ACCESS_KEY,
      resourceId: env.VOLC_ASR_RESOURCE_ID,
      language: env.STT_LANGUAGE ?? 'zh-CN',
    });
    return { text: result.text, provider: 'volc-asr' };
  }

  throw new Error('STT is not configured. Set VOLC_ASR_APP_KEY and VOLC_ASR_ACCESS_KEY.');
}

export function createRawMicProcess(options: { deviceId?: string } = {}): ReturnType<typeof spawn> {
  const backend = detectAudioBackend();
  if (!backend) {
    throw new Error(noAudioBackendMessage());
  }

  const device = options.deviceId && options.deviceId !== 'default' ? options.deviceId : undefined;
  if (backend === 'parecord') {
    return spawn(
      'parecord',
      ['--format=s16le', '--rate=16000', '--channels=1', '--raw', ...(device ? [`--device=${device}`] : [])],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
  }

  if (backend === 'arecord') {
    return spawn(
      'arecord',
      ['-f', 'S16_LE', '-r', '16000', '-c', '1', '-t', 'raw', ...(device ? ['-D', device] : [])],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
  }

  if (backend === 'powershell') {
    return spawn(getPowerShellCommand(), buildPowerShellArgs(buildWindowsRawMicScript()), {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }

  return spawn(
    'sox',
    ['-d', '-t', 'raw', '-r', '16000', '-c', '1', '-b', '16', '-e', 'signed-integer', '-'],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
}

export function createRawSpeakerProcess(): ReturnType<typeof spawn> | null {
  if (commandExists('paplay')) {
    return spawn('paplay', ['--format=s16le', '--rate=24000', '--channels=1', '--raw'], {
      stdio: ['pipe', 'ignore', 'pipe'],
    });
  }

  if (commandExists('aplay')) {
    return spawn('aplay', ['-f', 'S16_LE', '-r', '24000', '-c', '1', '-t', 'raw'], {
      stdio: ['pipe', 'ignore', 'pipe'],
    });
  }

  if (hasPowerShellAudioBackend()) {
    return spawn(getPowerShellCommand(), buildPowerShellArgs(buildWindowsRawSpeakerScript()), {
      stdio: ['pipe', 'ignore', 'pipe'],
    });
  }

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

function buildRecordArgs(
  backend: AudioBackend,
  outFile: string,
  options: RecordAudioOptions,
): { command: string; args: string[] } {
  const device = options.deviceId && options.deviceId !== 'default' ? options.deviceId : undefined;
  if (backend === 'parecord') {
    return {
      command: 'parecord',
      args: [
        '--format=s16le',
        '--rate=16000',
        '--channels=1',
        '--file-format=wav',
        ...(device ? [`--device=${device}`] : []),
        outFile,
      ],
    };
  }

  if (backend === 'arecord') {
    return {
      command: 'arecord',
      args: [
        '-d',
        String(options.durationSec),
        '-f',
        'S16_LE',
        '-r',
        '16000',
        '-c',
        '1',
        '-t',
        'wav',
        ...(device ? ['-D', device] : []),
        outFile,
      ],
    };
  }

  if (backend === 'powershell') {
    return {
      command: getPowerShellCommand(),
      args: buildPowerShellArgs(buildWindowsRecordAudioScript(toWindowsAudioPath(outFile), options.durationSec)),
    };
  }

  return {
    command: 'sox',
    args: ['-d', '-r', '16000', '-c', '1', '-b', '16', outFile, 'trim', '0', String(options.durationSec)],
  };
}

function detectAudioBackend(): AudioBackend | null {
  for (const command of ['parecord', 'arecord', 'sox'] as const) {
    if (commandExists(command)) {
      return command === 'sox' ? 'sox' : command;
    }
  }

  if (hasPowerShellAudioBackend()) {
    return 'powershell';
  }

  return null;
}

function hasPowerShellAudioBackend(): boolean {
  if (process.platform === 'win32') {
    return commandExists('powershell.exe') || commandExists('powershell');
  }

  return isWsl() && commandExists('powershell.exe');
}

function isWsl(): boolean {
  return process.platform === 'linux' && os.release().toLowerCase().includes('microsoft');
}

function platformRecordCommands(): string[] {
  if (process.platform === 'win32') return ['powershell.exe', 'powershell'];
  if (isWsl()) return ['parecord', 'arecord', 'sox', 'powershell.exe'];
  return ['parecord', 'arecord', 'sox'];
}

function noAudioBackendMessage(): string {
  if (process.platform === 'win32') {
    return 'No audio recording backend found. Windows recording requires PowerShell and microphone access.';
  }
  if (isWsl()) {
    return 'No audio recording backend found. Install pulseaudio-utils, alsa-utils, or sox, or enable Windows PowerShell interop from WSL.';
  }
  return 'No audio recording backend found. Install pulseaudio-utils, alsa-utils, or sox.';
}

function getPowerShellCommand(): string {
  if (commandExists('powershell.exe')) return 'powershell.exe';
  return 'powershell';
}

function buildPowerShellArgs(script: string): string[] {
  return [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-EncodedCommand',
    Buffer.from(script, 'utf16le').toString('base64'),
  ];
}

function toWindowsAudioPath(filePath: string): string {
  if (process.platform === 'win32') return filePath;
  if (isWsl() && commandExists('wslpath')) {
    try {
      return execFileSync('wslpath', ['-w', filePath], { encoding: 'utf-8' }).trim();
    } catch {
      return filePath;
    }
  }
  return filePath;
}

export function buildWindowsRecordAudioScript(outFile: string, durationSec: number): string {
  const durationMs = Math.max(1, Math.round(durationSec * 1000));
  return [
    '$ErrorActionPreference = "Stop"',
    '$ProgressPreference = "SilentlyContinue"',
    buildWindowsAudioTypeDefinition(),
    `[AblePathAudio.NativeRecorder]::RecordWav(${powerShellString(outFile)}, ${durationMs})`,
  ].join('\n');
}

export function buildWindowsRawMicScript(): string {
  return [
    '$ErrorActionPreference = "Stop"',
    '$ProgressPreference = "SilentlyContinue"',
    buildWindowsAudioTypeDefinition(),
    '[AblePathAudio.NativeRecorder]::StreamRaw()',
  ].join('\n');
}

export function buildWindowsRawSpeakerScript(): string {
  return [
    '$ErrorActionPreference = "Stop"',
    '$ProgressPreference = "SilentlyContinue"',
    buildWindowsAudioTypeDefinition(),
    '[AblePathAudio.NativeSpeaker]::PlayRaw()',
  ].join('\n');
}

function buildWindowsAudioTypeDefinition(): string {
  return String.raw`Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

namespace AblePathAudio {
  public static class NativeRecorder {
    private const int CALLBACK_NULL = 0;
    private const int WHDR_DONE = 0x00000001;
    private const int WHDR_PREPARED = 0x00000002;
    private const int BUFFER_MS = 100;
    private const int BUFFER_COUNT = 4;
    private const int SAMPLE_RATE = 16000;
    private const short CHANNELS = 1;
    private const short BITS_PER_SAMPLE = 16;
    private const uint WAVE_MAPPER = 0xFFFFFFFF;

    [StructLayout(LayoutKind.Sequential)]
    private struct WaveFormatEx {
      public ushort wFormatTag;
      public ushort nChannels;
      public uint nSamplesPerSec;
      public uint nAvgBytesPerSec;
      public ushort nBlockAlign;
      public ushort wBitsPerSample;
      public ushort cbSize;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct WaveHeader {
      public IntPtr lpData;
      public int dwBufferLength;
      public int dwBytesRecorded;
      public IntPtr dwUser;
      public int dwFlags;
      public int dwLoops;
      public IntPtr lpNext;
      public IntPtr reserved;
    }

    [DllImport("winmm.dll")]
    private static extern int waveInOpen(out IntPtr hWaveIn, uint uDeviceID, ref WaveFormatEx lpFormat, IntPtr dwCallback, IntPtr dwInstance, int dwFlags);

    [DllImport("winmm.dll")]
    private static extern int waveInPrepareHeader(IntPtr hWaveIn, IntPtr lpWaveInHdr, int uSize);

    [DllImport("winmm.dll")]
    private static extern int waveInUnprepareHeader(IntPtr hWaveIn, IntPtr lpWaveInHdr, int uSize);

    [DllImport("winmm.dll")]
    private static extern int waveInAddBuffer(IntPtr hWaveIn, IntPtr lpWaveInHdr, int uSize);

    [DllImport("winmm.dll")]
    private static extern int waveInStart(IntPtr hWaveIn);

    [DllImport("winmm.dll")]
    private static extern int waveInStop(IntPtr hWaveIn);

    [DllImport("winmm.dll")]
    private static extern int waveInReset(IntPtr hWaveIn);

    [DllImport("winmm.dll")]
    private static extern int waveInClose(IntPtr hWaveIn);

    public static void RecordWav(string outputPath, int durationMs) {
      using (var audio = new MemoryStream()) {
        Capture(durationMs, delegate(byte[] chunk) {
          audio.Write(chunk, 0, chunk.Length);
        });

        string directory = Path.GetDirectoryName(outputPath);
        if (!String.IsNullOrEmpty(directory)) {
          Directory.CreateDirectory(directory);
        }
        WriteWav(outputPath, audio.ToArray());
      }
    }

    public static void StreamRaw() {
      Stream stdout = Console.OpenStandardOutput();
      Capture(-1, delegate(byte[] chunk) {
        stdout.Write(chunk, 0, chunk.Length);
        stdout.Flush();
      });
    }

    private static void Capture(int durationMs, Action<byte[]> onChunk) {
      WaveFormatEx format = CreateFormat();
      IntPtr device;
      Check(waveInOpen(out device, WAVE_MAPPER, ref format, IntPtr.Zero, IntPtr.Zero, CALLBACK_NULL), "waveInOpen");

      int headerSize = Marshal.SizeOf(typeof(WaveHeader));
      int bufferSize = (int)(format.nAvgBytesPerSec * BUFFER_MS / 1000);
      byte[][] buffers = new byte[BUFFER_COUNT][];
      GCHandle[] bufferPins = new GCHandle[BUFFER_COUNT];
      IntPtr[] headerPtrs = new IntPtr[BUFFER_COUNT];

      try {
        for (int i = 0; i < BUFFER_COUNT; i++) {
          buffers[i] = new byte[bufferSize];
          bufferPins[i] = GCHandle.Alloc(buffers[i], GCHandleType.Pinned);
          WaveHeader header = new WaveHeader();
          header.lpData = bufferPins[i].AddrOfPinnedObject();
          header.dwBufferLength = bufferSize;
          headerPtrs[i] = Marshal.AllocHGlobal(headerSize);
          Marshal.StructureToPtr(header, headerPtrs[i], false);
          Check(waveInPrepareHeader(device, headerPtrs[i], headerSize), "waveInPrepareHeader");
          Check(waveInAddBuffer(device, headerPtrs[i], headerSize), "waveInAddBuffer");
        }

        Check(waveInStart(device), "waveInStart");
        DateTime endAt = durationMs > 0 ? DateTime.UtcNow.AddMilliseconds(durationMs) : DateTime.MaxValue;

        while (DateTime.UtcNow < endAt) {
          bool wrote = false;
          for (int i = 0; i < BUFFER_COUNT; i++) {
            WaveHeader header = (WaveHeader)Marshal.PtrToStructure(headerPtrs[i], typeof(WaveHeader));
            if ((header.dwFlags & WHDR_DONE) == 0) continue;

            if (header.dwBytesRecorded > 0) {
              byte[] chunk = new byte[header.dwBytesRecorded];
              Buffer.BlockCopy(buffers[i], 0, chunk, 0, chunk.Length);
              onChunk(chunk);
            }

            header.dwFlags = header.dwFlags & WHDR_PREPARED;
            header.dwBytesRecorded = 0;
            Marshal.StructureToPtr(header, headerPtrs[i], false);
            Check(waveInAddBuffer(device, headerPtrs[i], headerSize), "waveInAddBuffer");
            wrote = true;
          }

          if (!wrote) Thread.Sleep(10);
        }
      } finally {
        waveInStop(device);
        waveInReset(device);
        for (int i = 0; i < BUFFER_COUNT; i++) {
          if (headerPtrs[i] != IntPtr.Zero) {
            waveInUnprepareHeader(device, headerPtrs[i], headerSize);
            Marshal.FreeHGlobal(headerPtrs[i]);
          }
          if (bufferPins[i].IsAllocated) {
            bufferPins[i].Free();
          }
        }
        waveInClose(device);
      }
    }

    private static WaveFormatEx CreateFormat() {
      WaveFormatEx format = new WaveFormatEx();
      format.wFormatTag = 1;
      format.nChannels = (ushort)CHANNELS;
      format.nSamplesPerSec = SAMPLE_RATE;
      format.wBitsPerSample = (ushort)BITS_PER_SAMPLE;
      format.nBlockAlign = (ushort)(CHANNELS * BITS_PER_SAMPLE / 8);
      format.nAvgBytesPerSec = (uint)(SAMPLE_RATE * format.nBlockAlign);
      format.cbSize = 0;
      return format;
    }

    private static void WriteWav(string outputPath, byte[] pcm) {
      using (var stream = File.Create(outputPath))
      using (var writer = new BinaryWriter(stream)) {
        writer.Write(new char[] { 'R', 'I', 'F', 'F' });
        writer.Write(36 + pcm.Length);
        writer.Write(new char[] { 'W', 'A', 'V', 'E' });
        writer.Write(new char[] { 'f', 'm', 't', ' ' });
        writer.Write(16);
        writer.Write((short)1);
        writer.Write(CHANNELS);
        writer.Write(SAMPLE_RATE);
        writer.Write(SAMPLE_RATE * CHANNELS * BITS_PER_SAMPLE / 8);
        writer.Write((short)(CHANNELS * BITS_PER_SAMPLE / 8));
        writer.Write(BITS_PER_SAMPLE);
        writer.Write(new char[] { 'd', 'a', 't', 'a' });
        writer.Write(pcm.Length);
        writer.Write(pcm);
      }
    }

    private static void Check(int code, string operation) {
      if (code != 0) {
        throw new InvalidOperationException(operation + " failed with winmm code " + code);
      }
    }
  }

  public static class NativeSpeaker {
    private const int CALLBACK_NULL = 0;
    private const int WHDR_DONE = 0x00000001;
    private const int BUFFER_SIZE = 4800;
    private const int SAMPLE_RATE = 24000;
    private const short CHANNELS = 1;
    private const short BITS_PER_SAMPLE = 16;
    private const uint WAVE_MAPPER = 0xFFFFFFFF;

    [StructLayout(LayoutKind.Sequential)]
    private struct WaveFormatEx {
      public ushort wFormatTag;
      public ushort nChannels;
      public uint nSamplesPerSec;
      public uint nAvgBytesPerSec;
      public ushort nBlockAlign;
      public ushort wBitsPerSample;
      public ushort cbSize;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct WaveHeader {
      public IntPtr lpData;
      public int dwBufferLength;
      public int dwBytesRecorded;
      public IntPtr dwUser;
      public int dwFlags;
      public int dwLoops;
      public IntPtr lpNext;
      public IntPtr reserved;
    }

    [DllImport("winmm.dll")]
    private static extern int waveOutOpen(out IntPtr hWaveOut, uint uDeviceID, ref WaveFormatEx lpFormat, IntPtr dwCallback, IntPtr dwInstance, int dwFlags);

    [DllImport("winmm.dll")]
    private static extern int waveOutPrepareHeader(IntPtr hWaveOut, IntPtr lpWaveOutHdr, int uSize);

    [DllImport("winmm.dll")]
    private static extern int waveOutUnprepareHeader(IntPtr hWaveOut, IntPtr lpWaveOutHdr, int uSize);

    [DllImport("winmm.dll")]
    private static extern int waveOutWrite(IntPtr hWaveOut, IntPtr lpWaveOutHdr, int uSize);

    [DllImport("winmm.dll")]
    private static extern int waveOutReset(IntPtr hWaveOut);

    [DllImport("winmm.dll")]
    private static extern int waveOutClose(IntPtr hWaveOut);

    public static void PlayRaw() {
      WaveFormatEx format = CreateFormat();
      IntPtr device;
      Check(waveOutOpen(out device, WAVE_MAPPER, ref format, IntPtr.Zero, IntPtr.Zero, CALLBACK_NULL), "waveOutOpen");

      try {
        Stream stdin = Console.OpenStandardInput();
        byte[] buffer = new byte[BUFFER_SIZE];
        while (true) {
          int read = FillBuffer(stdin, buffer);
          if (read <= 0) break;

          byte[] chunk = new byte[read];
          Buffer.BlockCopy(buffer, 0, chunk, 0, read);
          PlayChunk(device, chunk);
        }
      } finally {
        waveOutReset(device);
        waveOutClose(device);
      }
    }

    private static int FillBuffer(Stream stream, byte[] buffer) {
      int offset = 0;
      while (offset < buffer.Length) {
        int read = stream.Read(buffer, offset, buffer.Length - offset);
        if (read <= 0) break;
        offset += read;
      }
      return offset;
    }

    private static void PlayChunk(IntPtr device, byte[] chunk) {
      int headerSize = Marshal.SizeOf(typeof(WaveHeader));
      GCHandle bufferPin = GCHandle.Alloc(chunk, GCHandleType.Pinned);
      IntPtr headerPtr = IntPtr.Zero;

      try {
        WaveHeader header = new WaveHeader();
        header.lpData = bufferPin.AddrOfPinnedObject();
        header.dwBufferLength = chunk.Length;
        headerPtr = Marshal.AllocHGlobal(headerSize);
        Marshal.StructureToPtr(header, headerPtr, false);

        Check(waveOutPrepareHeader(device, headerPtr, headerSize), "waveOutPrepareHeader");
        Check(waveOutWrite(device, headerPtr, headerSize), "waveOutWrite");

        while (true) {
          header = (WaveHeader)Marshal.PtrToStructure(headerPtr, typeof(WaveHeader));
          if ((header.dwFlags & WHDR_DONE) != 0) break;
          Thread.Sleep(5);
        }

        Check(waveOutUnprepareHeader(device, headerPtr, headerSize), "waveOutUnprepareHeader");
      } finally {
        if (headerPtr != IntPtr.Zero) {
          Marshal.FreeHGlobal(headerPtr);
        }
        if (bufferPin.IsAllocated) {
          bufferPin.Free();
        }
      }
    }

    private static WaveFormatEx CreateFormat() {
      WaveFormatEx format = new WaveFormatEx();
      format.wFormatTag = 1;
      format.nChannels = (ushort)CHANNELS;
      format.nSamplesPerSec = SAMPLE_RATE;
      format.wBitsPerSample = (ushort)BITS_PER_SAMPLE;
      format.nBlockAlign = (ushort)(CHANNELS * BITS_PER_SAMPLE / 8);
      format.nAvgBytesPerSec = (uint)(SAMPLE_RATE * format.nBlockAlign);
      format.cbSize = 0;
      return format;
    }

    private static void Check(int code, string operation) {
      if (code != 0) {
        throw new InvalidOperationException(operation + " failed with winmm code " + code);
      }
    }
  }
}
'@`;
}

function powerShellString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
