# MapMyCode

MapMyCode is a VS Code extension for turning source code into live visual explanations. It helps users inspect algorithms, data structures, web app behavior, and codebase architecture from inside the editor.

## Download

MapMyCode is being prepared for public distribution.

Current ways to use it:

1. Clone this repository and run the extension locally in VS Code.
2. Build and package a `.vsix` artifact for direct installation.
3. Publish signed releases on GitHub once the remote repository is live.

Marketplace publishing can be added after the GitHub repository is connected.

## What it does

- Replays algorithm execution step by step
- Visualizes arrays, linked lists, trees, graphs, stacks, queues, sets, and hash maps
- Explores web application routes and request traces
- Maps file structure, dependencies, classes, metrics, and git history
- Exports visualizations as HTML or JSON for sharing

## Why teams use it

- Faster debugging through visual trace playback
- Better onboarding for complex codebases
- Clearer code reviews and demos
- A more concrete way to teach data structures and algorithm behavior

## Collaboration

This repository is set up for contribution.

1. Open an issue for bugs or feature proposals.
2. Fork the repository.
3. Create a focused branch.
4. Run the local build before opening a pull request.
5. Include screenshots when UI behavior changes.

See `CONTRIBUTING.md` for the working agreement.

## Local development

### Requirements

- Node.js 18+
- VS Code 1.85+

### Install dependencies

```bash
npm install
```

### Build

```bash
npm run build
```

### Watch mode

```bash
npm run watch
```

Open the folder in VS Code and press `F5` to launch an Extension Development Host.

## Extension commands

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

## Release path

The remaining publish steps are operational rather than code-related:

1. Create the GitHub repository `mapmycode`
2. Add the remote to this local repository
3. Push the `main` branch
4. Publish the extension to the VS Code Marketplace
5. Attach packaged `.vsix` files to GitHub releases
