# AblePath Desktop Assistant

This app is the planned desktop shell for AblePath's AI-driven control loop.

Current phase status:

- Electron is installed for this workspace.
- `@computer-use/nut-js` is also deferred until the native backend phase.
- The desktop shell must call the local AblePath server APIs instead of executing desktop actions directly.
- The server-side Agent API is the safety boundary:
  - `POST /api/agent/command`
  - `POST /api/agent/confirm`
  - `POST /api/agent/step`
  - `POST /api/agent/stop`
  - `POST /api/emergency/trigger`

Implemented first UI:

- Tray app plus floating ball.
- States: `idle`, `listening`, `planning`, `needs-confirmation`, `executing`, `error`, `SOS`.
- Text input, 5-second Listen / hold-to-talk button with countdown feedback, and Speak button.
- Plan preview, dry-run, confirm, stop, and SOS.
- Owner-cookie bootstrapping through the local Web shell before calling owner-only APIs.
- Desktop API calls use Node HTTP in preload so `Set-Cookie` can be read reliably in Electron.

Planned next UI:

- True press-to-record / release-to-stop after the server has recording session APIs.
- Optional automatic TTS announcements for selected high-value state changes.
- Experimental wake word toggle after push-to-talk is stable.

Run on Windows:

```powershell
cd D:\College\nanoclaw\ablepath
.\.tools\node-v20.19.0-win-x64\npm.cmd run build
powershell -ExecutionPolicy Bypass -File .\scripts\start-windows-desktop.ps1
```

Planned native backend:

- Use Electron for tray/window/floating-ball behavior.
- Use `@computer-use/nut-js` for global screenshot, click, type, hotkey, scroll, and scale-factor aware coordinate handling.
- Keep all model output mapped into AblePath typed `ActionPlan` actions before execution.
