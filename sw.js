/* Aasiya Musalla — minimal service worker: cache the shell so the site opens
   instantly / offline; data (Sheets, AlAdhan) is always network-first. */
const V="aasiya-shell-v1";
const SHELL=["./","./index.html","./site.css","./site.js","./manifest.webmanifest","./assets/mark.png","./assets/hero.jpg","./assets/favicon.png","./assets/sfpro.css"];
self.addEventListener("install",e=>{ e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL).catch(()=>{}))); self.skipWaiting(); });
self.addEventListener("activate",e=>{ e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch",e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=="GET") return;
  if(u.origin!==location.origin) return;                     // APIs, maps, fonts: network only
  if(/admin|display\.html$/.test(u.pathname)) return;         // never cache admin / TV displays
  e.respondWith(fetch(e.request).then(r=>{ const cp=r.clone(); caches.open(V).then(c=>c.put(e.request,cp)); return r; })
    .catch(()=>caches.match(e.request,{ignoreSearch:true})));
});
