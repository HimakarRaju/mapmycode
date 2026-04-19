# MapMyCode Visualizer

[![CI](https://github.com/HimakarRaju/mapmycode/actions/workflows/ci.yml/badge.svg)](https://github.com/HimakarRaju/mapmycode/actions/workflows/ci.yml)
[![Release VSIX](https://github.com/HimakarRaju/mapmycode/actions/workflows/release.yml/badge.svg)](https://github.com/HimakarRaju/mapmycode/actions/workflows/release.yml)
[![Issues](https://img.shields.io/github/issues/HimakarRaju/mapmycode)](https://github.com/HimakarRaju/mapmycode/issues)

![MapMyCode artwork](media/hero.png)

**MapMyCode** is a powerful VS Code extension that turns your source code into live visual explanations. It helps developers inspect algorithms, data structures, web app behavior, and codebase architecture seamlessly from inside the editor. 

Whether you're debugging a complex recursive algorithm, tracing real-time requests in a Flask application, or visualizing your entire project's dependency graph, MapMyCode makes your code *visible*.

![Extension Demo](media/demo.gif) *(Placeholder for amazing demo gif)*

## 🚀 Core Features

### 1. Algorithm & Data Structure Visualizer
Replay your algorithm's execution step-by-step. MapMyCode automatically detects and visually renders common data structures:
- **Arrays, Linked Lists, Binary Trees, Graphs**
- **Stacks, Queues, Sets, Hash Maps**

![Algorithm Visualizer](media/algorithm_viz.png)

### 2. Live Web App Tracing (Flask, FastAPI, Express)
Start your backend server directly through MapMyCode. It intercepts the execution and visualizes live incoming network requests, routing, and variable state.
- **Native Support**: Works flawlessly with if __name__ == '__main__': execution using unpy, supporting pp.run and socketio.run.
- **Live Request Monitor**: See exactly what functions are invoked per request.

![Live App Tracing](media/app_tracing.png)

### 3. Comprehensive Codebase Mapping
Understand your project architecture at a glance using static workspace visualization tools:
- **Dependency Network**: View how files import and depend on each other.
- **Call Graph**: Traverse functional invocation references.
- **File Structure & Code Metrics**: File sizes, complexity, and line counts.
- **Class Diagrams**: Auto-generated UML-like class structures.
- **Git History**: Browse recent commits visually.

![Codebase Maps](media/code_maps.png)

### 4. Powerful Export Options
Need to share your bug or algorithm with a colleague? Use the newly integrated Side Bar export actions to snapshot your trace:
- **Export HTML**: Generates a completely standalone, full-width interactive web page with a VS Code-like UI, multi-file code pane, and custom themes to view the trace offline.
- **Export JSON**: Save the raw execution trace for later playback.
- **Export Markdown**: Generates a beautiful Markdown summary.

![Export Options](media/export_options.gif)

## 📥 Installation

1. Download the latest .vsix from [GitHub Releases](https://github.com/HimakarRaju/mapmycode/releases).
2. Open VS Code.
3. Go to Extensions (Ctrl+Shift+X / Cmd+Shift+X).
4. Click the ... menu in the top right of the Extensions view -> **Install from VSIX...**
5. Select the downloaded .vsix file.

## 🛠️ Usage Quick Start

MapMyCode adds a new **Sidebar Icon** to your Activity Bar where all tools are instantly accessible.

### Visualizing a File
1. Open a supported file (JavaScript, TypeScript, or Python).
2. Open the MapMyCode Sidebar.
3. Click **Visualize Current File** under the *Run* menu.
4. Use the playback controls in the MapMyCode panel to step through the execution.

### Live Tracing an App
1. Open your web app's entry point (e.g., pp.py).
2. Click **MapMyCode: Visualize Web App**.
3. Click **Start App** in the panel to spin up the instrumented server.

### Available Commands
*(Accessible via Ctrl+Shift+P / Cmd+Shift+P or the Sidebar)*
- MapMyCode: Visualize Current File
- MapMyCode: Visualize Selection
- MapMyCode: Open Algorithm Templates
- MapMyCode: Visualize Web App
- MapMyCode: Stop Visualized App
- MapMyCode: Export Visualization as HTML
- MapMyCode: Export Trace as JSON
- MapMyCode: Export Codebase as Markdown

## ⚙️ Configuration
You can configure behavior by going to Preferences: Open Settings (UI) and searching for MapMyCode:
- **App Port**: Specify the port your web framework runs on.
- **Theme**: Match the visualizer theme to your editor (Dark/Light).

## 🤝 Collaborate & Contribute

Contributions are welcome! If you want to fix a bug or add a visualization renderer:

1. Open an issue for bugs or feature proposals.
2. Fork the repository.
3. Create a focused branch.
4. Run the build before opening a pull request.
5. Include screenshots when UI behavior changes!

### Local Development Setup

`ash
# 1. Install dependencies
npm install

# 2. Build the extension
npm run build

# 3. Watch for changes
npm run watch
`
*Open the folder in VS Code and press F5 to launch an Extension Development Host.*

## 📜 License
See [LICENSE](LICENSE) for details.
