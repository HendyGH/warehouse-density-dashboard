# Warehouse Density Map — Desktop (.exe)

A standalone Windows desktop build of the **Warehouse Density & Segregation Map**, packaged with Electron. It runs fully offline; all data stays local on the machine.

Same features as the web app: density heatmap, contamination detection, GR-ZONE tracking, before/after analytics, paste **or** drag-and-drop file upload (`.xlsx/.csv/.txt`), validation, CSV/Excel export, snapshot history with trend-over-time chart.

> Looking for the installable web version (PWA)? See the separate `warehouse-density-pwa` repo.

## Download

Grab the latest `WarehouseDensityMap-<version>-portable.exe` from the [**Releases**](../../releases) page. It's portable — no installation, just double-click to run.

## Build it yourself

Requires [Node.js](https://nodejs.org) 18+.

```bash
npm install
npm start        # run in dev
npm run dist     # build dist/WarehouseDensityMap-<version>-portable.exe
```

## Releasing (automated)

A GitHub Actions workflow (`.github/workflows/build-windows.yml`) builds the `.exe` on a Windows runner and **attaches it to a Release** whenever you push a version tag:

```bash
git tag v1.0.0
git push origin v1.0.0
```

You can also trigger the workflow manually from the Actions tab; the `.exe` is then available as a build artifact.

## Project structure

```
.
├── main.js                # Electron main process (opens the window)
├── package.json           # electron + electron-builder (portable target)
├── build/icon.ico         # app icon
├── app/                   # the web app (index.html, css, js, lib, icons)
└── .github/workflows/     # CI: build + release the .exe
```

## Notes

- `node_modules/` and `dist/` are git-ignored — only source is committed; the `.exe` ships via Releases.
- `app/` is a copy of the web app. If you change it upstream, re-copy its contents into `app/` and rebuild.
- `npm audit` flags issues in electron-builder's build-time dependencies only; they are not bundled into the shipped app.

## License

MIT — see [LICENSE](LICENSE).
