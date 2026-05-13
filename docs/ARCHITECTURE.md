# AblePath Architecture

AblePath is a local-first Node.js + Vue application.

## Layers

- `packages/shared`: public API, event, config, provider, and activity types.
- `packages/core`: local config, activity persistence, event bus, and safety policy.
- `apps/server`: HTTP API, WebSocket events, and static web serving.
- `apps/web`: Vue dashboard and user-facing control surfaces.

## Runtime Principles

- Do not depend on NanoClaw runtime, Claude Agent SDK, containers, group folders, or channel loops.
- Keep AI products behind provider adapters.
- Keep computer control behind typed action plans and risk checks.
- Record meaningful local activity and safety events.
