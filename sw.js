const CACHE='chrometry-final-v1-4-1';
const CORE=[
  './','./index.html','./styles.css','./ios-polish.css','./app.js','./ui-polish.js','./manifest.webmanifest','./chrometry-icon.svg','./chrometry-home-icon.svg','./chrometry-favicon.svg',
  './apple-touch-icon-v7.png','./icon-192-v7.png','./icon-512-v7.png'
];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  e.respondWith(fetch(e.request).then(r=>{
    const copy=r.clone();
    if(new URL(e.request.url).origin===location.origin)caches.open(CACHE).then(c=>c.put(e.request,copy));
    return r;
  }).catch(()=>caches.match(e.request).then(hit=>hit||caches.match('./index.html'))));
});
