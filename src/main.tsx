import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

// Force Service Worker Update
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (let registration of registrations) {
      registration.update();
    }
  });
}

// Clear all caches unconditionally to ensure updates are reflected
if ('caches' in window) {
  caches.keys().then((names) => {
    for (let name of names) {
      caches.delete(name);
    }
  });
}

const updateSW = registerSW({
  onNeedRefresh() {
    console.log('New content available, please refresh.');
    if (confirm('অ্যাপের নতুন ভার্সন এসেছে! আপডেট করতে OK চাপুন। (A new version is available)')) {
      updateSW(true);
      window.location.reload();
    }
  },
  onOfflineReady() {
    console.log('App is ready to work offline.');
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
