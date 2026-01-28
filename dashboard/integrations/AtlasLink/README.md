# AtlasLink Integration Workspace

AtlasLink is the Assetto Corsa companion that bridges in-game telemetry to the Atlas Racing dashboard.  
This workspace houses everything needed to build, test, and ship the link.

## Structure

- `python-app/AtlasLink/` – Assetto Corsa Python app that runs in-game. It captures telemetry/events and streams them to the bridge.
- `bridge/` – Desktop service/CLI that receives data from the Python app, normalizes it, and exposes Atlas-compatible SSE/WebSocket feeds.
- `release/` – Packaging scripts and manifests for creating Content Manager–ready zips and installers.

## Development Flow

1. **Model the protocol**  
   Define the JSON schema/heartbeat the Python app emits. Keep it under `python-app/AtlasLink/protocol.py` (stubbed today).

2. **Prototype data tap**  
   Use the Python runtime to pull player + grid telemetry at 30–60 Hz. Log samples into `python-app/AtlasLink/samples/`.

3. **Bridge service**  
   Implement the bridge (Go/Node/C++). It should:
   - listen on localhost (UDP/IPC) for Python app messages,
   - enrich data (gap calculations, session heuristics),
   - publish `/telemetry`, `/multicar`, `/events` endpoints mirroring the existing backend contracts.

4. **Dev Mode validation**  
   The dashboard Dev Mode will include an “Atlas Link” panel so you can verify packets, connection health, and opponent data before enabling the overlay.

5. **Packaging**  
   Ship a zip containing:
   - `apps/python/AtlasLink/*` for Content Manager/manual install,
   - bridge binaries + installer,
   - version manifest for auto-updates.

## Next Steps

- Flesh out the mock telemetry publisher for local testing.
- Document installation + troubleshooting in `release/README.md`.
- Coordinate with Dev Mode panel work so both sides share the same schema.

### Bridge Implementation Roadmap

1. **Schema handshake**
   - Finalise the JSON contract shared between `python-app`, `bridge`, and the dashboard (`frontend/src/types/atlasLink.ts`).
   - Add lightweight validation in the bridge so malformed packets raise clear errors.
2. **Bridge MVP**
   - Implement UDP ingestion (port 28555 by default) and expose `/atlas-link/telemetry`, `/atlas-link/multicar`, and `/atlas-link/events` as SSE streams.
   - Feed the Dev Mode panel by swapping `useAtlasLinkDiagnostics` from mock mode to live mode when the endpoint is reachable.
3. **Backend integration**
   - Extend the Electron dashboard backend to subscribe to the bridge and populate `atlas_ai` opponent + pit fields.
   - Gate BroadcastAI calls on the new data: when `game_name === 'Assetto Corsa'` and AtlasLink is online, enable attacking/defending/formation scripts.
4. **Reliability**
   - Add heartbeats + retries so the dashboard surfaces disconnects gracefully.
   - Capture metrics (packet rate, dropped packets) for the Dev Mode diagnostics view.
5. **Packaging**
   - Bundle Python app + bridge CLI in `release/` with installer instructions and automated versioning.
