const CACHE='order-of-light-shell-v5-media-local';
const SHELL=['/','/style.css?v=20261105r7','/app.js?v=20261105r7','/manifest.webmanifest?v=20261105r7'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const request=event.request;
 const url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
 if(request.mode==='navigate'){
  event.respondWith(fetch(request).then(response=>{
   if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put('/',copy));}
   return response;
  }).catch(()=>caches.match('/') ));
  return;
 }
 if(url.pathname==='/style.css'||url.pathname==='/app.js'||url.pathname==='/manifest.webmanifest'){
  event.respondWith(fetch(request).then(response=>{
   if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));}
   return response;
  }).catch(()=>caches.match(request)));
 }
});