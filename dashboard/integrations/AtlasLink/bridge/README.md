# AtlasLink Bridge (Placeholder)

The bridge runs outside Assetto Corsa and turns the raw packets from the Python
app into Atlas-compatible SSE/WebSocket feeds.

## Responsibilities

- Listen for UDP/IPC messages emitted by `python-app/AtlasLink/app.py`.
- Validate packet schema and enrich with derived data (gaps, stint info, events).
- Expose:
  - `/telemetry` – player + canonical telemetry stream.
  - `/multicar` – opponent grid with gaps/tyre info.
  - `/events` – session timeline events.
- Manage heartbeats/keep-alives so Dev Mode can surface connection health.

## Next Steps

- Decide implementation language (Go or Node are good fits).
- Outline the config (port, rate limits, logging).
- Add tests to ensure schema alignment with the dashboard.

## Running the bridge

```bash
cd integrations/AtlasLink/bridge
npm install
npm start
```

The bridge listens for UDP packets on `127.0.0.1:28555` and exposes SSE endpoints
on `http://127.0.0.1:28556/atlas-link/*`.

