# ReconTool

Offline-first OSINT desktop application built with Electron Forge, Vite, React and TypeScript.

## Stack

- Electron Forge
- Vite + React + TypeScript
- SQLite (`better-sqlite3`)
- TailwindCSS
- Typed IPC (`contextIsolation: true`, `nodeIntegration: false`)

## Run

```bash
npm install
npm start
```

## Quality checks

```bash
npm run typecheck
npm run lint
npm run package
```
