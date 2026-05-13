# AblePath Phase Plan

This document is the implementation ledger. Update it at the end of every phase with completed scope, tests run, and known follow-ups.

## Phase 0: Project Skeleton and Product Baseline

Status: Complete

Completed:

- Created the standalone `ablepath/` workspace separate from `nanoclaw/`.
- Added `apps/server`, `apps/web`, `packages/shared`, and `packages/core`.
- Added product, architecture, and safety baseline docs.
- Fixed the project development runtime to Node 20+ via local `node@20.19.0`.

Validation:

- `npm run typecheck`
- `npm test`
- `npm run build`

## Phase 1: Local Service, Config, Activity, and Web Shell

Status: Complete

Completed:

- Implemented local config under the AblePath config directory.
- Implemented file-backed activity persistence for the first milestone.
- Implemented `/api/health`, `/api/config`, `/api/activity/recent`, `/api/activity/stats`, and `/api/providers/status`.
- Implemented `/ws/events` event stream.
- Implemented the Vue dashboard shell with Dashboard, Chat, Activity, Emergency, and Settings views.

Validation:

- `npm run typecheck`
- `npm test`
- `npm run build`
- Manual API checks for `/api/health` and `/api/providers/status`.

## Phase 2: AI Provider and Basic Chat

Status: Complete

Completed:

- Added shared chat and vision API response/request types.
- Added env loading from `ablepath/.env` with fallback search for `nanoclaw/.env`.
- Added the Provider interface and Doubao OpenAI-compatible implementation.
- Implemented `/api/chat`, `/api/chat/history`, and `/api/vision/analyze`.
- Updated provider status to reflect env values loaded from the fallback `.env`.
- Replaced the Chat placeholder with a working Vue chat UI.

Validation:

- `npm run typecheck`
- `npm test`
- `npm run build`
- Mock Provider tests for request shape and missing-key behavior.
- Manual `/api/providers/status` check: `doubao` and `doubao-realtime` configured from `nanoclaw/.env`.
- Manual `/api/chat` check with real Doubao response.

## Phase 3: Voice Input, TTS, and Realtime Voice

Status: Complete

Completed:

- Copied the former NanoClaw `.env` into `ablepath/.env`; AblePath now owns its keys.
- Fixed root frontend serving so `http://localhost:4317/` returns the Vue app.
- Added audio device/status API at `/api/devices/audio`.
- Added full voice setup diagnostics at `/api/voice/status`.
- Added recording integration and `/api/listen`.
- Ported the Volc ASR client into AblePath as an independent module.
- Added system TTS API at `/api/tts`.
- Implemented Doubao realtime S2S protocol framing/parsing and session lifecycle.
- Implemented realtime WebSocket handling for `talk.start`, `talk.stop`, and `talk.text`.
- Implemented microphone PCM streaming and realtime audio playback hooks.
- Fixed the `sox` recording path to use `sox -d` instead of assuming `rec` exists.
- Added Chat page controls for 5-second recording, TTS playback, realtime start/stop, and realtime text input.
- Added Settings voice diagnostics for recording, TTS, realtime readiness, and setup hints.

Validation:

- `npm run typecheck`
- `npm test`
- `npm run build`
- Unit tests for realtime frame helpers, env validation, STT/TTS utilities, and voice status APIs.
- Manual `GET /` check on the current dev server: HTTP 200.
- Manual `GET /api/providers/status`: `doubao` and `doubao-realtime` configured from `ablepath/.env`.
- Manual `GET /api/voice/status`: realtime keys configured; recording and TTS unavailable on this machine because no recorder/TTS command is installed.
- Manual `POST /api/tts`: returns `{ ok: true, engine: "none", spoken: false }` when no local TTS engine exists.
- Manual `POST /api/listen`: returns the expected recorder setup error when no audio backend exists.
- Manual WebSocket `talk.start`: returns the expected recorder setup error instead of attempting a broken realtime session.

Known follow-ups:

- Full microphone/audio-output validation requires a machine with `parecord`, `arecord`, or `sox` for recording and `paplay`, `aplay`, or a platform playback path for realtime audio output.
- Local TTS playback requires `espeak-ng`, `espeak`, or macOS `say`.

## Phase 4: Computer Control Plans and Confirmation Boundary

Status: Complete

Completed:

- Added shared request/response types for control planning, execution, results, and local capability status.
- Added a core control planner that converts simple natural-language intents into typed `ActionPlan` steps.
- Added risk classification and confirmation requirements to generated control plans.
- Added `/api/control/status`, `/api/control/plan`, and `/api/control/execute`.
- Added a guarded executor with `dryRun` support.
- Added desktop execution hooks for URL opening and `xdotool`-based click, type, hotkey, scroll, and window switching.
- Added activity logging and WebSocket events for control plan creation and action lifecycle.
- Added a Vue Control view for creating plans, reviewing risk, dry-running, and confirming execution.

Validation:

- `npm run typecheck`
- `npm test`
- `npm run build`
- Unit tests for control planning, confirmation enforcement, dry-run execution, and control APIs.
- Manual `GET /api/control/status`: URL opening available; `xdotool` missing on this machine for desktop mouse/keyboard actions.
- Manual `POST /api/control/plan` with `打开 example.com`: generated a medium-risk `openUrl` plan requiring confirmation.
- Manual `POST /api/control/execute` without confirmation: rejected with the expected confirmation error.
- Manual confirmed dry-run execution: returned a skipped success result without performing a real GUI action.
- Manual `GET /`: HTTP 200 on the updated dev server.

Known follow-ups:

- Real mouse/keyboard execution on Linux requires installing `xdotool` and validating against a desktop session.
- Future control phases should add screen capture, element targeting, and AI-assisted action planning before broadening the supported command set.

## Phase 5: Screen Capture and AI Screen Understanding

Status: Complete

Completed:

- Added shared screen status, capture, and analysis request/response types.
- Added a standalone screen capture module with platform backend detection.
- Supported macOS `screencapture` and Linux `grim`, `scrot`, `gnome-screenshot`, and ImageMagick `import`.
- Added screenshot cleanup for local-first storage hygiene.
- Added `/api/screen/status`, `/api/screen/capture`, and `/api/screen/analyze`.
- Connected `/api/screen/analyze` to the existing Doubao vision provider using captured screenshot files.
- Added activity logging for screen capture and screen analysis.
- Added a Vue Screen view for status, screenshot preview, and AI screen description.

Validation:

- `npm run typecheck`
- `npm test`
- `npm run build`
- Unit tests for screen status and screenshot cleanup.
- API tests for `/api/screen/status`.
- Manual `GET /`: HTTP 200 on the updated dev server.
- Manual `GET /api/providers/status`: `doubao` vision capability configured from `ablepath/.env`.
- Manual `GET /api/screen/status`: reports no screenshot backend on this machine.
- Manual `POST /api/screen/capture`: returns the expected setup error when no screenshot backend exists.

Known follow-ups:

- Real screenshot and AI screen-analysis validation requires a desktop session with `screencapture`, `grim`, `scrot`, `gnome-screenshot`, or ImageMagick `import`.
- Next control phase should use screen analysis output to propose coordinate-aware click plans with confirmation.

## Phase 6: Screen Targets and Coordinate-Aware Click Plans

Status: Complete

Completed:

- Added shared screen element, screen target, and target-control-plan types.
- Added a structured screen-target prompt for vision models to return actionable UI elements as JSON.
- Added robust parsing for raw JSON and fenced JSON screen-target responses.
- Added `/api/screen/targets` to detect actionable buttons, inputs, links, menus, and other screen elements.
- Added in-memory storage of latest screen targets for follow-up control planning.
- Added `/api/control/plan-target` to convert a target element into a coordinate-aware click plan.
- Kept target click plans inside the same risk and confirmation boundary as other computer control plans.
- Updated the Screen view to list detected elements and create/dry-run/confirm click plans from them.

Validation:

- `npm run typecheck`
- `npm test`
- `npm run build`
- Unit tests for screen-target JSON parsing.
- Unit tests for coordinate click plan generation.
- API tests for detecting screen targets from supplied image data with a mock vision provider.
- API tests for generating a target click plan from detected targets.
- Manual `GET /`: HTTP 200 on the updated dev server.
- Manual `POST /api/control/plan-target` with a supplied element: generated a medium-risk confirmed click plan at the element center.
- Manual confirmed dry-run of that plan: returned a skipped success result without executing a GUI action.
- Manual `POST /api/screen/targets` without a screenshot backend: returned the expected setup error.

Known follow-ups:

- Real target detection quality must be validated with actual screenshots once a screenshot backend is installed.
- Next phase should persist emergency state and caregiver-facing safety events so control/voice/screen activity can trigger family reassurance flows.

## Phase 7: Emergency State and Caregiver Safety Events

Status: Complete

Completed:

- Added shared emergency request, action, status, and caregiver notification result types.
- Added local emergency persistence under the AblePath data directory.
- Implemented the emergency state machine: `normal`, `pending-confirmation`, `active`, and `resolved`.
- Added confirmation countdown support using `emergencyConfirmationTimeoutSec`.
- Added auto-activation when a pending emergency expires.
- Added `/api/emergency/status`, `/api/emergency/trigger`, `/api/emergency/confirm`, `/api/emergency/cancel`, and `/api/emergency/resolve`.
- Added optional caregiver webhook notification for caregivers with `receive-emergency` permission.
- Added emergency and caregiver activity logging.
- Added `emergency.changed` WebSocket publishing for state changes.
- Replaced the Emergency placeholder with a working Vue view for SOS, immediate help, cancel, confirm, resolve, caregiver status, and recent events.

Validation:

- `npm run typecheck`
- `npm test`
- `npm run build`
- Unit tests for emergency persistence, pending/cancel/confirm/resolve flow, and auto-activation.
- Unit tests for caregiver notification filtering, skipped local-only notifications, and webhook posting with mocked fetch.
- API tests for emergency status, trigger, confirm, and resolve flow.
- Manual `GET /`: HTTP 200 on the updated dev server.
- Manual `GET /api/emergency/status`: returned normal state.
- Manual `POST /api/emergency/trigger`: created pending confirmation with a 30-second countdown.
- Manual `POST /api/emergency/cancel`: returned normal state.
- Manual immediate trigger: created active emergency with no notifications when no caregivers are configured.
- Manual `POST /api/emergency/resolve`: returned resolved state and wrote emergency activity.

Known follow-ups:

- Add inactivity monitoring that can trigger pending emergency when there is no user activity for the configured timeout.
- Add caregiver configuration UI so trusted family members can be managed without editing `config.json`.

## Phase 8: Caregiver Configuration and Inactivity Monitoring

Status: Complete

Completed:

- Added shared caregiver upsert/remove types and inactivity status/check response types.
- Added activity-store support for reading the latest activity timestamp.
- Added `/api/caregivers`, `/api/caregivers/upsert`, and `/api/caregivers/remove`.
- Added `/api/inactivity/status` and `/api/inactivity/check`.
- Added a background inactivity checker in the local server, controlled by `ABLEPATH_INACTIVITY_CHECK_MS`.
- Added inactivity-triggered pending emergency creation when the configured timeout is exceeded.
- Prevented duplicate inactivity emergencies while emergency state is pending or active.
- Added Settings UI for inactivity status and manual check.
- Added Settings UI for adding/removing trusted caregivers and optional emergency webhooks.

Validation:

- `npm run typecheck`
- `npm test`
- `npm run build`
- Unit tests for inactivity status and timeout-triggered pending emergency.
- API tests for caregiver add/list/remove.
- API tests for inactivity check triggering a pending emergency with a low timeout.
- Manual `GET /`: HTTP 200 on the updated dev server.
- Manual `GET /api/inactivity/status`: returned enabled state, configured timeout, last activity, inactive duration, and current emergency state.
- Manual caregiver upsert/list/remove API checks succeeded.
- Manual `POST /api/inactivity/check`: returned `triggered: false` after recent caregiver activity, as expected.

Known follow-ups:

- Add caregiver-facing summary endpoints that expose only permitted activity/emergency data.
- Add UI for editing safety timeout values without editing `config.json`.

## Phase 9: Caregiver Summaries and Safety Settings UI

Status: Complete

Completed:

- Added shared caregiver activity summary, caregiver summary response, and safety update request types.
- Added `/api/caregiver/summary` with permission-scoped output:
  - `receive-emergency` exposes emergency state and recent emergency events.
  - `view-activity` exposes activity stats and redacted recent activity without raw details.
  - `view-screen` exposes only screen capture availability, not screenshots.
- Added `/api/safety/update` for bounded updates to inactivity timeout and emergency confirmation countdown.
- Added validation for safety timeout ranges.
- Added Settings UI for editing inactivity timeout and SOS confirmation countdown.
- Added Settings UI to preview each caregiver's permitted summary.

Validation:

- `npm run typecheck`
- `npm test`
- `npm run build`
- API tests for caregiver summary permission filtering and redacted activity records.
- API tests for valid and invalid safety timeout updates.
- Manual `GET /`: HTTP 200 on the updated dev server.
- Manual `POST /api/safety/update`: updated timeout values successfully.
- Manual invalid safety update: rejected invalid confirmation timeout.
- Manual caregiver summary check: returned emergency/activity data for a caregiver with `receive-emergency` and `view-activity`, without screen data.
- Manual cleanup: removed the temporary caregiver and restored default safety thresholds.

Known follow-ups:

- Add authentication or local pairing before exposing caregiver summary outside localhost.
- Add a dedicated caregiver view once permission and pairing design is finalized.

## Phase 10: Unified Task Sessions

Status: Complete

Completed:

- Added shared task-session status, request, response, list, and WebSocket event types.
- Added persistent task session storage under the AblePath data directory.
- Added `/api/tasks/recent`, `/api/tasks/status`, `/api/tasks/start`, `/api/tasks/execute`, and `/api/tasks/cancel`.
- Connected task start to the existing control planner so a user goal becomes a reviewed action plan.
- Kept task execution inside the existing confirmation boundary and executor dry-run path.
- Added task activity logging and `task.changed` WebSocket publishing.
- Added a Vue Tasks view for entering a goal, reviewing the generated plan, dry-running, explicitly confirming execution, cancelling, and selecting recent tasks.
- Added a Tasks navigation item in the main shell.

Validation:

- `npm run typecheck`
- `npm test`
- `npm run build`
- Unit tests for task-store persistence and task execution result storage.
- API test for starting and dry-running a task through the confirmation boundary.
- Manual `GET /` on a temporary dev server: HTTP 200 and served the built Vue app.
- Manual `GET /api/tasks/recent`: returned an empty list before task creation, then returned the completed task.
- Manual `POST /api/tasks/start` with `打开 example.com`: generated a medium-risk `openUrl` task awaiting confirmation.
- Manual `POST /api/tasks/execute` without confirmation: rejected with the expected confirmation error.
- Manual confirmed dry-run execution: completed the task with skipped success result and no GUI side effect.

Known follow-ups:

- A full end-to-end GUI execution test still requires a real desktop session and the relevant control tools, such as `xdotool`.
- Task sessions currently wrap single generated control plans; later phases should add multi-step progress, voice/screen replanning, and caregiver-visible task summaries.

## Phase 11: Task Advancement and Replanning

Status: Complete

Completed:

- Added task-session event history for creation, user notes, screen context, plan updates, execution, and cancellation.
- Persisted task event history in the task store.
- Updated task execution and cancellation to append task events.
- Added `/api/tasks/advance` for continuing an existing task with a new instruction and/or screen context.
- Made task advancement replace the current control plan, clear stale execution output, preserve the event trail, and publish `task.changed`.
- Kept advanced task plans inside the same risk classification and confirmation boundary as normal task plans.
- Added Tasks UI controls for adding a next-step instruction and optional screen context.
- Added recent task event history in the Tasks UI.

Validation:

- `npm run typecheck`
- `npm test`
- `npm run build`
- Unit tests for task event persistence, execution events, and clearing stale execution after replanning.
- API test for advancing a task from `example.com` to `example.org` and regenerating the next plan.
- Manual `GET /` on a temporary dev server: HTTP 200 and served the built Vue app.
- Manual `POST /api/tasks/start` with `打开 example.com`: created a task with `created` and `plan-updated` events.
- Manual `POST /api/tasks/advance` with `改为打开 example.org` and screen context: generated a new `openUrl` plan for `https://example.org` and recorded `user-note`, `screen-context`, and `plan-updated`.
- Manual invalid `POST /api/tasks/advance` without instruction or screen context: rejected with `400`.
- Manual confirmed dry-run after advancement: completed the task and appended an `execution` event.
- Manual `GET /api/tasks/recent`: returned the advanced task with event history and execution result.

Known follow-ups:

- Advancement still uses the deterministic control planner; future phases should let the configured AI provider synthesize richer multi-step plans from task history and screen analysis.
- Screen context is currently manually supplied in the task UI; the next phase should offer one-click capture/analyze and feed the result into `/api/tasks/advance`.

## Phase 12: Screen-Aware Task Advancement

Status: Complete

Completed:

- Added shared task screen-advancement request/response types.
- Added `screen-analysis` task event type.
- Added `/api/tasks/advance-screen` to analyze the current screen or a supplied image and advance an existing task.
- Reused the configured vision provider for screen understanding.
- Reused the existing screenshot backend when no image is supplied.
- Fed the vision result into task replanning while preserving task history and the confirmation boundary.
- Added activity logging and `task.changed` publishing for screen-driven task advancement.
- Added Tasks UI status for screenshot availability.
- Added a Tasks UI button to read the screen and update the current task.
- Made screenshot/vision setup errors return a handled `400` from the new task screen-advancement endpoint.

Validation:

- `npm run typecheck`
- `npm test`
- `npm run build`
- API test for advancing a task from a supplied image through mocked vision analysis and regenerating a next action.
- Manual `GET /` on a temporary dev server: HTTP 200 and served the built Vue app.
- Manual `GET /api/screen/status`: reported no screenshot backend on this Linux/WSL machine.
- Manual `POST /api/tasks/advance-screen` without image on this machine: returned handled `400` with the expected screenshot setup error.
- Manual `POST /api/tasks/advance-screen` with a supplied 16x16 PNG and real Doubao vision: produced screen analysis, recorded `screen-analysis`, and generated an `openUrl` plan for `https://example.org`.
- Manual confirmed dry-run after screen advancement: completed the task with skipped success result and appended an `execution` event.

Known follow-ups:

- Real one-click screen reading requires installing or running under a screenshot-capable desktop backend such as `grim`, `scrot`, `gnome-screenshot`, ImageMagick `import`, or macOS `screencapture`.
- Screen-driven replanning still depends on the deterministic planner extracting simple actions from the vision text; the next planning phase should introduce structured AI-generated action plans with explicit safety review.

## Phase 13: Structured AI Action Plans

Status: Complete

Completed:

- Added shared task AI-plan request/response types.
- Added `ai-plan` task event type.
- Added a core structured AI plan parser that accepts JSON or fenced JSON.
- Supported validated AI action types: `openUrl`, `click`, `type`, `hotkey`, `scroll`, and `switchWindow`.
- Added server-side normalization for AI action params, including URL normalization and coordinate/key validation.
- Ignored unsupported or malformed AI actions and returned warnings instead of trusting model output blindly.
- Converted parsed AI output into the existing `ActionPlan` shape so execution still uses the same confirmation boundary.
- Added `/api/tasks/plan-ai` to ask the configured chat provider for a structured task plan from task history, user instruction, and optional screen context.
- Added activity logging, `ai-plan` task events, and `task.changed` publishing for AI-generated plans.
- Added a Tasks UI button for generating an AI structured plan from the current task context.

Validation:

- `npm run typecheck`
- `npm test`
- `npm run build`
- Unit tests for parsing fenced JSON, URL normalization, invalid action filtering, and warning generation.
- API test for structured AI task planning through a mocked provider and confirmation boundary.
- Manual `GET /` on a temporary dev server: HTTP 200 and served the built Vue app.
- Manual `POST /api/tasks/start` with `打开 example.org`: created a normal task plan.
- Manual `POST /api/tasks/plan-ai` with real Doubao: returned schema-compliant JSON, generated an `openUrl` plan for `https://example.net`, recorded `user-note`, `ai-plan`, and `plan-updated`, and kept confirmation required.
- Manual confirmed dry-run after AI planning: completed with skipped success result and appended an `execution` event.

Known follow-ups:

- The structured planner currently depends on prompt compliance; future work should add stricter schema repair/retry and provider-specific JSON mode where available.
- Multi-action plans are parsed and supported, but need more real desktop validation before allowing broad execution beyond dry-run on machines with mouse/keyboard tooling.

## Phase 14: AI Plan Safety Review

Status: Complete

Completed:

- Added shared `AiPlanSafetyReview` response type.
- Extended structured AI plan responses with `safetyReview`.
- Added AblePath-side risk recomputation so model-reported `riskLevel` cannot downgrade a plan.
- Added safety review reasons for model risk, computed risk, confirmation-required action types, and blocked actions.
- Added high-risk keyword blocking before AI actions become executable steps.
- Blocked high-risk AI actions are omitted from the generated `ActionPlan` and surfaced as warnings.
- Persisted safety review details in `ai-plan` task event details.
- Added activity log details for safety review output.
- Added Tasks UI display for AI safety review risk, confirmation requirement, blocked action count, warnings, and reasons.

Validation:

- `npm run typecheck`
- `npm test`
- `npm run build`
- Unit tests that low model risk cannot override AblePath-computed medium risk.
- Unit tests that high-risk AI actions such as `点击提交订单` are blocked before execution.
- API test updated to assert structured AI plans include a medium safety review for `openUrl`.
- Manual `GET /` on a temporary dev server: HTTP 200 and served the built Vue app.
- Manual `POST /api/tasks/plan-ai` with real Doubao: model reported `low`, AblePath recomputed `medium`, required confirmation for `openUrl`, and returned review reasons.
- Manual confirmed dry-run after reviewed AI planning: completed with skipped success result and appended an `execution` event.

Known follow-ups:

- High-risk keyword blocking is intentionally conservative and text-based; later phases should add per-domain allow/deny lists and clearer user override flows.
- Safety review is visible immediately after AI planning in the current UI; persisted historical review details are stored in task events but not yet expanded into a full audit viewer.

## Phase 15: Local Task Audit View

Status: Complete

Completed:

- Added shared task audit entry and response types.
- Added a core task audit builder that converts task events, current plan, safety review, and execution result into a timeline.
- Added task audit totals for event count, AI plan count, blocked action count, execution count, and failed action count.
- Redacted raw AI model responses from audit details and kept only a bounded preview.
- Added `/api/tasks/audit` for local task audit retrieval by task id.
- Added API tests for local task audit records.
- Added core tests for AI safety review aggregation, blocked-action totals, execution totals, and raw response preview redaction.
- Added Tasks UI support for loading and displaying a task audit.
- Added audit metrics and timeline entries to the Tasks view.

Validation:

- `npm run typecheck`
- `npm test`
- `npm run build`
- Unit test for audit summary totals and raw response preview redaction.
- API test for retrieving local task audit records after AI planning.
- Manual `GET /` on a temporary dev server: HTTP 200 and served the built Vue app.
- Manual task flow with real Doubao: start task, generate AI structured plan, confirmed dry-run, then retrieve `/api/tasks/audit`.
- Manual audit response included timeline entries, AI plan count, safety review, execution result, and raw response preview instead of raw response.

Known follow-ups:

- Task audit is currently a local full-detail view; caregiver-facing summaries should use a separate redacted endpoint with explicit permissions.
- The audit UI shows concise timeline fields; future work can add expandable details for blocked actions, safety reasons, and execution result rows.

## Phase 16: Caregiver Redacted Task Summaries

Status: Complete

Completed:

- Added `view-task-summary` caregiver permission.
- Added shared caregiver task summary types.
- Extended caregiver summaries with an optional `tasks` section gated by `view-task-summary`.
- Added redacted task summary generation from recent task audits.
- Exposed only task id label, status, risk level, updated time, AI plan count, blocked action count, execution count, and failed action count.
- Kept task goals, user notes, screen content, raw model output, URLs, and execution details out of caregiver task summaries.
- Updated Settings caregiver creation to include task-summary permission for newly added trusted caregivers.
- Updated Settings caregiver summary preview to show redacted recent task summaries.

Validation:

- `npm run typecheck`
- `npm test`
- `npm run build`
- API test for permission-scoped caregiver summaries still excluding tasks without `view-task-summary`.
- API test for `view-task-summary` returning redacted task data without task goal, URL, or raw model response.
- Manual `GET /` on a temporary dev server: HTTP 200 and served the built Vue app.
- Manual caregiver/task flow with real Doubao: created caregiver with `view-task-summary`, started task with private goal text, generated AI plan, and retrieved caregiver summary.
- Manual caregiver summary included only redacted task labels, status, risk, and counts; it did not include the private task goal, URL, user instruction, screen content, or raw response.

Known follow-ups:

- Caregiver task summaries are still available only through local API preview; future pairing/auth work should secure any remote access before exposing it off localhost.
- Permission editing UI is still coarse; a later Settings phase should add explicit toggles for each caregiver permission.

## Phase 17: Caregiver Permission Editing UI

Status: Complete

Completed:

- Added explicit Settings UI toggles for caregiver permissions:
  - `receive-emergency`
  - `view-activity`
  - `view-screen`
  - `view-task-summary`
- Added editing support for existing caregivers in the Settings view.
- Added form state for editing caregiver id, permissions, relationship, and webhook.
- Added cancel/reset behavior for caregiver editing.
- Updated caregiver rows to show current permission set.
- Kept the existing upsert API as the single save path for both creating and updating caregivers.

Validation:

- `npm run typecheck`
- `npm test`
- `npm run build`
- API test for updating a caregiver's permissions through upsert.
- Manual `GET /` on a temporary dev server: HTTP 200 and served the built Vue app.
- Manual caregiver update: changed a caregiver from `receive-emergency` to `view-task-summary` + `view-screen`.
- Manual caregiver summary after update included only `screen` and `tasks`, and excluded `emergency` and `activity`.

Known follow-ups:

- Permission editing is still local-admin only; future pairing/auth work should distinguish local owner actions from remote caregiver access.
- The permission UI uses compact labels; a later accessibility pass should add fuller tooltips/descriptions for each permission.

## Phase 18: Local Caregiver Pairing Tokens

Status: Complete

Completed:

- Added caregiver access token creation request/response types.
- Added local token generation endpoint at `/api/caregivers/token`.
- Stored only a SHA-256 token hash and token creation timestamp in local config.
- Returned the raw token only once at generation time.
- Sanitized caregiver list/upsert/remove responses so token hashes are never returned.
- Added token-based caregiver summary access at `/api/caregiver/summary-token`.
- Kept token-based summaries scoped to the caregiver's existing permissions.
- Used constant-time hash comparison for token lookup.
- Added Settings UI button to generate a one-time pairing token for a caregiver.
- Added Settings UI display for the one-time token with wrapping for long token text.

Validation:

- `npm run typecheck`
- `npm test`
- `npm run build`
- API test for token generation, invalid token rejection, token-hash non-disclosure, and token-based summary access.
- Manual `GET /` on a temporary dev server: HTTP 200 and served the built Vue app.
- Manual caregiver token generation: returned a one-time token and persisted only `accessTokenCreatedAt` in caregiver list output.
- Manual invalid token summary request: returned `401`.
- Manual valid token summary request: returned only the caregiver's permission-scoped summary.

Known follow-ups:

- Token access currently uses a local query-parameter endpoint for the MVP; before any remote exposure, move to HTTPS-only bearer tokens and avoid URL logging.
- Token lifecycle is minimal; later work should add revoke/rotate UI, expiry policy, and pairing confirmation from the local owner.

## Phase 19: Caregiver Token Lifecycle Management

Status: Complete

Completed:

- Added caregiver token expiry metadata to caregiver profiles.
- Added token expiry to token generation responses.
- Added bounded token lifetime handling with a 30-day default and 1-365 day clamp.
- Made token rotation overwrite the stored token hash so older tokens immediately stop working.
- Added `/api/caregivers/token/revoke` to revoke a caregiver token.
- Added expired-token rejection to token-based caregiver summary access.
- Preserved hash-only storage and sanitized caregiver responses.
- Added Settings UI display for token expiry.
- Added Settings UI control to revoke a caregiver token.

Validation:

- `npm run typecheck`
- `npm test`
- `npm run build`
- API tests for token rotation, invalidating old tokens, revocation, and bounded expiry.
- Manual `GET /` on a temporary dev server: HTTP 200 and served the built Vue app.
- Manual token rotation: first token returned `401` after a second token was generated.
- Manual valid rotated token access: returned the caregiver's permission-scoped summary.
- Manual token revocation: revoked token returned `401` after revoke.
- Manual caregiver list check: exposed only `accessTokenCreatedAt` and `accessTokenExpiresAt`, never raw token or hash.

Known follow-ups:

- The token API still accepts query-parameter tokens for local MVP testing; move to `Authorization: Bearer` before any non-local deployment.
- Add explicit expiry-duration controls in Settings instead of the current default-generation UI.

## Phase 20: Bearer Token Caregiver Access

Status: Complete

Completed:

- Extended the local API handler request shape to carry HTTP headers.
- Passed incoming HTTP headers from the server into the API handler.
- Added `Authorization: Bearer <token>` parsing for caregiver summary token access.
- Made `/api/caregiver/summary-token` prefer Bearer tokens while retaining query token compatibility for local MVP testing.
- Kept existing hash lookup, expiry checks, permission scoping, and redacted summary behavior unchanged.

Validation:

- `npm run typecheck`
- `npm test`
- `npm run build`
- API tests for Bearer token access alongside query-token compatibility.
- Manual `GET /` on a temporary dev server: HTTP 200 and served the built Vue app.
- Manual Bearer token summary request: returned the caregiver's permission-scoped summary.
- Manual invalid Bearer token request: returned `401`.
- Manual query-token compatibility request: still returned the caregiver's permission-scoped summary.

Known follow-ups:

- Query-token compatibility remains for local MVP testing; future non-local deployment should disable query-token access and require HTTPS Bearer tokens only.
- Add a small caregiver-facing endpoint/page that uses Bearer tokens rather than exposing API URLs directly.

## Phase 21: Caregiver Bearer Summary Page

Status: Complete

Completed:

- Added a caregiver-facing `看护` page to the Vue shell.
- Added a Bearer-token caregiver summary API helper.
- Added token load, save-to-browser, clear, and summary refresh controls.
- Rendered caregiver identity, emergency, activity, screen, and task summary sections only when returned by the permission-scoped summary endpoint.
- Kept the page on redacted fields only; task summaries still exclude task goals, user instructions, raw model output, URLs, and execution details.
- Tightened caregiver activity summaries at the server boundary so `view-activity` returns category-level activity text instead of raw local activity summaries that may contain private task goals.
- Added a regression test for caregiver activity summary redaction.

Validation:

- `npm run typecheck`
- `npm test` with 45 passing tests.
- `npm run build`
- Manual `GET /` on a temporary dev server: HTTP 200 and served the updated Vue app.
- Manual built-asset check confirmed the `看护` navigation entry and caregiver summary page are included.
- Manual Bearer-token caregiver summary request returned permission-scoped activity and task sections.
- Manual Bearer summary check confirmed activity summaries are category-level redacted strings such as `System activity` and `Computer control activity`.

Known follow-ups:

- Browser token storage uses `localStorage` for the local MVP; future remote access should move to a proper HTTPS session or platform credential store.
- Query-token compatibility still exists for local testing and should be removed before any non-local deployment.
- A future routing/auth phase should expose the caregiver page as a dedicated route instead of only as an app-shell tab.

## Phase 22: Dedicated Caregiver Entry Route

Status: Complete

Completed:

- Added a dedicated `/caregiver` frontend entry mode.
- Kept `/caregiver` inside the existing static fallback, so the server can serve the Vue app without a new route handler.
- Rendered a stripped-down caregiver shell on `/caregiver` instead of the owner app sidebar and navigation.
- Skipped the owner app event WebSocket when running in dedicated caregiver mode.
- Preserved the in-app `看护` tab for local owner testing.
- Added fragment-token bootstrap support with `/caregiver#token=<token>` and `/caregiver#access_token=<token>`.
- Cleared the URL fragment after reading a token so the token is not left visible in the address bar.
- Kept Bearer API access as the data path after fragment bootstrap; the fragment is only a client-side convenience.
- Added responsive styling for the caregiver-only shell.

Validation:

- `npm run typecheck`
- `npm test` with 45 passing tests.
- `npm run build`
- Manual `GET /caregiver` on a temporary dev server: HTTP 200 and served the Vue app.
- Manual `GET /` on the same server: HTTP 200 and preserved the owner app entry.
- Manual built-asset check confirmed `caregiver-public-shell`, `/caregiver` route detection, fragment token parsing, and owner WebSocket skipping are included.
- Manual Bearer-token caregiver summary request still returned permission-scoped activity and task summaries.

Known follow-ups:

- Fragment-token links are acceptable for local pairing because fragments are not sent to the server, but remote deployment still needs HTTPS and a real session model.
- The owner app still includes a local `看护` tab for testing; later auth/routing can hide that tab from normal owner workflows.
- Add an owner-side “copy caregiver link” action so Settings can generate `/caregiver#token=...` links without manual assembly.

## Phase 23: Owner-Side Caregiver Link Generation

Status: Complete

Completed:

- Extended the Settings caregiver token panel to generate a full caregiver entry link.
- Built the link from the current browser origin and the dedicated `/caregiver#token=<token>` entry.
- Added a read-only link field beside the one-time token so the owner can inspect or manually copy the link.
- Added a `复制看护链接` action using the browser Clipboard API.
- Added copy success and unsupported-browser status feedback.
- Kept the raw token one-time display unchanged for local debugging and fallback.
- Added styling for the pairing link field inside the existing compact Settings layout.

Validation:

- `npm run typecheck`
- `npm test` with 45 passing tests.
- `npm run build`
- Manual `GET /` on a temporary dev server: HTTP 200 and served the owner app.
- Manual `GET /caregiver` on the same server: HTTP 200 and served the dedicated caregiver entry.
- Manual caregiver upsert and token generation returned a valid one-time token.
- Manual Bearer-token caregiver summary request returned permission-scoped task summary data.
- Manual built-asset check confirmed `复制看护链接`, `/caregiver#token=`, Clipboard `writeText`, and pairing-link styles are included.

Known follow-ups:

- Clipboard API support depends on browser security context; the read-only link remains visible as a fallback.
- The generated local link is only correct for the current host/port. Future remote sharing should use a configured public base URL.
- Next pairing work should let the owner choose token expiry when generating a link.

## Phase 24: Caregiver Link Expiry Selection

Status: Complete

Completed:

- Added owner-side expiry selection before generating caregiver pairing links.
- Added preset expiry controls for 1, 7, 30, and 90 days.
- Added a custom expiry input bounded by the server's existing 1-365 day policy.
- Updated the web API helper to pass `expiresInDays` into `/api/caregivers/token`.
- Stored the selected expiry used for the generated token so the result panel remains stable if the owner changes the selector afterward.
- Kept token rotation, hash-only storage, revoke, Bearer access, and redacted caregiver summaries unchanged.
- Added Settings styles for compact expiry selection on desktop and mobile.

Validation:

- `npm run typecheck`
- `npm test` with 45 passing tests.
- `npm run build`
- Manual `GET /caregiver` on a temporary dev server: HTTP 200 and served the dedicated caregiver entry.
- Manual caregiver upsert and token generation with `expiresInDays: 7`.
- Manual token response returned `createdAt: 2026-05-09T06:45:48.899Z` and `expiresAt: 2026-05-16T06:45:48.899Z`.
- Manual Bearer-token caregiver summary request returned permission-scoped task summary data.
- Manual built-asset check confirmed the expiry selector, custom days input, `expiresInDays` payload, and generated-expiry display are included.

Known follow-ups:

- The custom input relies on server clamping for invalid values; a later frontend polish pass can show inline validation before submission.
- Remote deployment should use a configured public base URL for generated caregiver links instead of the current browser origin.
- The broader project is now ready for a full cross-feature review and regression checklist.

## Phase 25: Local API Security Boundary Tightening

Status: Complete

Completed:

- Ran a broad project review with a subagent focused on integration, caregiver privacy, API consistency, and test gaps.
- Removed permissive `Access-Control-Allow-Origin: *` headers from JSON API responses.
- Removed permissive CORS headers from default `OPTIONS` handling.
- Sanitized `GET /api/config` so caregiver token hashes are not returned.
- Sanitized `POST /api/config` caregiver entries before saving and returning config data.
- Removed query-parameter token fallback from `/api/caregiver/summary-token`; caregiver token access now requires `Authorization: Bearer <token>`.
- Made caregiver token expiry fail closed when `accessTokenExpiresAt` is missing or invalid.
- Added a runtime caregiver permission whitelist for currently implemented permissions.
- Filtered unsupported caregiver permissions such as unimplemented `remote-assist` and arbitrary strings.
- Added a repository `.gitignore` so `.env`, build outputs, dependency folders, and local agent state are not accidentally tracked.
- Added regression tests for CORS response headers, config sanitization, query-token rejection, invalid expiry rejection, and caregiver permission filtering.

Validation:

- `npm run typecheck`
- `npm run test -w @ablepath/server` with 46 passing server tests.
- `npm test` with all workspace tests passing.
- `npm run build`
- Manual cross-origin-style `GET /api/health` with `Origin: https://evil.example`: response had no `Access-Control-Allow-Origin`.
- Manual cross-origin-style `OPTIONS /api/health`: response had no CORS allow headers.
- Manual query-token caregiver summary request: returned `401`.
- Manual Bearer-token caregiver summary request: returned permission-scoped task summary data.
- Manual `GET /api/config` inspection: no `accessTokenHash` and no raw token string.

Known follow-ups:

- Owner APIs still do not have a real local owner authentication/session model; same-origin browser protection is only the local MVP boundary.
- `GET /api/caregiver/summary?caregiverId=` remains an owner-side local preview endpoint and should move behind an explicit owner-auth boundary before remote deployment.
- Web has no component tests yet; add tests for caregiver fragment token bootstrap, localStorage behavior, Settings link generation, and expiry controls.
- README is stale and still describes the Phase 0/1 foundation rather than the current Phase 25 scope.

## Phase 26: Local Owner Session Boundary

Status: Complete

Completed:

- Added a lightweight local owner session cookie for the owner app entry.
- Owner app static entry points set `ablepath_owner=<random>` with `HttpOnly`, `SameSite=Strict`, and `Path=/`.
- Excluded `/caregiver` and `/assets/*` from owner cookie issuance so caregiver pages cannot acquire owner session access.
- Required the owner session cookie for non-public `/api/*` routes at the HTTP boundary.
- Kept `GET /api/health` public.
- Kept `GET /api/caregiver/summary-token` public but still protected by `Authorization: Bearer <token>`.
- Protected `/ws/events` with the same owner session cookie.
- Added owner session helper tests for cookie creation, cookie validation, public API classification, and static route cookie issuance rules.

Validation:

- `npm run typecheck`
- `npm test` with 47 passing server tests and all workspace tests passing.
- `npm run build`
- Manual `GET /`: returned `Set-Cookie: ablepath_owner=...; HttpOnly; SameSite=Strict`.
- Manual `GET /caregiver`: returned no owner cookie.
- Manual `GET /api/config` without cookie: returned `401 Owner session required`.
- Manual `GET /api/config` with owner cookie from `/`: returned `200`.
- Manual `GET /api/config` with caregiver cookie jar from `/caregiver`: returned `401`.
- Manual Bearer-token caregiver summary request without owner cookie: returned permission-scoped task summary data.

Known follow-ups:

- This is a local-session boundary, not a user account system. Remote deployment still needs explicit owner authentication, HTTPS, and probably origin allow-listing.
- The owner session is generated per server process; reloading the page after restart refreshes it.
- Web still lacks component tests for caregiver fragment bootstrap, Settings link generation, and localStorage behavior.
- README still needs to be brought up to date with the current Phase 26 scope.

## Phase 27: README Current-State Documentation

Status: Complete

Completed:

- Replaced the stale Phase 0/1 README with a current Phase 26 project overview.
- Documented the current owner app, caregiver app, AI provider, voice, control, screen, task, emergency, and caregiver-token capabilities.
- Added repository layout documentation for `packages/shared`, `packages/core`, `apps/server`, `apps/web`, and `docs`.
- Documented Node 20+, host desktop tool, screenshot tool, and audio tool requirements.
- Documented `.env` usage and reminded that provider keys must not be committed.
- Added the current development and validation commands.
- Documented owner session cookie behavior, `/caregiver` Bearer-token flow, public API exceptions, and remote deployment caveats.
- Documented caregiver privacy boundaries and redacted summary rules.
- Documented safety boundaries for high-risk actions.
- Added known gaps: remote auth, web component tests, host tool validation, and public base URL needs.

Validation:

- `npm run typecheck`
- `npm test` with all workspace tests passing and 47 server tests.
- `npm run build`

Known follow-ups:

- Add web component tests for caregiver fragment bootstrap, localStorage behavior, Settings link generation, and expiry controls.
- Add a proper remote deployment design before exposing owner APIs outside localhost.
- Add an `.env.example` with placeholder provider variables.

## Phase 28: Environment Template

Status: Complete

Completed:

- Added `.env.example` with placeholder-only local runtime and provider variables.
- Covered server binding with `ABLEPATH_HOST` and `ABLEPATH_PORT`.
- Documented optional `ABLEPATH_HOME`.
- Documented `ABLEPATH_INACTIVITY_CHECK_MS` and how to disable the background checker.
- Added placeholders for `ARK_API_KEY`, `VOLC_ASR_APP_KEY`, and `VOLC_ASR_ACCESS_KEY`.
- Added optional voice/realtime tuning variables: `VOLC_ASR_RESOURCE_ID`, `STT_LANGUAGE`, `ASSISTANT_NAME`, and `DOUBAO_REALTIME_SPEAKER`.
- Updated README environment setup to tell developers to copy `.env.example` to `.env`.
- Confirmed `.gitignore` allows `.env.example` while ignoring real `.env` files.

Validation:

- `npm run typecheck`
- `npm test` with all workspace tests passing and 47 server tests.
- `npm run build`
- Manual inspection of `.env.example`: placeholder values only, no real provider credentials.

Known follow-ups:

- Add web component tests for caregiver fragment bootstrap, localStorage behavior, Settings link generation, and expiry controls.
- Add a remote deployment design document before any public-network exposure.

## Phase 29: Web Caregiver Access Helper Tests

Status: Complete

Completed:

- Extracted caregiver access helper logic from Vue components into `apps/web/src/caregiver-access.ts`.
- Added shared helper for reading `token` and `access_token` from URL fragments.
- Added shared helper for generating `/caregiver#token=...` pairing links with encoded token fragments.
- Added shared helpers for loading, saving, and clearing the caregiver token in browser storage.
- Updated `CaregiverView` to use the shared fragment and storage helpers.
- Updated `SettingsView` to use the shared pairing-link helper.
- Added the first web Vitest suite covering:
  - fragment token parsing
  - `access_token` compatibility
  - token trimming
  - pairing-link encoding
  - local storage save/load/clear
  - blank-token no-op behavior
- Updated README to note that helper-level web tests now exist while full component tests remain pending.

Validation:

- `npm run test -w @ablepath/web` with 4 passing web tests.
- `npm run typecheck`
- `npm test` with all workspace tests passing, including 47 server tests and 4 web tests.
- `npm run build`

Known follow-ups:

- Add actual Vue component tests for `CaregiverView` and `SettingsView` once a DOM test environment or Vue test utilities are introduced.
- Add tests for Settings expiry UI state transitions and copy-to-clipboard fallback behavior.
- Add tests around owner `/` versus caregiver `/caregiver` shell behavior.

## Phase 30: Web Link Copy and Expiry Helper Tests

Status: Complete

Completed:

- Extended `apps/web/src/caregiver-access.ts` with helper-level Settings logic.
- Added `normalizeCaregiverTokenDays` for frontend 1-365 day expiry clamping before token generation.
- Added `copyCaregiverPairingLink` to centralize Clipboard API behavior.
- Updated `SettingsView` to normalize `expiresInDays` before calling the token API.
- Updated `SettingsView` to use the shared copy helper for success, unsupported-browser, and error states.
- Added web tests for:
  - expiry day rounding
  - lower and upper expiry bounds
  - invalid expiry fallback to 30 days
  - Clipboard API success path
  - unsupported Clipboard API fallback message
  - Clipboard API failure reporting

Validation:

- `npm run test -w @ablepath/web` with 7 passing web tests.
- `npm run typecheck`
- `npm test` with all workspace tests passing, including 47 server tests and 7 web tests.
- `npm run build`

Known follow-ups:

- Add actual Vue component tests once a DOM test environment is added.
- Add tests around owner `/` versus caregiver `/caregiver` shell behavior.
- Add remote deployment design before public-network exposure.

## Phase 31: Web Owner and Caregiver Route Helper Tests

Status: Complete

Completed:

- Extracted owner/caregiver app-shell route decisions into `apps/web/src/app-routing.ts`.
- Added `isCaregiverPublicPath` to centralize dedicated caregiver route detection.
- Added `initialViewForPath` so `/caregiver` opens the caregiver view and owner routes open the dashboard.
- Added `shouldConnectOwnerEventStream` so caregiver public routes do not connect to owner WebSocket events.
- Added `buildEventWebSocketUrl` to centralize `ws` versus `wss` URL generation.
- Updated `App.vue` to use these shared helpers.
- Added web tests for:
  - caregiver public path detection
  - false positives such as `/caregivers`
  - initial owner/caregiver view selection
  - owner WebSocket connection gating
  - HTTP/HTTPS WebSocket URL generation

Validation:

- `npm run test -w @ablepath/web` with 11 passing web tests.
- `npm run typecheck`
- `npm test` with all workspace tests passing, including 47 server tests and 11 web tests.
- `npm run build`

Known follow-ups:

- Add actual Vue component tests once a DOM test environment is added.
- Add an MVP readiness checklist for real host validation: desktop control, screenshot capture, audio input/output, and caregiver pairing.
- Add remote deployment design before public-network exposure.

## Phase 32: MVP Readiness Diagnostics

Status: Complete

Completed:

- Added shared readiness types for local MVP capability status.
- Added owner-only `/api/readiness` to aggregate AI provider, voice, screen, computer-control, caregiver, and safety readiness.
- Added a Dashboard “MVP 就绪度” panel with ready, limited, and needs-setup totals plus item-level setup hints.
- Added styling for readiness summary and compact item rows.
- Added server API coverage for readiness aggregation.

Validation:

- `npm run typecheck`
- `npm run test -w @ablepath/server` with 48 passing server tests.
- `npm run test -w @ablepath/web` with 11 passing web tests.
- `npm test` with all workspace tests passing.
- `npm run build`
- Manual owner-session check: `GET /api/readiness` without the owner cookie returned 401.
- Manual owner-session check: after loading `/`, `GET /api/readiness` with the owner cookie returned AI ready, voice limited, screen needs setup, control limited, caregivers ready, and safety ready on this machine.

Known follow-ups:

- Add a real-host MVP validation checklist for desktop control, screenshot capture, audio input/output, provider keys, and caregiver pairing.
- Refine readiness scoring after testing on the target user machine.
- Add Vue component-level tests once a DOM test environment is introduced.

## Phase 33: MVP Host Validation Checklist

Status: Complete

Completed:

- Added shared MVP checklist response, section, item, and status types.
- Added owner-only `/api/mvp/checklist` for target-machine validation across AI provider keys, realtime keys, voice input/output, screen capture, desktop control, caregiver pairing, safety confirmation, and inactivity monitoring.
- Added Dashboard “MVP 主机验收” panel grouped by AI 能力, 目标电脑能力, and 家属与安全边界.
- Added checklist styling for pass, warning, and fail states.
- Added server API coverage for checklist sections, item IDs, totals, generated timestamp, and remediation next steps.

Validation:

- `npm run typecheck`
- `npm run test -w @ablepath/server` with 49 passing server tests.
- `npm run test -w @ablepath/web` with 11 passing web tests.
- `npm test` with all workspace tests passing, including 20 core tests, 49 server tests, and 11 web tests.
- `npm run build`
- Manual owner-session check: `GET /api/mvp/checklist` without the owner cookie returned 401.
- Manual owner-session check: after loading `/`, `GET /api/mvp/checklist` with the owner cookie returned 6 pass, 2 warning, and 2 fail on this machine.

Known follow-ups:

- Validate the checklist on the actual target desktop instead of this sandbox/WSL-like environment.
- Install and verify missing host dependencies where needed: recorder, TTS engine, screenshot backend, and `xdotool`.
- Add component-level Dashboard tests once the web test environment supports Vue rendering.

## Phase 34: MVP Validation Pass and Readiness Hardening

Status: Complete

Completed:

- Started a full MVP validation pass using an isolated `ABLEPATH_HOME` so manual checks did not modify the real local profile.
- Verified owner-session behavior: `/api/config` without owner cookie returned 401, `/` returned 200 and set the HttpOnly `ablepath_owner` cookie, and owner APIs returned 200 with that cookie.
- Verified caregiver public boundary: `/caregiver` served the app without setting the owner cookie, Bearer caregiver token access worked, caregiverId direct access without owner cookie returned 401, and query-token access returned 401.
- Verified CORS hardening: cross-origin API and preflight responses did not include permissive `Access-Control-*` headers.
- Verified real Doubao chat path with a minimal prompt returning `OK`.
- Verified local capability diagnostics: voice and screen reported setup errors on this machine, TTS degraded to `engine: "none"`, and computer control reported URL opening available with `xdotool` missing.
- Verified control and task confirmation boundaries with confirmed dry-run execution.
- Verified emergency pending/cancel flow in the isolated profile.
- Fixed validation findings that could mislead MVP readiness:
  - AI readiness now requires chat and vision provider readiness instead of any configured provider.
  - caregiver pairing now requires an unexpired valid token instead of only a stored token hash.
  - safety confirmation now checks the MVP-required actions: `click`, `type`, `hotkey`, and `openUrl`.
  - generic `/api/config` saves now preserve existing caregiver token secrets by caregiver id instead of silently revoking active links.
- Added server tests for realtime-only AI readiness, required safety confirmations, expired caregiver-pairing checklist status, and config-save token preservation.

Validation:

- `npm run typecheck`
- `npm run test -w @ablepath/server` with 51 passing server tests.
- `npm test` with all workspace tests passing, including 20 core tests, 51 server tests, and 11 web tests.
- `npm run build`
- Manual isolated service check on port 4326:
  - `/api/health` returned 200.
  - `/api/config` without owner cookie returned 401.
  - `/` returned 200 and set the owner cookie.
  - `/api/readiness` returned 2 ready, 3 limited, and 1 needs-setup before host tools are installed.
  - `/api/mvp/checklist` returned 4 pass, 3 warning, and 3 fail in a fresh isolated profile.
  - caregiver Bearer summary returned 200; caregiverId direct public access and query-token access returned 401.
  - unconfirmed control execution returned 400; confirmed dry-run returned 200 with skipped execution.
  - task confirmed dry-run completed without real GUI action.
  - SOS pending trigger returned a 30-second countdown and cancel returned normal state.
  - real `/api/chat` returned provider `doubao` with response `OK`.
- Manual post-fix service check on port 4327:
  - `/api/readiness` returned AI details as `chat ready · vision ready · realtime ready`.
  - `/api/mvp/checklist` kept caregiver pairing failed in a fresh profile with no token and safety confirmation passed with all MVP-required actions.

Known follow-ups:

- Real host validation is still required for microphone recording, TTS playback, screenshot capture, nonblank screen analysis, and `xdotool` desktop actions.
- Add browser-level caregiver component tests for fragment bootstrap, URL cleanup, localStorage, and token revoke/expiry behavior.
- Add a remote deployment design before exposing any owner or caregiver flow outside localhost.
- Consider returning a setup-specific 4xx status for missing host tools instead of 500 while keeping the current error body useful.

## Phase 35: Repeatable MVP Validation Runner

Status: Complete

Completed:

- Added `scripts/validate-mvp.mjs`, a repeatable local MVP validation runner.
- Added `npm run validate:mvp`, which builds the app, starts AblePath on an ephemeral localhost port, uses an isolated temporary `ABLEPATH_HOME`, and removes the temporary data by default.
- Covered key validation paths in the runner:
  - public `/api/health`
  - owner API 401 without cookie
  - owner shell cookie creation with `HttpOnly` and `SameSite=Strict`
  - caregiver shell without owner cookie
  - no permissive CORS headers for cross-origin API/preflight requests
  - config secret redaction
  - `/api/readiness` and `/api/mvp/checklist`
  - caregiver create, token generation, Bearer summary access, query-token rejection, and caregiverId public rejection
  - control plan confirmation and confirmed dry-run execution
  - task start and confirmed dry-run execution
  - SOS pending trigger and cancel
  - voice, screen, and control diagnostics
- Added optional `--with-ai` mode for a minimal real chat-provider check.
- Updated README validation docs with the new command and behavior.

Validation:

- `npm run typecheck`
- `npm test` with all workspace tests passing, including 20 core tests, 51 server tests, and 11 web tests.
- `npm run validate:mvp` with 26/26 validation checks passing.
- `npm run validate:mvp` also ran `npm run build` successfully as part of the command.

Known follow-ups:

- Run `npm run validate:mvp -- --with-ai` on the real target machine when provider-call cost and network access are acceptable.
- Extend the runner with real host action checks once microphone, speaker, screenshot backend, and `xdotool` are installed.
- Add browser-driven caregiver fragment tests; the current runner validates the HTTP token boundary, not the browser URL/localStorage behavior.

## Phase 36: Real Provider Chat and Vision Validation

Status: Complete

Completed:

- Extended `npm run validate:mvp -- --with-ai` to validate both real chat and real vision provider calls.
- Added a generated 16x16 PNG test image for the vision validation path so provider validation does not depend on host screenshot tools.
- Split Doubao model configuration into separate chat and vision model settings:
  - `DOUBAO_CHAT_MODEL`
  - `DOUBAO_VISION_MODEL`
  - optional `DOUBAO_BASE_URL`
- Kept the chat default on `doubao-seed-2-0-lite-260215`.
- Added a vision default of `doubao-seed-2-0-pro-260215`.
- Updated `.env.example` and README with the optional Doubao model overrides.
- Added provider unit coverage confirming that vision requests use the separate vision model.
- Improved the MVP validation runner so AI failures print the returned server error summary.

Validation:

- `npm run typecheck`
- `npm test` with all workspace tests passing, including 20 core tests, 52 server tests, and 11 web tests.
- `npm run validate:mvp` with 26/26 validation checks passing.
- First `npm run validate:mvp -- --with-ai` showed chat passing and vision failing because the original 1x1 test image was below the provider minimum image size.
- After switching to a 16x16 PNG, `npm run validate:mvp -- --with-ai` passed 28/28 checks, including real Doubao chat and real Doubao vision.

Known follow-ups:

- Validate real screen analysis with actual screenshots after a screenshot backend is installed.
- Add target-machine host checks for microphone recording, local TTS playback, and desktop actions.
- Add browser-driven caregiver fragment/localStorage tests.

## Phase 37: Caregiver Browser Bootstrap Helper Coverage

Status: Complete

Completed:

- Extracted caregiver browser bootstrap behavior into `bootstrapCaregiverToken`.
- Kept `CaregiverView` behavior unchanged while making the startup path testable without adding a DOM test dependency.
- Covered fragment-token startup behavior:
  - `#token=...` is preferred over saved localStorage tokens.
  - `#access_token=...` remains compatible.
  - fragment tokens trigger URL cleanup through `history.replaceState`.
  - fragment tokens do not overwrite the existing saved token unless the user explicitly saves.
- Covered saved-token startup behavior when no fragment token is present.
- Increased web helper tests from 11 to 14.

Validation:

- `npm run typecheck`
- `npm run test -w @ablepath/web` with 14 passing web tests.
- `npm test` with all workspace tests passing, including 20 core tests, 52 server tests, and 14 web tests.
- `npm run build`
- `npm run validate:mvp` with 26/26 validation checks passing.

Known follow-ups:

- Add actual Vue/browser rendering tests once a DOM test environment is introduced.
- Add a browser-driven caregiver flow that opens `/caregiver#token=...`, observes URL cleanup, and verifies summary rendering.
- Keep the current HTTP validation runner as the fast regression path for token boundaries.

## Phase 38: Setup-Required Host Error Responses

Status: Complete

Completed:

- Added HTTP error mapping for known missing-host-capability failures.
- Missing recorder, empty recording, missing STT config, missing screenshot backend, and empty screenshot errors now return:
  - HTTP `424`
  - `code: "setup-required"`
  - actionable `setupHints`
- Kept unexpected failures as HTTP `500`.
- Added server coverage for setup-required error mapping.
- Preserved the lower-level module errors so logs and tests still expose concrete failure messages.

Validation:

- `npm run typecheck`
- `npm run test -w @ablepath/server` with 53 passing server tests.
- `npm test` with all workspace tests passing, including 20 core tests, 53 server tests, and 14 web tests.
- `npm run build`
- `npm run validate:mvp` with 26/26 validation checks passing.
- Manual isolated service check on port 4328:
  - `POST /api/screen/capture` returned 424 with `code: "setup-required"` and screenshot setup hints.
  - `POST /api/listen` returned 424 with `code: "setup-required"` and recorder setup hints.

Known follow-ups:

- Surface `setup-required` responses more explicitly in the frontend UI instead of showing generic request failures.
- Extend the validation runner with optional real host checks after recorder, screenshot, and desktop-control tools are installed.
- Keep provider errors separate from host setup errors so model/API failures remain visible.

## Phase 39: Frontend Setup-Required Error Display

Status: Complete

Completed:

- Added `ApiRequestError` on the web side so API failures preserve HTTP status, error code, and setup hints.
- Added `isSetupRequiredError` and `errorMessage` helpers for consistent UI handling.
- Updated Chat voice recording errors to display setup hints when `/api/listen` returns `setup-required`.
- Updated Screen capture/analyze/target errors to display setup hints when screen APIs return `setup-required`.
- Added web tests for preserving and detecting setup-required API error metadata.
- Kept generic failures as normal error messages without setup hint UI.

Validation:

- `npm run typecheck`
- `npm run test -w @ablepath/web` with 16 passing web tests.
- `npm test` with all workspace tests passing, including 20 core tests, 53 server tests, and 16 web tests.
- `npm run build`
- `npm run validate:mvp` with 26/26 validation checks passing.

Known follow-ups:

- Add DOM/browser tests to verify the setup hint lists render in Chat and Screen views.
- Add real host validation after installing recorder and screenshot backends.
- Consider adding setup-required display to Tasks screen-advance flows if those become part of the MVP demo path.

## Phase 40: Current Host Hardware and Desktop Capability Validation

Status: Complete

Completed:

- Validated the current machine as the target host environment.
- Identified the host as WSL2 Ubuntu 24.04 on Linux `6.6.87.2-microsoft-standard-WSL2`.
- Confirmed WSLg-related environment variables are present:
  - `DISPLAY=:0`
  - `WAYLAND_DISPLAY=wayland-0`
  - `PULSE_SERVER=unix:/mnt/wslg/PulseServer`
- Confirmed `/dev/snd` is not present in the current Linux environment.
- Checked required host commands and found none of the following installed in the Linux environment:
  - audio input/output: `parecord`, `pactl`, `arecord`, `sox`, `rec`, `paplay`, `aplay`, `espeak-ng`, `espeak`
  - screenshot: `grim`, `scrot`, `gnome-screenshot`, ImageMagick `import`
  - desktop control: `xdotool`
  - URL opener: `xdg-open`
- Confirmed the project-local Node runtime remains available at `./node_modules/node/bin/node` version `20.19.0`; system `node` is `18.19.1`.
- Built and started AblePath with an isolated `ABLEPATH_HOME` to validate runtime capability reports on the current host.

Validation:

- `npm run build`
- Manual isolated service check on port 4330:
  - `/api/readiness` returned 2 ready, 3 limited, and 1 needs-setup.
  - `/api/mvp/checklist` returned 4 pass, 3 warning, and 3 fail.
  - `/api/voice/status` reported recording unavailable, TTS unavailable, realtime configured but unable to start because recording is unavailable.
  - `/api/screen/status` reported no screen capture backend.
  - `/api/control/status` reported URL opening available but desktop mouse/keyboard actions unavailable because `xdotool` is missing.
  - `POST /api/listen` returned 424 `setup-required` with recorder setup hints.
  - `POST /api/screen/capture` returned 424 `setup-required` with screenshot setup hints.
  - `POST /api/tts` returned `{ ok: true, engine: "none", spoken: false }`.
- `npm run validate:mvp` with 26/26 validation checks passing.

Current host conclusion:

- This machine is suitable for backend, web, AI provider, safety-boundary, caregiver, and dry-run control validation.
- This machine is not yet suitable for real hands-free MVP validation because microphone recording, local TTS playback, screenshot capture, and desktop mouse/keyboard control are not available in the current Linux/WSL environment.

Known follow-ups:

- Install and validate host tools before real hands-free trials:
  - audio recording/playback: `pulseaudio-utils`, `alsa-utils`, or `sox`
  - local TTS: `espeak-ng`
  - screenshots: `grim`, `scrot`, `gnome-screenshot`, or ImageMagick
  - desktop control: `xdotool`
- Re-run `/api/voice/status`, `/api/screen/status`, `/api/control/status`, and `npm run validate:mvp` after installing tools.
- If WSL cannot expose the needed desktop/audio/control surface reliably, move real host validation to a native Linux desktop or Windows-native control adapter.

## Phase 41: WSL PowerShell Screenshot and TTS Fallback

Status: Complete

Completed:

- Attempted to prepare the current WSL host for real capability validation.
- Confirmed `apt-get` is available and `xdg-utils` is installed, but package installation could not proceed because `sudo` requires an interactive password outside the agent.
- Verified Windows interop is available from WSL:
  - `powershell.exe`
  - `cmd.exe`
  - `explorer.exe`
- Proved a PowerShell screenshot command can capture the Windows desktop and save a PNG into the WSL filesystem.
- Proved Windows SAPI speech synthesis can run from WSL via PowerShell.
- Added a `powershell` screen capture backend for Linux/WSL when Linux screenshot tools are missing.
- Added a `powershell` TTS engine fallback when `say`, `espeak-ng`, and `espeak` are unavailable.
- Kept Linux-native tools preferred before the WSL fallback.

Validation:

- `npm run typecheck`
- `npm run test -w @ablepath/server` with 53 passing server tests.
- `npm run build`
- Manual isolated service check on port 4331:
  - `/api/screen/status` returned `canCapture: true`, `backend: "powershell"`.
  - `POST /api/screen/capture` returned 200 with `backend: "powershell"`, a 4.7 MB PNG, and base64 image data.
  - `/api/voice/status` returned TTS `canSpeak: true`, `engine: "powershell"`.
  - `POST /api/tts` returned `{ ok: true, engine: "powershell", spoken: true }`.
  - `/api/readiness` improved to 3 ready, 3 limited, and 0 needs-setup.
  - `/api/mvp/checklist` improved to 6 pass, 2 warning, and 2 fail.
- `npm test` with all workspace tests passing, including 20 core tests, 53 server tests, and 16 web tests.
- `npm run validate:mvp` with 26/26 validation checks passing; diagnostics now report `tts=true` and `capture=true`.

Current host conclusion:

- Current WSL host can now validate screenshot capture and local TTS through Windows PowerShell.
- Current WSL host still cannot validate hands-free voice input because no recorder backend is installed or exposed.
- Current WSL host still cannot validate desktop mouse/keyboard actions because no desktop-control backend is available; `xdotool` is still missing and may not be enough for Wayland/WSLg.

Known follow-ups:

- Install or add a Windows/WSL recording bridge before validating realtime voice input.
- Add a Windows/WSL desktop-control adapter if WSLg cannot support `xdotool` reliably.
- Re-run `npm run validate:mvp -- --with-ai` after any further host capability changes.

## Phase 42: Windows Move and UI-TARS Reference Assessment

Status: Complete

Completed:

- Evaluated whether moving AblePath from WSL into a Windows-native directory would solve the remaining host capability gaps.
- Inspected the newly downloaded `UI-TARS-main` project.
- Confirmed `UI-TARS-main` is primarily:
  - a GUI action model/prompt reference,
  - a Python action parser,
  - a coordinate conversion helper,
  - a pyautogui code generator.
- Confirmed `UI-TARS-main` is not itself the local desktop-control client; its README points local-device operation to `UI-TARS-desktop`.
- Confirmed UI-TARS action coverage overlaps with AblePath’s intended control surface:
  - click
  - double click
  - right click
  - drag
  - hotkey
  - type
  - scroll
  - wait
  - finished
- Identified useful ideas to absorb into AblePath:
  - a stricter GUI-agent prompt format with explicit `Thought` and `Action`
  - normalized action output parsing
  - coordinate scaling from model-space to screenshot-space
  - multi-step action history for screen-driven tasks
  - keeping generated actions inside a typed allowlist before execution

Windows migration assessment:

- Moving the project files to Windows alone will not automatically solve the remaining gaps.
- Windows-native runtime should make screenshot, TTS, audio, and desktop control easier to support, but AblePath still needs explicit Windows adapters.
- Current AblePath behavior if simply run under native Windows:
  - `openUrl` likely works through `cmd /c start`.
  - existing WSL PowerShell screenshot/TTS fallbacks are implemented on the Linux/WSL path and would need small `win32` detection changes to work natively.
  - microphone recording is still not implemented for Windows-native audio capture.
  - mouse/keyboard desktop control is still not implemented for Windows-native `SendInput` or pyautogui.

Recommendation:

- Do not directly merge `UI-TARS-main` into AblePath as a dependency.
- Use it as a reference for prompt/action schema and coordinate parsing.
- If we want a ready-made local desktop app, inspect `UI-TARS-desktop` separately.
- For AblePath MVP, the safer integration path is:
  - keep AblePath’s confirmation boundary and typed `ActionPlan`
  - add a Windows desktop-control adapter under our executor
  - optionally add a UI-TARS-style parser that converts model output into AblePath `ActionPlan` steps
  - avoid executing generated pyautogui code strings directly

Validation:

- Read-only inspection of `UI-TARS-main/README.md`.
- Read-only inspection of `UI-TARS-main/codes/README.md`.
- Read-only inspection of `UI-TARS-main/codes/pyproject.toml`.
- Read-only inspection of `UI-TARS-main/codes/ui_tars/action_parser.py`.
- Read-only inspection of `UI-TARS-main/codes/ui_tars/prompt.py`.

Known follow-ups:

- Inspect `UI-TARS-desktop` if the goal is to borrow a production desktop-control runtime.
- Add Windows-native screenshot/TTS detection so the existing PowerShell fallback works outside WSL too.
- Add Windows-native recording and mouse/keyboard control adapters before moving real trials to Windows.

## Phase 43: Windows Native Screenshot, TTS, and Control Adapter

Status: Complete

Completed:

- Added native Windows PowerShell screenshot support:
  - detects `powershell.exe` or `powershell` on `win32`
  - keeps the WSL `powershell.exe` plus `wslpath` bridge
  - captures the primary screen or requested region with `System.Windows.Forms` and `System.Drawing`
  - saves PNG screenshots into AblePath's existing screenshot directory
- Added native Windows TTS command selection:
  - detects both `powershell.exe` and `powershell`
  - uses Windows SAPI through `System.Speech.Synthesis.SpeechSynthesizer`
  - keeps existing macOS and Linux TTS engines first
- Added Windows desktop-control execution behind AblePath's existing `ActionPlan` boundary:
  - `click` through `user32.dll` cursor positioning and mouse events
  - `scroll` through Windows mouse wheel events
  - `type` through clipboard plus `Ctrl+V`
  - `hotkey` through `System.Windows.Forms.SendKeys`
  - `switchWindow` through `Alt+Tab`
  - `openUrl` remains handled by the existing platform opener path
- Updated control readiness so Windows/WSL PowerShell desktop control reports click/type/hotkey/scroll/switchWindow capability.
- Added unit coverage for AblePath hotkey arrays to Windows SendKeys token mapping.
- Added [Windows adapter design and acceptance notes](./WINDOWS_ADAPTERS.md).
- Inspected the newly downloaded `UI-TARS-desktop-main` project:
  - confirmed it includes a real local computer operator based on `@computer-use/nut-js`
  - identified `packages/ui-tars/operators/nut-js/src/index.ts` and `multimodal/gui-agent/operator-nutjs/src/NutJSOperator.ts` as useful references
  - confirmed it supports screenshot, click, right click, double click, drag, type, hotkey, press/release, scroll, wait, finished, and call-user actions
  - confirmed its Windows text-entry strategy also uses clipboard plus `Ctrl+V`

Validation:

- `npm run typecheck`
- `npm run test -w @ablepath/server` with 54 passing server tests.
- `npm test` with all workspace tests passing, including 20 core tests, 54 server tests, and 16 web tests.
- `npm run build`
- `npm run validate:mvp` with 26/26 validation checks passing after running with local port-listen permission:
  - readiness improved to 4 ready, 2 limited, and 0 needs-setup on the current WSL/Windows host
  - checklist improved to 7 pass, 1 warning, and 2 fail
  - voice diagnostics reported `record=false tts=true`
  - screen diagnostics reported `capture=true`
  - control diagnostics reported `openUrl=true desktop=true`

Current host conclusion:

- The current WSL host can now validate Windows-backed screenshot capture, local TTS, and desktop-control readiness through PowerShell.
- Real desktop-control actions were not executed during automated validation; validation used dry-run execution for safety.
- Moving the project to native Windows should reduce WSL filesystem and host-access friction, but Windows microphone recording still needs a dedicated adapter before full hands-free MVP validation.

Progress summary:

- MVP backend, web UI, caregiver boundary, provider config, screen capture, TTS, and dry-run control flow are implemented and passing automated validation.
- Windows-native screenshot/TTS/control support is now implemented enough for Windows-side Codex continuation and manual host acceptance.
- Remaining MVP gap is mainly real microphone recording/realtime input on Windows plus careful manual verification of real desktop actions.

Known follow-ups:

- Add a Windows-native audio recording adapter, likely through PowerShell/.NET, Media Foundation, or a small Node/native helper.
- On native Windows, manually validate:
  - `/api/screen/status`
  - `/api/screen/capture`
  - `/api/voice/status`
  - `/api/tts`
  - `/api/control/status`
  - confirmed low-risk `type`, `hotkey`, and `scroll` actions in Notepad or another harmless window
- Consider an optional future `nut-js` backend inspired by UI-TARS Desktop when AblePath needs drag, double click, right click, high-DPI coordinate normalization, or richer multi-monitor support.
- Keep UI-TARS-style actions behind AblePath's typed executor and confirmation boundary; do not execute raw model-generated code or arbitrary action strings directly.

## Phase 44: README Handoff Documentation

Status: Complete

Completed:

- Rewrote `README.md` into a full handoff document for another Codex or developer.
- Added project origin and product-position context:
  - why the project moved away from a nanoclaw-based rebuild
  - why AblePath should stay decoupled from any single Agent SDK
  - the intended language around autonomy, choice, calm control, and family reassurance
- Added current MVP status through Phase 43, including latest validation results.
- Added a detailed repository file tree with comments for key files.
- Added architecture, requirements, environment, development commands, access model, caregiver privacy, safety boundary, host adapters, UI-TARS reference notes, validation details, Windows handoff steps, known gaps, next steps, and working rules for the next Codex.
- Explicitly documented that old nanoclaw files are deprecated reference only and that files should not be moved to Windows by the agent unless the user asks.

Validation:

- Read back `README.md` in two sections to verify Markdown structure and handoff coverage.
- `wc -l README.md` confirmed the handoff document is 527 lines.
- No code or runtime behavior changed in this phase.

Progress summary:

- The project can now be handed to a Windows-side Codex with enough context to continue without the prior conversation.
- The immediate next engineering phase remains Windows-native audio recording plus native Windows hardware/desktop acceptance.

Known follow-ups:

- After moving to native Windows, run the README handoff steps and update this plan with Windows-specific validation results.
- Keep `README.md` updated when the next major adapter or MVP acceptance milestone changes the project state.

## Phase 45: Windows Native Audio Recording Adapter

Status: Complete

Completed:

- Added a Windows/WSL PowerShell audio backend in `apps/server/src/voice/audio.ts`.
- Kept existing Linux recorder preference order: `parecord`, `arecord`, then `sox`.
- Added native Windows detection through `powershell.exe` or `powershell`.
- Added WSL fallback detection through `powershell.exe` when Windows interop is available.
- Implemented a PowerShell `Add-Type` inline C# helper using `winmm.dll` `waveIn*` APIs.
- Implemented default microphone capture as 16kHz, 16-bit, mono PCM.
- Connected Windows `recordAudio()` to write WAV files for `/api/listen`.
- Connected Windows `createRawMicProcess()` to stream raw PCM bytes on stdout for realtime voice input.
- Converted WSL output paths with `wslpath -w` before PowerShell writes WAV files.
- Updated audio device/backend types to include `powershell`.
- Updated voice setup hints and setup-required error hints so Windows users see PowerShell/microphone guidance instead of Linux-only recorder guidance.
- Added server test coverage for generated Windows WAV/raw PCM recorder scripts.
- Updated `README.md` and `docs/WINDOWS_ADAPTERS.md` with the new audio adapter design and acceptance notes.

Validation:

- `node --check apps/server/src/voice/audio.ts`
- `node --check packages/shared/src/index.ts`
- `node --check apps/server/test/voice.test.ts`
- TypeScript `transpileModule` syntax checks for:
  - `apps/server/src/voice/audio.ts`
  - `apps/server/src/app.ts`
  - `packages/shared/src/index.ts`
  - `apps/server/test/voice.test.ts`
- Direct Windows PowerShell compile check for the inline WinMM recorder helper succeeded.
- Direct Windows PowerShell smoke test recorded a 1-second WAV file successfully:
  - output file existed
  - size was 28,844 bytes
- Direct Windows PowerShell raw PCM smoke test produced 28,800 bytes after a short startup/recording interval.

Validation limitations:

- Full `npm run typecheck`, `npm test`, `npm run build`, and `npm run validate:mvp` could not run in this shell because `npm` is not on PATH.
- The current copied `node_modules` tree is not a clean Windows install:
  - workspace package entries under `node_modules/@ablepath` are zero-byte files instead of links
  - `tsx`/`esbuild` reports a Linux binary package (`@esbuild/linux-x64`) on Windows, where `@esbuild/win32-x64` is required
- `/api/listen` and realtime voice were not validated through the running server in this phase.

Current host conclusion:

- Native Windows microphone capture is now implemented enough for app-level acceptance.
- The low-level Windows recording path works on this host through PowerShell and WinMM.
- Realtime microphone input has a working raw PCM source, but full realtime conversation still needs server-level validation and native Windows audio output acceptance.

Known follow-ups:

- Run a fresh `npm install` on native Windows to repair workspace links and install Windows-native optional packages.
- Run the normal validation baseline:
  - `npm run typecheck`
  - `npm test`
  - `npm run build`
  - `npm run validate:mvp`
- Start AblePath and verify:
  - `/api/voice/status` reports audio `backend: "powershell"` and `canRecord: true`
  - `/api/listen` records and transcribes a short phrase with real ASR credentials
  - realtime voice starts and receives microphone input
- Validate native Windows realtime playback behavior; add a Windows raw speaker path if needed.
- Continue with cautious native Windows desktop-control acceptance in Notepad or another harmless target.

## Phase 46: Windows Native Realtime Speaker Playback

Status: Complete

Completed:

- Added Windows/WSL PowerShell raw speaker playback in `apps/server/src/voice/audio.ts`.
- Kept existing Linux playback preference order: `paplay`, then `aplay`.
- Reused the Phase 45 PowerShell/WinMM helper surface.
- Added an inline C# `NativeSpeaker` helper using `winmm.dll` `waveOut*` APIs.
- Connected `createRawSpeakerProcess()` to start a PowerShell child process on Windows/WSL when Linux playback tools are unavailable.
- Implemented playback for 24kHz, 16-bit, mono PCM from stdin, matching the realtime model output format used by `DoubaoRealtimeSession`.
- Added server test coverage for generated Windows raw speaker scripts.
- Updated `README.md` and `docs/WINDOWS_ADAPTERS.md` with realtime playback notes.

Validation:

- `node --check apps/server/src/voice/audio.ts`
- `node --check apps/server/test/voice.test.ts`
- TypeScript `transpileModule` syntax checks for:
  - `apps/server/src/voice/audio.ts`
  - `apps/server/test/voice.test.ts`
- Direct Windows PowerShell compile check for the combined WinMM recorder/speaker helper succeeded.
- Direct Windows PowerShell smoke test played 9,600 bytes of 24kHz mono PCM silence and exited with status 0.

Validation limitations:

- Full `npm run typecheck`, `npm test`, `npm run build`, and `npm run validate:mvp` still could not run because `npm` is not on PATH.
- The existing `node_modules` tree is still a Linux/WSL snapshot and needs a fresh native Windows install.
- Full realtime voice was not validated through the running AblePath server with real provider credentials.

Current host conclusion:

- AblePath now has native Windows low-level paths for realtime microphone input and realtime speaker output.
- The remaining Windows MVP work is mostly acceptance and dependency hygiene rather than another missing audio adapter.

Known follow-ups:

- Run a fresh native Windows `npm install`.
- Run the full validation baseline.
- Start AblePath and validate realtime voice end-to-end:
  - microphone PCM reaches the realtime session
  - model PCM output plays through the Windows speaker
  - stopping the session cleans up PowerShell helper processes
- Continue native Windows desktop-control acceptance with low-risk Notepad actions.

## Phase 47: Native Windows Dependency Repair and MVP Validation

Status: Complete

Completed:

- Confirmed the Windows PATH had Codex's bundled `node.exe` but no system `npm`, `npx`, or `corepack`.
- Downloaded the official Node.js 20.19.0 Windows x64 zip into `.tools/`.
- Extracted the local Node runtime and verified:
  - `node` v20.19.0
  - `npm` 10.8.2
- Re-ran `npm install` with the local Node runtime first on PATH.
- Repaired Windows workspace dependency links and Windows-native optional packages after the earlier Linux/WSL `node_modules` snapshot.
- Added `.tools/` and local AblePath log files to `.gitignore`.
- Added `scripts/start-windows-demo.ps1` as a simple built-server launcher for demo use when system npm is unavailable.
- Ran real HTTP host diagnostics through a one-shot AblePath server start/close cycle.
- Updated `README.md` with Phase 47 status, local Node commands, and demo-focused next steps.

Validation:

- `.\.tools\node-v20.19.0-win-x64\npm.cmd install` passed after putting the local Node directory first on PATH.
- `npm run typecheck` passed through the local npm runtime.
- `npm test` passed:
  - 20 core tests
  - 55 server tests
  - 16 web tests
- `npm run build` passed.
- `npm run validate:mvp` passed 26/26.
- MVP validation diagnostics on native Windows:
  - readiness: 5 ready / 1 limited / 0 needs-setup
  - MVP checklist: 8 pass / 1 warning / 1 fail
  - voice diagnostics: `record=true tts=true`
  - screen diagnostics: `capture=true`
  - control diagnostics: `openUrl=true desktop=true`
- One-shot HTTP diagnostics against a real AblePath server reported:
  - health OK
  - voice audio `backend: "powershell"`, `canRecord: true`
  - TTS `engine: "powershell"`, `canSpeak: true`
  - realtime `configured: true`, `canStart: true`
  - screen capture `backend: "powershell"`, `canCapture: true`
  - control click/type/hotkey/scroll/openUrl/switchWindow all available

Validation limitations:

- A persistent background server process could not be kept alive from the Codex sandbox tool after the shell command returned, but foreground startup works:
  - `powershell -ExecutionPolicy Bypass -File .\scripts\start-windows-demo.ps1`
- `/api/listen` was not transcribed with live spoken input during this phase.
- Realtime voice was not exercised end-to-end with real spoken input and model audio output.
- Real desktop-control actions were still not executed, only dry-run/control readiness paths were validated.

Current host conclusion:

- The Windows runtime, dependency tree, host diagnostics, and automated MVP baseline are now demo-ready.
- The remaining risks before tonight's demo are live voice behavior and cautious real desktop action acceptance, not missing adapters.

Known follow-ups:

- Before the demo, open a normal terminal in `ablepath/` and run:
  - `powershell -ExecutionPolicy Bypass -File .\scripts\start-windows-demo.ps1`
  - open `http://localhost:4317`
- Run a live `/api/listen` or Chat recording trial with a short spoken phrase.
- Start realtime voice and confirm microphone input plus speaker output.
- Open Notepad and validate one confirmed low-risk `type` plan and one confirmed low-risk `hotkey` plan.
- Keep destructive shortcuts and real purchasing/submission flows out of the demo.

## Phase 48: Agent Core API and Desktop Assistant Architecture Pivot

Status: Complete

Completed:

- Repositioned the natural-language control path around an Agent Orchestrator instead of the old rule-based `/api/control/plan` entry.
- Added shared Agent types:
  - `AgentSession`
  - `AgentStep`
  - `AgentToolCall`
  - `AgentPlanPreview`
  - `AgentExecutionState`
  - Agent command/confirm/step/stop/list responses
- Added Agent WebSocket events:
  - `agent.session.changed`
  - `agent.plan.created`
  - `agent.action.started`
  - `agent.action.finished`
  - `agent.needs.confirmation`
  - `agent.error`
- Added local Agent session persistence in `data/agent-sessions.json`.
- Added AI planning prompt builder that requires JSON-only output and maps model output into AblePath `ActionPlan`.
- Extended typed action parsing and execution with v1 Agent actions:
  - `wait`
  - `finished`
  - `callUser`
- Added `/api/agent/recent`, `/api/agent/command`, `/api/agent/confirm`, `/api/agent/step`, and `/api/agent/stop`.
- `/api/agent/command` now supports optional current desktop screenshot context through the existing screen capture + vision provider path.
- `/api/agent/confirm` preserves the confirmation boundary for real execution and supports dry-run for plan validation.
- Converted the Web Chat view into an Agent Console that can:
  - generate AI action previews
  - include current screen context
  - dry-run
  - confirm real execution
  - continue one step
  - stop an Agent session
  - use existing short recording as a voice-to-command draft
- Added a desktop assistant scaffold under `apps/desktop/` documenting the Electron floating-ball/tray target and local Agent API boundary.

Validation:

- `npm run typecheck` passed after the core/server/API/Web changes.
- `npm test` passed:
  - 22 core tests
  - 57 server tests
  - 16 web tests
- `npm run build` passed.
- `npm run validate:mvp` passed 26/26.
- Added core tests for:
  - Baidu search multi-action AI plan parsing
  - `wait`/`finished`/`callUser` normalization
- Added server API tests for:
  - `/api/agent/command`
  - `/api/agent/confirm` dry-run
  - `/api/agent/stop`

Current conclusion:

- The old Control page remains as a diagnostic/rule-planner surface, but it is no longer the intended main natural-language control path.
- The main path is now Agent Console and the new Agent API.
- "打开 www.baidu.com 并搜索 1+1" is now supported when the AI planner returns structured actions: `openUrl` + `type` + `hotkey enter`.

Known follow-ups:

- Start the app and manually test the new Agent Console on Windows.
- Add native Electron and `@computer-use/nut-js` dependencies in a dedicated native dependency phase.
- Implement the nut-js screenshot/control backend with scale-factor aware coordinate conversion.
- Add Dashboard readiness/agent status widgets and Settings controls for provider, voice devices, and control backend selection.
- Keep caregiver APIs separate and do not expose raw Agent sessions, screenshots, raw model output, or remote control.

## Phase 49: Demo Readiness Self-Check for Agent Console

Status: Complete

Completed:

- Added optional `provider` and `env` injection to `startAblePathServer()` so HTTP-level checks can run with a mock provider while production startup still uses the real environment/provider path.
- Added `scripts/check-windows-demo.mjs`.
- Added `npm run check:demo`.
- The demo check starts the built AblePath server on an ephemeral local port and verifies:
  - health API
  - owner Web shell loads
  - owner shell sets the `ablepath_owner` cookie
  - `/api/agent/recent` is owner-accessible
  - `/api/agent/command` creates a confirmation-gated plan for "打开 www.baidu.com 并搜索 1+1"
  - the plan normalizes to `openUrl`, `type`, `hotkey`
  - `/api/agent/confirm` dry-run succeeds without real desktop actions

Validation:

- `npm run typecheck` passed.
- `npm run check:demo` passed.
- `npm test` passed:
  - 22 core tests
  - 57 server tests
  - 16 web tests
- `npm run validate:mvp` passed 26/26.

Current conclusion:

- There is now a fast demo-focused smoke test for the exact gap found earlier: natural language to Agent plan for Baidu search.
- This smoke test does not require external AI credentials or live network model calls, so it is safe to run before a presentation.

Known follow-ups:

- Add a real-provider manual Agent Console test before the demo if model credentials/network are available.
- Keep real desktop execution manual and confirmation-gated; use dry-run first.

## Phase 50: Browser Operation Semantics and Web Entry Cleanup

Status: Complete

Decision:

- Do not build the floating ball before the Agent loop and Web entry semantics are clean.
- The floating ball should be a thin desktop entrypoint over the same `/api/agent/*` safety boundary.
- The Web app remains useful for settings, status, diagnostics, and caregiver management, but not as the primary assistive operating surface.

Completed:

- Clarified the old Web Control page as `Control Diag`.
  - It remains useful for executor readiness, rule-planner checks, dry-run checks, and low-level host diagnostics.
  - It is no longer the main natural-language control path.
- Clarified the old Screen page as `Screen Diag`.
  - It remains useful for screenshot/capture/target-detection diagnostics.
  - Agent can already request screen context through `/api/agent/command` and `/api/agent/step`.
- Updated the main Web nav labels:
  - `Agent` is now the primary command console.
  - `Control Diag` and `Screen Diag` are explicitly diagnostic surfaces.
- Improved Agent Console copy for the intended loop:
  - open Chrome / web page
  - use natural language for the next web operation
  - generate the next step with current screen context
- Added Chrome-specific URL planning support:
  - AI can emit `openUrl` with `params.browser = "chrome"`.
  - The parser preserves the Chrome hint.
  - The Windows executor tries Chrome first and falls back to the default URL opener when needed.
- Updated the Agent planning prompt to describe webpage step loops:
  - use `openUrl` for navigation
  - then use screenshot context plus `click`, `type`, `hotkey`, `scroll`, and `wait` for each next web operation

Validation:

- `npm run typecheck` passed.
- `npm run check:demo` passed, including Chrome browser hint preservation.
- `npm test` passed:
  - 23 core tests
  - 57 server tests
  - 16 web tests
- `npm run validate:mvp` passed 26/26.

Current conclusion:

- AblePath now has a clearer operation model:
  - Agent Console: primary natural-language control loop
  - Control Diag: low-level rule/executor diagnostics
  - Screen Diag: low-level screenshot/vision diagnostics
  - Future Floating Ball: desktop voice/text shell over the same Agent API
- The next high-value phase is the desktop floating ball scaffold with no direct execution bypass, followed by native nut-js backend installation and acceptance.

Known follow-ups:

- Build the Electron floating ball against `/api/agent/command`, `/api/agent/step`, `/api/agent/confirm`, and `/api/agent/stop`.
- Add a Chrome/web manual acceptance script:
  - open Chrome to Baidu
  - generate next step from screen context
  - type/search
  - scroll/click harmless results
- Add nut-js backend with screenshot scale-factor metadata and coordinate conversion.

## Phase 51: Desktop Floating Ball Shell

Status: Complete

Completed:

- Replaced the desktop placeholder with a concrete Electron shell structure under `apps/desktop/`.
- Added `apps/desktop/src/main.cjs`:
  - frameless always-on-top assistant window
  - tray menu
  - hide/show/quit controls
  - local server URL configuration through `ABLEPATH_SERVER_URL`
- Added `apps/desktop/src/preload.cjs`:
  - bootstraps an owner session by loading the local Web shell
  - calls owner-only APIs with the `ablepath_owner` cookie
  - exposes only safe API methods to the renderer
  - supports Agent command, next step, confirm, stop, recent sessions, health, and SOS
- Added renderer UI:
  - floating orb state indicator
  - command input
  - include-screen toggle
  - Plan / Next / Dry-run / Confirm / Stop / SOS controls
  - plan preview with steps and risk/status
- Added `apps/desktop/scripts/check-desktop.mjs` and `@ablepath/desktop` test script.
- Updated `package-lock.json` so the desktop workspace is recognized.

Validation:

- `npm install --package-lock-only` completed and added the desktop workspace to the lockfile.
- `npm run typecheck` passed.
- `npm test` passed:
  - 23 core tests
  - desktop scaffold check
  - 57 server tests
  - 16 web tests
- `npm run validate:mvp` passed 26/26.

Current conclusion:

- The floating ball is now an implemented desktop shell scaffold, not just documentation.
- It still cannot be launched until Electron is installed in the native dependency phase.
- It does not execute actions directly; it calls the same local Agent API and confirmation boundary as the Web Agent Console.

Known follow-ups:

- Install Electron for `@ablepath/desktop` and run the shell locally.
- Add push-to-talk by calling the server `/api/listen` path from the desktop shell.
- Add a desktop smoke test once Electron is installed.
- Then add nut-js as the native screenshot/control backend.

## Phase 52: Electron Desktop Dependency and Windows Launcher

Status: Complete

Completed:

- Installed Electron for `@ablepath/desktop`.
- Verified Electron is available locally:
  - `node_modules\.bin\electron.cmd --version` returned `v41.5.1`.
- Added `.npm-cache/` to `.gitignore` for local install cache hygiene.
- Added `scripts/start-windows-desktop.ps1`.
- The desktop launcher:
  - checks local Node
  - checks built server output
  - checks Electron installation
  - starts the built AblePath server on `http://127.0.0.1:4317` if it is not already running
  - launches the Electron desktop shell with `ABLEPATH_SERVER_URL=http://127.0.0.1:4317`
- Updated `apps/desktop/README.md` with the Windows launch command.

Validation:

- Electron install completed with 0 vulnerabilities.
- PowerShell parser check for `scripts/start-windows-desktop.ps1` passed.
- `npm test -w @ablepath/desktop` passed.
- `npm run typecheck` passed.
- `npm test` passed:
  - 23 core tests
  - desktop scaffold check
  - 57 server tests
  - 16 web tests
- `npm run check:demo` passed.
- `npm run validate:mvp` passed 26/26.

Validation limitations:

- The Electron GUI was not automatically launched from this Codex turn to avoid interrupting the active desktop with a visible window.
- Real desktop floating-ball interaction still needs a manual launch/acceptance pass.

Current conclusion:

- The desktop floating-ball shell is now installable and launchable on this Windows machine.
- It still routes through the local Agent API and does not bypass confirmation or backend safety boundaries.

Known follow-ups:

- Manually launch:
  - `powershell -ExecutionPolicy Bypass -File .\scripts\start-windows-desktop.ps1`
- Test the desktop shell command:
  - `打开 Chrome，访问 www.baidu.com，并搜索 1+1`
- Add push-to-talk using server `/api/listen`.
- Add a real Electron smoke test or manual acceptance checklist.
- Add `@computer-use/nut-js` backend after the shell is manually accepted.

## Phase 53: Desktop Listen Button

Status: Complete

Completed:

- Added a desktop `Listen` button to the Electron floating-ball shell.
- Added the `listening` state to desktop renderer behavior and scaffold checks.
- Exposed `listen(durationSec)` from `apps/desktop/src/preload.cjs`.
- The desktop Listen button calls the server owner API:
  - `POST /api/listen`
  - default duration: 5 seconds
- Recognized text is written into the desktop command box so the user can review/edit it before pressing `Plan`.
- This keeps the execution boundary unchanged:
  - speech recognition only drafts a command
  - Agent planning still goes through `/api/agent/command`
  - real execution still requires preview/confirmation

Validation:

- `npm test -w @ablepath/desktop` passed.
- `npm run typecheck` passed.
- `npm test` passed:
  - 23 core tests
  - desktop scaffold check
  - 57 server tests
  - 16 web tests
- `npm run check:demo` passed.
- `npm run validate:mvp` passed 26/26.

Current conclusion:

- The desktop shell now has the first usable voice entry point.
- It is deliberately button-based rather than wake-word based for stability and demo safety.

Known follow-ups:

- Manually launch the Electron shell and test Listen with real microphone/provider credentials.
- Add hold-to-talk interaction polish.
- Add TTS feedback for plan previews and errors.
- Add wake-word only after button/hold-to-talk is accepted.

## Phase 54: Desktop Speak Feedback

Status: Complete

Completed:

- Added a desktop `Speak` button to the Electron floating-ball shell.
- Exposed `speak(text, priority)` from `apps/desktop/src/preload.cjs`.
- The desktop Speak button calls the server owner API:
  - `POST /api/tts`
- Speak chooses the most useful current text:
  - current plan explanation
  - current session error
  - current notice
  - current command text
- Errors are spoken with high priority when selected.
- TTS remains explicit button-based for now; the shell does not auto-speak every event.

Validation:

- `npm test -w @ablepath/desktop` passed.
- `npm run typecheck` passed.
- `npm test` passed:
  - 23 core tests
  - desktop scaffold check
  - 57 server tests
  - 16 web tests
- `npm run check:demo` passed.
- `npm run validate:mvp` passed 26/26.

Current conclusion:

- The desktop shell now supports both voice input and voice output through the server APIs.
- It still preserves the review/confirmation boundary because spoken input only fills the command box, and spoken output only reads the current state.

Known follow-ups:

- Manually verify Speak on Windows with the desktop shell running.
- Add optional automatic spoken prompts for:
  - plan created
  - needs confirmation
  - execution completed
  - execution failed
- Add hold-to-talk next, then wake-word later.

## Phase 55: Desktop Hold-to-Talk Interaction

Status: Complete

Completed:

- Added hold-to-talk handling to the desktop `Listen` button.
- Clicking `Listen` still starts a normal 5-second recording.
- Pressing and holding `Listen` for more than 350ms starts the same 5-second recording path.
- Added UI state/notice updates for hold-to-talk start.
- Added active button styling while the Listen button is pressed.
- Extended the desktop scaffold check to verify hold-to-talk code is present.

Current implementation boundary:

- The current server `/api/listen` API records a fixed duration request.
- Therefore this phase is "hold to trigger listening", not true "release to stop recording".
- True release-to-stop requires a later server recording-session API.

Validation:

- `npm test -w @ablepath/desktop` passed.
- `npm run typecheck` passed.
- `npm test` passed:
  - 23 core tests
  - desktop scaffold check
  - 57 server tests
  - 16 web tests
- `npm run check:demo` passed.
- `npm run validate:mvp` passed 26/26.

Current conclusion:

- The floating ball now feels closer to a desktop assistive control: users can click or hold the Listen button to begin voice capture.
- The safety model is unchanged: recognized speech fills the command field; planning and execution remain confirmation-gated.

Known follow-ups:

- Add `/api/listen/start` and `/api/listen/stop` or equivalent recording session APIs for true release-to-stop behavior.
- Add visual countdown/progress during the fixed recording window.
- Add optional automatic spoken prompts after manual acceptance.
- Wake-word remains deferred until button/hold-to-talk is manually accepted.

## Phase 56: Desktop Listen Countdown

Status: Complete

Completed:

- Added a recording countdown label under the desktop floating orb.
- Added a recording progress bar for the fixed `/api/listen` duration.
- The desktop Listen flow now shows:
  - `recording 5s` down to `recording 1s`
  - `processing` after the fixed recording window ends
  - `ready` after the request completes
- The countdown is local renderer feedback and does not alter the backend recording behavior.
- Extended desktop scaffold checks to verify countdown handling is present.

Validation:

- `npm test -w @ablepath/desktop` passed.
- `npm run typecheck` passed.
- `npm test` passed:
  - 23 core tests
  - desktop scaffold check
  - 57 server tests
  - 16 web tests
- `npm run check:demo` passed.
- `npm run validate:mvp` passed 26/26.

Current conclusion:

- The floating ball now gives clear feedback during voice capture, which makes the fixed 5-second listen flow much more usable for demos and manual acceptance.
- True release-to-stop is still a backend recording-session task, not a renderer-only task.

Known follow-ups:

- Manually test the floating ball Listen countdown on Windows.
- Add true `/api/listen/start` and `/api/listen/stop` APIs.
- Add optional TTS prompt after plan creation or confirmation requests.
- Defer wake-word until the manual Listen flow is accepted.

## Phase 57: Desktop Owner Cookie Fix

Status: Complete

Problem found:

- Manual launch of `scripts/start-windows-desktop.ps1` showed the Electron shell stuck in `error`, and all desktop functions failed.
- Root cause: `apps/desktop/src/preload.cjs` used browser `fetch()` and attempted to read the `Set-Cookie` header.
- In Electron/browser fetch, `Set-Cookie` is a forbidden response header and is not reliably exposed to preload code.
- As a result, the desktop shell could not obtain the `ablepath_owner` cookie and owner-only APIs returned authorization failures.

Completed:

- Replaced browser `fetch()` in desktop preload with Node `http` / `https` requests.
- `ensureOwnerCookie()` now requests the local Web shell with Node HTTP and reads `set-cookie` from raw response headers.
- All desktop API calls now use the managed `ablepath_owner` cookie through Node HTTP.
- Added a desktop scaffold guard so preload must use Node HTTP and must not regress to forbidden browser `Set-Cookie` header access.
- Updated desktop README with this owner-cookie implementation note.

Validation:

- `npm test -w @ablepath/desktop` passed.
- `npm run typecheck` passed.
- `npm test` passed:
  - 23 core tests
  - desktop scaffold check
  - 57 server tests
  - 16 web tests
- `npm run check:demo` passed.
- `npm run validate:mvp` passed 26/26.

Current conclusion:

- The most likely cause of the desktop shell's persistent `error` state is fixed.
- The desktop shell should now be able to authenticate to owner-only local APIs after launch.

Manual retry:

- Rebuild first:
  - `.\.tools\node-v20.19.0-win-x64\npm.cmd run build`
- Relaunch:
  - `powershell -ExecutionPolicy Bypass -File .\scripts\start-windows-desktop.ps1`

Known follow-ups:

- Manually verify the Electron shell shows `Ready`.
- If it still shows `error`, capture the notice text shown at the bottom of the shell and inspect whether the server is reachable at `http://127.0.0.1:4317/api/health`.

## Phase 58: Desktop Plan Reliability and Speak Target UX

Status: Complete

Problem found:

- Manual desktop testing showed Listen works and recognizes speech, but Plan can sit in `planning` briefly and then become `error`.
- The desktop preload request timeout was only 15 seconds for all local API calls.
- Real AI planning, especially with screen context enabled, can exceed 15 seconds.
- The floating shell also defaulted `screen` to enabled, which made simple first-step commands pay the screenshot/vision cost unnecessarily.
- The Speak button had no target selector, so users could not choose whether AblePath should read the command, plan, steps, status, or error.

Completed:

- Increased desktop API timeouts for slow paths:
  - `/api/agent/command`: 90 seconds
  - `/api/agent/step`: 90 seconds
  - `/api/listen`: 90 seconds
  - `/api/tts`: 60 seconds
- Kept faster default timeout for normal short requests.
- Improved desktop preload API error messages so the renderer sees:
  - endpoint
  - HTTP status
  - server error
  - server error code
  - setup hints when present
  - agent session error when returned
- Changed desktop `screen` checkbox to default off for faster first planning.
- Added a Speak target selector with:
  - Auto
  - Command
  - Plan
  - Steps
  - Status
  - Error
- Updated the renderer so Speak reads the selected target instead of an implicit priority only.
- Extended the desktop scaffold check to guard:
  - useful API error formatting
  - 90-second Agent planning timeout
  - selectable Speak target handling
  - screen context defaulting off

Validation:

- `npm test -w @ablepath/desktop` passed.
- `npm run typecheck` passed after running with the project-local Node path.
- `npm test` passed:
  - 23 core tests
  - desktop scaffold check
  - 57 server tests
  - 16 web tests
- `npm run check:demo` passed.
- `npm run validate:mvp` passed 26/26.

Current conclusion:

- The desktop Plan path should no longer fail merely because real AI planning takes longer than 15 seconds.
- First planning from speech is now faster and less fragile because screen context is opt-in.
- If Plan still errors, the floating shell should now display the concrete backend/model/setup reason instead of a generic error.
- Speak is now manually targetable: for demo use, choose `Plan` to read the summary, `Steps` to read the action list, `Status` for current state, or `Error` for the actual failure message.

Manual retry:

- Relaunch:
  - `powershell -ExecutionPolicy Bypass -File .\scripts\start-windows-desktop.ps1`
- Try:
  - Listen: `在谷歌浏览器，再打开百度网站`
  - Leave `screen` unchecked for the first plan.
  - Click `Plan`.
  - If the preview appears, use `Speak` with `Plan` or `Steps`.
  - Only enable `screen` for the next-step flow when AblePath needs to understand the current page.

Known follow-ups:

- Add true release-to-stop recording APIs so Listen is not locked to a fixed 5-second recording window.
- Add optional auto-speak settings for plan created, confirmation needed, execution complete, and error.
- Add a visible diagnostic drawer in the floating shell for recent agent steps/tool calls.
- Continue improving browser-page operations after the first `openUrl` step by using screen-aware `Next` planning with user instructions.

## Phase 59: Desktop Execution Stability, Auto Mode, and App Launch Actions

Status: Complete

Problems found:

- Manual desktop testing showed Chrome could open Baidu and then close by itself.
- Root cause: when `openUrl` selected `chrome.exe`, AblePath used a wait-style child process call with a 10-second timeout. If Chrome stayed open, the timeout killed the launched process.
- Real model planning sometimes returned only `openUrl` for “打开百度搜索 1+1”, so execution stopped after opening Baidu.
- “打开 Zotero” with screen context could be interpreted as a click on the Windows Start/menu area because AblePath had no typed app-launch action.
- Users need an explicit Auto mode for repeated demos and accessibility flows where manual confirmation is too much friction.

Completed:

- Changed GUI URL launching to a detached process path so AblePath no longer kills Chrome after opening it.
- Added a short post-open wait so follow-up `type` and `hotkey` actions have a better chance to land after the browser/page is ready.
- Added typed `openApp` support end to end:
  - shared `ControlActionType`
  - AI action parser
  - Agent prompt
  - control capability status
  - default confirmation boundary
  - Windows PowerShell app launch implementation
  - macOS/Linux fallback launch paths
- Updated the Agent prompt to prefer `openApp` for installed apps like Zotero instead of clicking the Windows Start/menu/search area.
- Added a Baidu search completion guard: if the AI only opens Baidu for a command that clearly asks to search, AblePath appends `wait`, `type`, and `hotkey enter`.
- Added screenshot width/height metadata to screen capture responses when available.
- Added screen-planning prompt guidance that coordinates must be absolute screen pixels within the screenshot size.
- Added a desktop `auto` toggle:
  - default off
  - when enabled, the desktop shell automatically confirms and executes ready/non-high-risk plans
  - high-risk plans and `callUser` plans still stop for manual user attention
- Added `-RestartServer` to `scripts/start-windows-desktop.ps1` so manual tests can force the local server to reload newly built code instead of reusing an older healthy server.
- Extended desktop scaffold checks for the Auto toggle.
- Added core tests for `openApp` parsing and Baidu search step completion.
- Added server control-status coverage for `openApp`.

Validation:

- `npm run typecheck` passed.
- `npm test -w @ablepath/desktop` passed.
- `npm test -w @ablepath/core` passed with 25 core tests.
- `npm test -w @ablepath/server` passed with 57 server tests.
- `npm test` passed:
  - 25 core tests
  - desktop scaffold check
  - 57 server tests
  - 16 web tests
- `npm run check:demo` passed.
- `npm run validate:mvp` passed 26/26.
- PowerShell parse check for `scripts/start-windows-desktop.ps1` passed.

Current conclusion:

- The Chrome auto-close bug should be fixed.
- “打开百度搜索 1+1” is now more robust even when the AI under-plans the search portion.
- “打开 Zotero” should now plan as `openApp` instead of relying on a risky screen click on the Start/menu area.
- Auto mode gives the requested no-manual-confirmation flow, while still preserving a local opt-in switch and a high-risk/manual-attention stop.

Manual retry:

- Rebuild before relaunch if the running server was started before this phase:
  - `.\.tools\node-v20.19.0-win-x64\npm.cmd run build`
- Relaunch:
  - `powershell -ExecutionPolicy Bypass -File .\scripts\start-windows-desktop.ps1 -RestartServer`
- Demo tests:
  - Keep `screen` off, optionally enable `auto`, say `打开谷歌浏览器，打开百度，搜索 1+1`.
  - Keep `screen` off, optionally enable `auto`, type `打开 Zotero`.
  - Use `screen` only after a page/app is already open and the next command depends on visible UI.

Known follow-ups:

- Add UI-visible execution history so users can see which action just ran and why.
- Add real browser-page loop acceptance tests with a disposable webpage instead of relying only on dry-run validation.
- Add true release-to-stop recording and optional auto-speak after Auto execution.
- Add richer app-launch resolution for apps without Start Menu shortcuts.

## Phase 60: Auto Execution Follow-through, Recycle Bin, and Click-only Search Repair

Status: Complete

Problems found:

- With both `screen` and `auto` enabled, `打开回收站` still required manual confirmation in practice.
- The screen-aware plan clicked the correct Recycle Bin icon position, but only clicked once, so the icon was selected rather than opened.
- On an already-open Baidu page, `搜索国科大官网并打开` could plan only a pointer/click action and then report `completed`, even though no search text was entered.

Completed:

- Changed desktop Auto mode to truly auto-confirm generated plans from the shell:
  - Auto remains default off.
  - When Auto is on, the shell sends confirmed execution automatically.
  - Plans that explicitly use `callUser` still pause for user input.
- Added `doubleClick` as a first-class typed action:
  - shared action type
  - default confirmation boundary
  - Agent prompt schema
  - AI parser
  - Windows executor implementation
  - local capability status
- Added open-intent repair:
  - if a plan is a click-only open action, AblePath upgrades it to `doubleClick`.
- Added Recycle Bin repair:
  - `打开回收站` is rewritten to typed `openApp` with `name: "Recycle Bin"` instead of clicking the desktop/start/menu area.
  - Windows execution handles `Recycle Bin` through `shell:RecycleBinFolder`.
- Added Zotero repair:
  - `打开 Zotero` is rewritten to typed `openApp` when the model tries to use a screen click.
- Added search repair for click-only screen plans:
  - if the command clearly asks to search and the AI only clicks/moves focus, AblePath appends `type` and `hotkey enter`.
  - search query cleanup removes suffixes like `并打开` so `搜索国科大官网并打开` types `国科大官网`.
- Added core coverage for:
  - Recycle Bin rewrite to `openApp`.
  - click-only Baidu search plan repair.
  - click-only open intent upgrade to `doubleClick`.

Validation:

- `npm run typecheck` passed.
- `npm test -w @ablepath/desktop` passed.
- `npm test -w @ablepath/core` passed with 28 core tests.
- `npm test -w @ablepath/server` passed with 57 server tests.
- `npm test` passed:
  - 28 core tests
  - desktop scaffold check
  - 57 server tests
  - 16 web tests
- First parallel `npm run check:demo` run hit a transient Vite/Rollup path error during concurrent build; rerunning `npm run check:demo` alone passed.
- `npm run validate:mvp` passed 26/26.

Current conclusion:

- Auto mode should no longer stop at manual confirmation for normal generated plans.
- Recycle Bin should open through the Windows shell directly, not by single-clicking the icon.
- Opening visible desktop icons now has a typed `doubleClick` path.
- Baidu page search should no longer report completed after only moving/clicking the mouse when the user asked to search text.

Manual retry:

- Rebuild and restart the local server:
  - `.\.tools\node-v20.19.0-win-x64\npm.cmd run build`
  - `powershell -ExecutionPolicy Bypass -File .\scripts\start-windows-desktop.ps1 -RestartServer`
- Try:
  - Enable `auto`; `screen` is optional for `打开回收站` because it should use `openApp`.
  - On Baidu, enable `screen` and `auto`, then input `搜索国科大官网并打开`.

Known follow-ups:

- Add a visible execution log in the floating shell so the user can see `click/type/hotkey` results immediately.
- Add a post-action verification loop so screen tasks do not mark completed solely because low-level input succeeded.
- Add a browser-specific action path for search/open-first-result tasks instead of relying only on coordinate clicks.

## Phase 61: Auto Screen Loop and Search-result Navigation Strategy

Status: Complete

Problem found:

- Manual test with `screen` + `auto` on Baidu showed the plan reached only:
  - click search box
  - type query
  - press Enter
- After execution, the desktop shell marked the session `completed` instead of taking a new screenshot and continuing to the result page.
- The first execution still appeared to only move the mouse, so depending on click/type focus remained fragile.

Completed:

- Added desktop Auto+Screen loop behavior:
  - after an Auto execution completes successfully,
  - if `screen` is still enabled,
  - and the plan does not contain `finished` or `callUser`,
  - the desktop shell waits briefly, captures/analyzes the screen through `/api/agent/step`, and plans the next step.
- Added an Auto loop guard:
  - maximum 5 continuation steps per session,
  - then the shell pauses and asks the user to review/press Next.
- Updated desktop scaffold checks so the Auto loop and loop guard cannot be accidentally removed.
- Strengthened the Agent prompt:
  - do not output `finished` until the screenshot proves the goal is complete.
  - after a previous plan executes, continue from the current screenshot if the goal is not done.
  - for search-and-open tasks, first get to search results, then after the next screenshot click the correct result.
- Changed search-and-open planning strategy:
  - if the user asks to search and open a result, AblePath prefers opening a Baidu search result URL directly.
  - this avoids fragile click/type focus on the search box.
  - the following Auto+Screen loop is responsible for finding and opening the correct result.
- Preserved Chrome browser hints when rewriting search actions to Baidu search URLs.
- Added small timing gaps in the Windows click executor after cursor movement and mouse down/up to make real clicks less brittle.
- Updated tests and demo check expectations for the new search URL strategy.

Validation:

- `npm run typecheck` passed.
- `npm test -w @ablepath/core` passed with 29 core tests.
- `npm test -w @ablepath/desktop` passed.
- `npm test -w @ablepath/server` passed with 57 server tests.
- `npm test` passed:
  - 29 core tests
  - desktop scaffold check
  - 57 server tests
  - 16 web tests
- `npm run validate:mvp` passed 26/26.
- `npm run check:demo` passed.

Current conclusion:

- `screen` + `auto` now behaves as a bounded loop instead of a single-step executor.
- For `搜索国科大官网并打开`, the first plan should now prefer:
  - `openUrl: https://www.baidu.com/s?wd=国科大官网`
  - `wait`
- After that executes, Auto+Screen should screenshot the result page and plan the next action, typically clicking the official result.
- The system still needs a final verification step to prove the target page is open before saying the task is done.

Manual retry:

- Rebuild and restart:
  - `.\.tools\node-v20.19.0-win-x64\npm.cmd run build`
  - `powershell -ExecutionPolicy Bypass -File .\scripts\start-windows-desktop.ps1 -RestartServer`
- Enable both `screen` and `auto`.
- On Baidu or any browser page, input:
  - `搜索国科大官网并打开`
- Expected first plan:
  - `openUrl` to Baidu search results
  - `wait`
- Expected next behavior:
  - Auto loop screenshots the result page,
  - creates another plan,
  - then clicks/opens the likely official result.

Known follow-ups:

- Add a visible loop counter and recent action/result log in the floating shell.
- Add post-click verification so the loop only stops when the target page is visibly open.
- Add a browser-native/search-provider tool for search/open-first-result tasks, reducing reliance on visual coordinate clicks.

## Phase 62: Stop-safe Auto Loop and One-shot Search Rewrite

Status: Complete

Problem found:

- The Auto+Screen loop was technically continuing, but the search-and-open repair was too aggressive.
- Every follow-up `/api/agent/step` still passed the original goal, so the AI parser repeatedly rewrote the next plan back into:
  - `openUrl` Baidu search results
  - `wait`
- This created repeated new tabs/search pages instead of clicking the already-visible official result.
- The desktop Stop button could not reliably stop a pending Auto loop because the next loop was scheduled after a completed session and Stop was disabled for completed sessions.
- Users should not have to enable `screen` before the first command just to allow follow-up result clicking; Auto mode should be able to screenshot after the first action.

Completed:

- Added parser options to `createActionPlanFromAiResponse`.
- Kept `preferSearchUrl` enabled for the first `/api/agent/command`.
- Disabled `preferSearchUrl` for follow-up `/api/agent/step` planning:
  - after search results are visible,
  - follow-up screenshot plans are respected,
  - click actions are no longer rewritten into another Baidu search URL.
- Added core test coverage proving follow-up screen steps can preserve a click plan for a search result.
- Changed Auto continuation behavior:
  - Auto follow-up always forces `includeScreen: true`.
  - This works even if the user did not enable the `screen` checkbox for the first command.
  - The `screen` checkbox now mainly controls first-plan screen context; Auto continuation can still capture screen when needed.
- Made Stop more reliable for Auto loops:
  - Stop remains enabled for completed sessions while Auto loop may continue.
  - Stop records the session id as stopped locally.
  - Stop clears pending Auto continuation timers.
  - In-flight execute/step responses are ignored if their session was stopped.
- Updated desktop scaffold checks for forced-screen Auto continuation and stop cancellation guards.
- Strengthened the Agent prompt to avoid reopening the same search results page when the screenshot already shows search results.

Validation:

- `npm run typecheck` passed.
- `npm test -w @ablepath/core` passed with 30 core tests.
- `npm test -w @ablepath/desktop` passed.
- `npm test -w @ablepath/server` passed with 57 server tests.
- `npm test` passed:
  - 30 core tests
  - desktop scaffold check
  - 57 server tests
  - 16 web tests
- `npm run check:demo` passed.
- `npm run validate:mvp` passed 26/26.

Current conclusion:

- `搜索国科大官网并打开` should no longer repeatedly open Baidu search result tabs.
- First step can still use Baidu search URL for reliability.
- Follow-up Auto step should screenshot the result page and preserve the AI's click plan for the official result.
- If the loop misbehaves, Stop should now stop the pending Auto continuation instead of being unavailable.

Manual retry:

- Rebuild and restart:
  - `.\.tools\node-v20.19.0-win-x64\npm.cmd run build`
  - `powershell -ExecutionPolicy Bypass -File .\scripts\start-windows-desktop.ps1 -RestartServer`
- You can test with only `auto` enabled first:
  - `搜索国科大官网并打开`
- Expected:
  - first plan opens the Baidu search URL,
  - Auto continuation screenshots the result page,
  - next plan should click/open the official result instead of opening another search tab.

Known follow-ups:

- Add a dedicated browser/search-result tool so "search X and open official site" can be handled without visual coordinate uncertainty.
- Add visible loop status and a stronger cancel/abort affordance while a planning request is in flight.
- Add post-navigation verification before declaring `finished`.

## Phase 63: Windows Handoff README Refresh

Status: Complete

Reason:

- The user is moving development to another Windows computer and another Codex instance.
- The old README had outdated Phase 48-era handoff information and mojibake-heavy Chinese text.
- The next developer needs a concise, accurate handoff for the Windows desktop assistant state after Phase 62.

Completed:

- Rewrote `README.md` as a clean handoff document.
- Updated current status to reflect the Windows-oriented desktop adaptation through Phase 62/63.
- Documented the active architecture:
  - AI Agent orchestration service
  - Electron desktop floating assistant
  - Web settings/status/diagnostics/caregiver surface
  - separated caregiver summary/SOS boundary
- Documented current desktop shell behavior:
  - Listen
  - Speak target selector
  - Plan/Next
  - Dry-run/Confirm
  - Stop
  - SOS
  - `screen`
  - `auto`
  - bounded Auto+Screen continuation loop
- Documented current typed action set:
  - `openUrl`
  - `openApp`
  - `click`
  - `doubleClick`
  - `type`
  - `hotkey`
  - `scroll`
  - `wait`
  - `finished`
  - `callUser`
- Documented the current status of the `搜索国科大官网并打开` issue:
  - first command may rewrite to Baidu search URL
  - follow-up `/api/agent/step` disables search URL rewrite
  - Auto continuation forces screenshots
  - next plan should click the official result rather than open another search tab
- Documented known high-priority gaps:
  - browser-page operation remains fragile
  - no browser-native search-result tool yet
  - no visible action/result log yet
  - no true server-side cancellation yet
  - post-action verification is still needed
- Documented recommended next phase as Phase 64:
  - browser/search-result tool
  - post-action verification
  - desktop execution log
  - server-side cancellation
  - manual Windows acceptance checklist
- Preserved command examples for the project-local Node runtime and `start-windows-desktop.ps1 -RestartServer`.

Validation:

- Read back `README.md` with Node as UTF-8 and confirmed the key Chinese search phrase and Markdown code fences are intact.
- No runtime code changed in this phase.

Current conclusion:

- The next Windows Codex/developer should be able to continue from the README plus `docs/PLAN.md` without needing the previous conversation.
- The immediate implementation priority remains Phase 64: make browser/search-result actions more deterministic and add verification/cancellation around the Auto loop.

Known follow-ups:

- On the next Windows machine, run the full validation baseline before editing:
  - `npm run typecheck`
  - `npm test`
  - `npm run check:demo`
  - `npm run validate:mvp`
- Then manually retest:
  - `打开回收站`
  - `打开 Zotero`
  - `打开百度搜索 1+1`
  - `搜索国科大官网并打开`
  - Stop during Auto loop
