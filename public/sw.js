const CACHE = 'nexusos-v9'
const OFFLINE_URL = '/nexusos/'

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => {
      return cache.addAll([
        '/nexusos/',
        '/nexusos/index.html',
        '/nexusos/manifest.json',
        '/nexusos/favicon-v3.svg',
        '/nexusos/favicon-v3.png',
        '/nexusos/favicon-32-v3.png',
        '/nexusos/favicon-16-v3.png',
        '/nexusos/apple-touch-icon-v3.png',
        '/nexusos/icon-192-v3.png',
        '/nexusos/icon-512-v3.png',
      ]).catch(() => cache.add('/nexusos/'))
    }).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return
  if (!e.request.url.startsWith('http')) return
  e.respondWith(
    fetch(e.request)
      .then(response => {
        if (response && response.status === 200) {
          const clone = response.clone()
          caches.open(CACHE).then(cache => cache.put(e.request, clone))
        }
        return response
      })
      .catch(() => {
        return caches.match(e.request)
          .then(cached => cached || caches.match(OFFLINE_URL))
      })
  )
})
