const CACHE='chrometry-v1-3-5';
const CORE=[
  './','./index.html','./styles.css','./ios-polish.css','./app.js','./manifest.webmanifest','./chrometry-icon.svg',
  './apple-touch-icon-v5.png','./icon-192-v5.png','./icon-512-v5.png'
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
