import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "offline-journal",
      generateBundle(_options, bundle) {
        const files = Object.keys(bundle).filter(
          (name) => !name.endsWith(".map"),
        );
        const version = files.find((name) => name.endsWith(".js")) || "v1";
        this.emitFile({
          type: "asset",
          fileName: "sw.js",
          source: `const CACHE = ${JSON.stringify(`lianji-${version}`)};
const FILES = ${JSON.stringify(["./", "./index.html", "./manifest.webmanifest", "./icon.svg", "./icon-192.png", "./icon-512.png", "./images/training.jpg", "./images/breakfast.jpg", "./images/lunch.jpg", ...files.map((name) => `./${name}`)])};
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('lianji-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(caches.match(new URL('./index.html', self.registration.scope)).then(cached => cached || fetch(event.request)));
  } else {
    event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
  }
});`,
        });
      },
    },
  ],
  base: "./",
});
