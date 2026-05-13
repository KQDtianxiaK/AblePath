import { describe, expect, it } from 'vitest';

import {
  buildWindowsRawMicScript,
  buildWindowsRawSpeakerScript,
  buildWindowsRecordAudioScript,
  getAudioStatus,
  listAudioDevices,
} from '../src/voice/audio.js';
import { speakText } from '../src/voice/tts.js';

describe('voice utilities', () => {
  it('reports audio backend status', () => {
    const status = getAudioStatus();

    expect(status).toHaveProperty('backend');
    expect(status).toHaveProperty('canRecord');
    expect(Array.isArray(listAudioDevices())).toBe(true);
  });

  it('handles missing TTS engines without throwing', async () => {
    const response = await speakText('', 'low');

    expect(response.ok).toBe(true);
  });

  it('builds Windows recorder scripts for wav and raw pcm capture', () => {
    const wavScript = buildWindowsRecordAudioScript("C:\\AblePath\\audio's\\sample.wav", 2);
    const rawScript = buildWindowsRawMicScript();
    const speakerScript = buildWindowsRawSpeakerScript();

    expect(wavScript).toContain('winmm.dll');
    expect(wavScript).toContain('RecordWav');
    expect(wavScript).toContain("C:\\AblePath\\audio''s\\sample.wav");
    expect(wavScript).toContain('2000');
    expect(rawScript).toContain('StreamRaw');
    expect(rawScript).toContain('Console.OpenStandardOutput');
    expect(speakerScript).toContain('PlayRaw');
    expect(speakerScript).toContain('Console.OpenStandardInput');
    expect(speakerScript).toContain('waveOutWrite');
  });
});
