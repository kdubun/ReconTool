import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import { App } from '@renderer/App';
import '@renderer/index.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container missing');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
