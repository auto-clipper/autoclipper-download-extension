import { captureExtensionError } from '@/lib/sentry';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './popup.css';

createRoot(document.getElementById('root')!, {
  onUncaughtError: (error) => { void captureExtensionError(error, 'popup-render'); },
  onCaughtError: (error) => { void captureExtensionError(error, 'popup-boundary'); },
}).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
