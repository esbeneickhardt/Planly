/**
 * Application entry point — mounts the React tree into the #root element.
 * StrictMode is kept on in all environments to surface side-effect issues early.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
