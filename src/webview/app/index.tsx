import { createRoot } from 'react-dom/client';
import { App } from './App';

const container = document.getElementById('root')!;
const root = createRoot(container);
root.render(<App />);

// Notify the extension host that the webview is ready
declare function acquireVsCodeApi(): {
  postMessage(msg: any): void;
  getState(): any;
  setState(state: any): void;
};

export const vscode = acquireVsCodeApi();
vscode.postMessage({ type: 'ready' });
