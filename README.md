<p align="right">
  <a href="./README.md"><img alt="English README" src="https://img.shields.io/badge/English-README-2563eb?style=for-the-badge"></a>
  <a href="./README.zh-CN.md"><img alt="中文 README" src="https://img.shields.io/badge/%E4%B8%AD%E6%96%87-README-dc2626?style=for-the-badge"></a>
</p>

# AblePath

**AblePath is a local-first AI desktop assistant for people with limited mobility.**

It helps a user operate a computer through typed commands, speech, screen understanding, and a safety-focused AI action loop. The project combines a local Node.js API, a Vue setup and diagnostics dashboard, an Electron floating desktop assistant, and a privacy-aware caregiver surface.

AblePath is currently a Windows-oriented local MVP. It is designed as an assistive control layer, not as a cloud account, remote-control product, or unrestricted autonomous agent.

## Project Philosophy

AblePath uses AI as an enabling layer to help people with limited mobility control a computer. In everyday use, it aims to act like a pair of user-directed digital hands: carrying out screen operations, typing, clicking, opening apps, and navigating software so the user can spend more of their attention on thinking, deciding, creating, communicating, and working.

The long-term goal is not only to make computers easier to operate. It is to make it more possible for people with limited mobility to participate in labor, work, study, family life, and digital society on their own terms.

## Product Evolution

AblePath's first direction was based on `nanoclaw`, with the hope of reusing its underlying Agent capability directly. As Agent applications began evolving rapidly, that approach became less attractive: tying AblePath to one Agent runtime would make it harder for users to choose the best AI tools available at any given moment.

The product direction therefore shifted from "build one Agent app" to "help the user control the computer." With computer-level control, users can operate many kinds of Agent products, websites, desktop apps, and AI tools instead of being locked into one integrated stack.

The interface direction changed for the same reason. A Web-only control surface is awkward for real desktop operation, so AblePath now uses an Electron floating assistant as the primary user-facing shell. The Web app remains important, but mainly as a background dashboard for setup, status, diagnostics, and management.

AblePath also originally planned to include a caregiver-facing patient status monitoring system directly inside the main product. That capability has since been separated from the core assistant. The main AblePath runtime and the caregiver surface now interact through scoped APIs, keeping the assistive control loop and family/status visibility as separate surfaces with a clearer privacy boundary.

## What AblePath Does

- Turns natural-language goals into structured desktop action plans.
- Keeps model output behind a typed `ActionPlan` instead of executing raw model code.
- Supports local desktop actions such as opening apps, opening URLs, clicking, double-clicking, typing, hotkeys, scrolling, waiting, finishing, and calling the user.
- Captures and analyzes the current screen when the user chooses screen-aware planning.
- Provides local speech input, text-to-speech feedback, and experimental realtime voice plumbing.
- Offers an Electron floating assistant with Listen, Speak, Plan, Next, Dry-run, Confirm, Stop, SOS, screen context, and auto-execution controls.
- Provides a Web dashboard for setup, provider status, activity, tasks, screen/control diagnostics, emergency state, and caregiver configuration.
- Lets caregivers view redacted summaries and SOS state through scoped, time-limited access tokens.

## Product Principles

AblePath is built around autonomy, calm control, and family reassurance.

- **Local first:** configuration, activity, screenshots, and runtime state stay on the user's machine by default.
- **Human confirmation:** risky actions are previewed and confirmed before real execution.
- **Typed safety boundary:** AI plans are normalized into allowlisted actions before they can reach the executor.
- **Provider adapter model:** AI providers sit behind adapters, so the app is not coupled to one agent SDK.
- **Caregiver privacy:** caregiver views receive redacted summaries instead of full owner control by default.
- **Emergency stop:** the desktop shell keeps Stop and SOS visible during the control loop.

## Architecture

```text
ablepath/
  apps/
    server/       Local HTTP API, Agent APIs, providers, screen, voice, control
    web/          Vue owner dashboard and caregiver summary surface
    desktop/      Electron floating assistant shell
  packages/
    shared/       Shared API types, events, contracts, action schemas
    core/         Config, stores, safety, AI plan parsing, Agent prompts
  scripts/
    start-windows-desktop.ps1
    check-windows-demo.mjs
    validate-mvp.mjs
  docs/
    ARCHITECTURE.md
    PRODUCT.md
    SAFETY.md
    WINDOWS_ADAPTERS.md
    PLAN.md
```

The desktop app does not execute desktop actions directly. It calls the local AblePath server, and the server executes only normalized, allowlisted `ActionPlan` steps after the confirmation boundary.

## Core APIs

The active Agent loop is exposed through:

```text
POST /api/agent/command
POST /api/agent/confirm
POST /api/agent/step
POST /api/agent/stop
GET  /api/agent/recent
```

Other local APIs cover chat, vision, screen capture, voice, TTS, control diagnostics, activity, tasks, safety settings, caregivers, inactivity checks, and SOS.

## Supported Action Types

```text
openUrl
openApp
click
doubleClick
type
hotkey
scroll
wait
finished
callUser
```

Windows desktop control currently uses built-in PowerShell and Windows APIs. A richer native backend such as `nut-js` is intentionally deferred behind the same typed executor boundary.

## Requirements

- Windows is the primary target for the current MVP.
- Node.js 20 or newer.
- npm workspaces.
- Optional provider credentials for AI chat, vision, ASR, and realtime voice.

This repository may include a project-local Node runtime under:

```text
.tools/node-v20.19.0-win-x64
```

You can use that runtime on Windows, or install Node.js 20+ globally.

## Configuration

Copy the example environment file and fill in only the providers you want to test:

```powershell
Copy-Item .env.example .env
```

Important variables:

```text
ABLEPATH_HOST=127.0.0.1
ABLEPATH_PORT=4317
ARK_API_KEY=
DOUBAO_BASE_URL=
DOUBAO_CHAT_MODEL=
DOUBAO_VISION_MODEL=
VOLC_ASR_APP_KEY=
VOLC_ASR_ACCESS_KEY=
```

Do not commit `.env`, provider keys, caregiver tokens, screenshots, or local runtime data.

## Run On Windows

Using the bundled local Node runtime:

```powershell
.\.tools\node-v20.19.0-win-x64\npm.cmd install
.\.tools\node-v20.19.0-win-x64\npm.cmd run build
powershell -ExecutionPolicy Bypass -File .\scripts\start-windows-desktop.ps1 -RestartServer
```

Using a global Node.js installation:

```powershell
npm install
npm run build
powershell -ExecutionPolicy Bypass -File .\scripts\start-windows-desktop.ps1 -RestartServer
```

The local server and owner dashboard run at:

```text
http://127.0.0.1:4317
```

`-RestartServer` is recommended during development so the launcher does not reuse an older healthy server process.

## Development Commands

```powershell
npm run dev           # server development entry
npm run dev:web       # Vue dashboard development server
npm run build         # shared/core/server + web build
npm run typecheck     # TypeScript and Vue type checks
npm test              # workspace tests
npm run check:demo    # Windows demo checks
npm run validate:mvp  # build and MVP validation
```

## Current MVP Status

Implemented and covered by automated validation:

- Local server and Vue owner Web app.
- Caregiver token summary flow.
- SOS and emergency state.
- Doubao chat/vision provider adapter and Volc/Doubao voice paths.
- Agent command, confirmation, stepping, stop, and recent-session APIs.
- Typed action-plan parsing, repair, review, and execution.
- Windows screenshot, TTS, recording, realtime audio, and desktop-control adapters.
- Electron floating assistant with bounded auto-execution and screen continuation.

Known gaps:

- Browser-page operation still depends too much on visual clicking.
- There is no browser-native search-result/open-first-official-result tool yet.
- Post-action verification should be stricter before marking a goal finished.
- The floating assistant needs a visible action/result log.
- Stop cancels local desktop auto-continuation, but in-flight server-side planning still needs cancellability.
- Hold-to-talk is not yet true release-to-stop recording.
- Multi-monitor and high-DPI coordinate handling need more real-machine testing.

## Safety Notes

High-risk actions such as deleting content, sending messages, purchasing, publishing, submitting forms, or granting remote assistance should require explicit confirmation. AblePath is an assistive prototype and should be tested first with low-risk actions.

SOS and caregiver features are local MVP safety aids. They are not a substitute for emergency services or medical monitoring.

## Project Docs

- [Product baseline](./docs/PRODUCT.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [Safety baseline](./docs/SAFETY.md)
- [Windows adapters](./docs/WINDOWS_ADAPTERS.md)
- [Phase ledger](./docs/PLAN.md)
- [Original handoff note](./%E9%A1%B9%E7%9B%AE%E8%AF%B4%E6%98%8E.md)
