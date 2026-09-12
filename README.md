# Warehouse Dashboard v2

Warehouse Dashboard is an offline-capable Tauri v2 desktop dashboard for warehouse density, inventory staging, snapshots, and operational review. It keeps shared operational state in a configured folder while preserving local authentication and audit controls.

## Profiles

Warehouse business rules are described by JSON profiles under `src/profiles/`. `electronics-demo.json` provides an electronics warehouse example. `generic.json` is a neutral template. Profile loading validates schema, identifiers, aliases, classifiers, regular expressions, and snapshot references before startup.

## Build and test

```text
npm install
npm test
npm run tauri -- build
```

The Windows bundle requires the Rust toolchain and the WebView2 fixed runtime described in the distribution notes. Existing shared data remains compatible across upgrades.

See [WarehouseProfile v1](docs/warehouse-profile-v1.md) for profile configuration and import mappings.

