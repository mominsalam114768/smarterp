import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const APP_BUILD_VERSION = '2026.11.20-v3';
const BUILD_VERSION_KEY = 'hishab_app_build_version';

// Unregister any old caching service workers & clear outdated CacheStorage so Cloudflare deployments reflect immediately
if (typeof window !== 'undefined') {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister().catch(() => {});
      }
    }).catch(() => {});
  }

  if ('caches' in window) {
    caches.keys().then((names) => {
      for (const name of names) {
        caches.delete(name).catch(() => {});
      }
    }).catch(() => {});
  }

  const prevBuild = localStorage.getItem(BUILD_VERSION_KEY);
  if (prevBuild && prevBuild !== APP_BUILD_VERSION) {
    localStorage.setItem(BUILD_VERSION_KEY, APP_BUILD_VERSION);
    window.location.reload();
  } else if (!prevBuild) {
    localStorage.setItem(BUILD_VERSION_KEY, APP_BUILD_VERSION);
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
