# Windows Native Adapters

AblePath should run directly on Windows without depending on Nanoclaw or a fixed GUI-agent runtime. The Windows host adapter layer keeps host capabilities behind AblePath's own typed APIs:

- Screenshot: `captureScreen()` returns a local image path, metadata, and optional base64 data.
- TTS: `speakText()` gives spoken feedback through the same `/api/tts` endpoint.
- Audio recording: `recordAudio()` saves a WAV file for `/api/listen`, and `createRawMicProcess()` streams raw PCM for realtime voice.
- Realtime playback: `createRawSpeakerProcess()` plays raw PCM returned by the realtime model.
- Control: `executeControlPlan()` executes only AblePath `ActionPlan` steps after the confirmation boundary.

The current implementation uses built-in Windows PowerShell capabilities because they are available on a normal Windows install and are also callable from WSL through `powershell.exe`.

## Screenshot Adapter

File: `apps/server/src/screen.ts`

Detection:

- Native Windows: `process.platform === "win32"` and `powershell.exe` or `powershell` exists.
- WSL fallback: Linux with `powershell.exe` and `wslpath`.

Execution:

- Uses `System.Windows.Forms.Screen` and `System.Drawing.Bitmap`.
- Captures either the primary screen bounds or the supplied region.
- Saves PNG files under AblePath's screenshot data directory.
- On native Windows it writes directly to the resolved local path.
- On WSL it converts the WSL path to a Windows path with `wslpath -w`.

Limitations:

- Current native adapter captures the primary display. Multi-monitor selection should be added after the Windows MVP runs locally.
- Some locked-down Windows environments may disable PowerShell or .NET desktop assemblies.

## TTS Adapter

File: `apps/server/src/voice/tts.ts`

Detection order:

- macOS `say`
- Linux `espeak-ng`
- Linux `espeak`
- Windows PowerShell through either `powershell.exe` or `powershell`

Execution:

- Uses `System.Speech.Synthesis.SpeechSynthesizer`.
- Keeps the existing AblePath priority behavior; critical speech can stop an in-flight speech process.

Limitations:

- Voice selection and rate are not exposed yet.
- This is local system TTS, not Doubao voice output.

## Audio Recording Adapter

File: `apps/server/src/voice/audio.ts`

Detection order:

- Linux/WSL commands: `parecord`, `arecord`, then `sox`
- Native Windows: `powershell.exe` or `powershell`
- WSL fallback: Linux with `powershell.exe` available through Windows interop

Execution:

- Uses PowerShell `Add-Type` with a small inline C# helper.
- Calls `winmm.dll` APIs through P/Invoke.
- Captures 16kHz, 16-bit, mono PCM from the default Windows microphone.
- `recordAudio()` writes a local WAV file for `/api/listen` and Volc ASR upload.
- `createRawMicProcess()` starts a PowerShell child process that writes raw PCM bytes to stdout for realtime voice.
- `createRawSpeakerProcess()` starts a PowerShell child process that reads 24kHz, 16-bit, mono PCM from stdin and writes it to the default Windows speaker with `waveOut*`.
- On WSL, WAV output paths are converted with `wslpath -w` before PowerShell writes the file.

Limitations:

- Only the default Windows recording device is exposed.
- Windows microphone privacy permission must allow desktop apps to access the microphone.
- The realtime raw microphone and speaker streams are implemented, but full realtime conversation still needs native Windows app-level acceptance with real provider credentials.
- Locked-down Windows environments may disable PowerShell, `Add-Type`, or access to `winmm.dll`.

## Desktop Control Adapter

File: `apps/server/src/control.ts`

Detection:

- Native Windows or WSL with PowerShell available.
- Linux `xdotool` remains supported and is still preferred only when the Windows adapter is unavailable for non-WSL Linux hosts.

Supported actions:

- `click`
- `type`
- `hotkey`
- `scroll`
- `openUrl`
- `switchWindow`

Execution:

- `click`: calls `user32.dll` `SetCursorPos` when coordinates are supplied, then sends left mouse down/up.
- `scroll`: sends `mouse_event` wheel deltas.
- `type`: writes text to the Windows clipboard, then sends `Ctrl+V` with `System.Windows.Forms.SendKeys`.
- `hotkey`: maps AblePath key arrays to SendKeys tokens, such as `["ctrl", "v"]` to `^v`.
- `switchWindow`: sends `Alt+Tab`.

Safety boundary:

- Model output is not executed as arbitrary code.
- All actions must already be normalized into AblePath's `ActionPlan`.
- Plans marked `requiresConfirmation` still require explicit confirmation unless the call is dry-run.
- The Windows adapter only receives generated PowerShell for known allowlisted action builders.

## UI-TARS Desktop Reference

Inspected path: `../UI-TARS-desktop-main`

Useful pieces:

- `packages/ui-tars/operators/nut-js/src/index.ts`
- `multimodal/gui-agent/operator-nutjs/src/NutJSOperator.ts`
- `docs/sdk.md`

Findings:

- UI-TARS Desktop provides a real local computer operator based on `@computer-use/nut-js`.
- Its operator supports screenshot, click, right click, double click, drag, type, hotkey, press/release, scroll, wait, finished, and call-user actions.
- It handles high-DPI scale factors by resizing screenshots to physical screen size and converting model boxes to screen coordinates.
- On Windows, it types via clipboard plus `Ctrl+V`, which matches AblePath's current safer text entry approach.

Recommendation:

- Do not merge the whole Electron app into AblePath.
- Keep AblePath's simpler local server and confirmation boundary.
- Use UI-TARS Desktop as a reference for a future optional `nut-js` backend when AblePath needs drag, multi-monitor, high-DPI coordinate normalization, and richer action parsing.
- If adopting `nut-js`, put it behind the same `ActionPlan` executor instead of allowing model-generated code or raw UI-TARS actions to run directly.

## Windows MVP Acceptance

After moving AblePath to Windows, run:

```bash
npm install
npm run typecheck
npm test
npm run build
npm run validate:mvp
```

Then start the app and check:

- `GET /api/screen/status` reports `canCapture: true`, `backend: "powershell"`.
- `POST /api/screen/capture` returns a non-empty PNG.
- `GET /api/voice/status` reports TTS `canSpeak: true`, `engine: "powershell"`.
- `POST /api/tts` speaks a short test sentence.
- `GET /api/voice/status` reports audio `canRecord: true`, `backend: "powershell"` on native Windows when microphone access is available.
- `POST /api/listen` records a short WAV and transcribes it when ASR credentials are configured.
- Realtime voice can start, receive microphone PCM input, and play model PCM output through the Windows speaker path.
- `GET /api/control/status` reports click/type/hotkey/scroll/switchWindow available.
- `POST /api/control/execute` with `dryRun: true` works before any real control trial.

For real desktop control acceptance, test only low-risk actions first:

- Open Notepad manually.
- Execute a confirmed `type` plan into Notepad.
- Execute a confirmed `hotkey` plan such as `ctrl+a`.
- Execute one confirmed `scroll` plan in a harmless window.
- Avoid destructive app shortcuts until the action preview, confirmation, and emergency stop behavior are verified.
