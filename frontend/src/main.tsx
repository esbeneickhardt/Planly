/**
 * Application entry point — mounts the React tree into the #root element.
 * StrictMode is kept on in all environments to surface side-effect issues early.
 * vite:preloadError fires when a lazy chunk 404s after a deploy; reloading fetches the fresh index.html.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

window.addEventListener('vite:preloadError', () => { window.location.reload(); });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
