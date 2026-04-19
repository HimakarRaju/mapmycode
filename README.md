# MapMyCode

[![CI](https://github.com/HimakarRaju/mapmycode/actions/workflows/ci.yml/badge.svg)](https://github.com/HimakarRaju/mapmycode/actions/workflows/ci.yml)
[![Release VSIX](https://github.com/HimakarRaju/mapmycode/actions/workflows/release.yml/badge.svg)](https://github.com/HimakarRaju/mapmycode/actions/workflows/release.yml)
[![Issues](https://img.shields.io/github/issues/HimakarRaju/mapmycode)](https://github.com/HimakarRaju/mapmycode/issues)

[Project artwork](media/hero.svg)

MapMyCode is a VS Code extension for turning source code into live visual explanations. It helps developers inspect algorithms, data structures, web app behavior, and codebase architecture from inside the editor.

## Download

MapMyCode now supports a straightforward GitHub-based distribution path.

1. Download the latest `.vsix` from GitHub Releases once a tagged release is published.
2. Install it in VS Code with `Extensions: Install from VSIX...`.
3. For local use, clone the repo and run the extension in an Extension Development Host.

Current package command:

```bash
npm run package:vsix:release
```

Tagged releases matching `v*` automatically build and attach a `.vsix` artifact through GitHub Actions.

## Why it stands out

- Visual playback for algorithms instead of static logs
- Structure-aware rendering for common data structures
- Route and request insight for supported web apps
- Codebase-level views for dependencies, classes, metrics, and history
- Export support for HTML and JSON sharing

## Core features

- Replay algorithm execution step by step
- Visualize arrays, linked lists, trees, graphs, stacks, queues, sets, and hash maps
- Explore web application routes and request traces
- Map file structure, dependencies, classes, metrics, and git history
- Export visualizations for demos, debugging, and collaboration

## Collaborate

This repository is configured for public collaboration.

1. Open an issue for bugs or feature proposals.
2. Fork the repository.
3. Create a focused branch.
4. Run the build before opening a pull request.
5. Include screenshots when UI behavior changes.

See `CONTRIBUTING.md` for contributor expectations and `.github` templates for issue and PR structure.

## Local development

### Requirements

- Node.js 18+
- VS Code 1.85+

### Install

```bash
npm install
```

### Build

```bash
npm run build
```

### Watch

```bash
npm run watch
```

Open the folder in VS Code and press `F5` to launch an Extension Development Host.

## Packaging and releases

### Create a local `.vsix`

```bash
npm run package:vsix
```

### Publish a release artifact on GitHub

1. Create and push a tag such as `v0.1.0`
2. GitHub Actions builds the extension
3. The workflow attaches `mapmycode.vsix` to the release

## Commands

- `MapMyCode: Visualize Current File`
- `MapMyCode: Visualize Selection`
- `MapMyCode: Open Algorithm Templates`
- `MapMyCode: Visualize Web App`
- `MapMyCode: Stop Visualized App`
- `MapMyCode: Export Visualization as HTML`
- `MapMyCode: Export Trace as JSON`
- `MapMyCode: Visualize Codebase`

## Project structure

- `src/extension.ts` for the extension entry point
- `src/webview/app` for the React webview application
- `src/instrumenter` for execution tracing
- `src/appViz` for route and request visualization
- `src/codebase` for structural analysis views
- `python` for Python tracing helpers
- `middleware` for runtime instrumentation helpers

## Next publish step

The repo is ready for release packaging. The remaining manual step is Marketplace publication, which requires the correct VS Code publisher account and publishing credentials.
