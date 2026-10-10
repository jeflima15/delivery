import {StrictMode} from 'react';
import {createRoot, hydrateRoot} from 'react-dom/client';
import {Analytics} from '@vercel/analytics/react';
import App from './App';
import './index.css';

const root = document.getElementById('root')!;
const app = (
  <StrictMode>
    <App />
    <Analytics />
  </StrictMode>
);

if (root.dataset.landingPrerender === 'true' && window.location.pathname === '/') hydrateRoot(root, app);
else createRoot(root).render(app);
