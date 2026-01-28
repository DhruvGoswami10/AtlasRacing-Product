# Release Notes & Packaging

Use this directory to track packaging scripts, Content Manager manifests, and
installer configuration for AtlasLink.

## Packaging Targets

- `atlaslink-app.zip` – contains `apps/python/AtlasLink/*` for CM/manual install.
- `AtlasLinkBridge-setup.exe` – desktop companion installer.
- `manifest.json` – version info consumed by auto-updater / dashboard.

## TODO

- Author build script that gathers python app, bridge binary, and docs.
- Document manual install and troubleshooting.
- Integrate with CI once the bridge is functional.
