const CACHE_NAME = 'mellow-tracker-cache-v1';
const ASSETS = [
  '/assignment_tracker/',
  '/assignment_tracker/index.html',
  '/assignment_tracker/style.css',
  '/assignment_tracker/app.js',
  '/assignment_tracker/manifest.json',
  '/assignment_tracker/icon-192.png',
  '/assignment_tracker/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@300;400;500;600;700&family=Outfit:wght@300;400;500;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// Install Event
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Attempt to cache all primary assets
      return cache.addAll(ASSETS).catch(err => {
        console.warn("Service Worker: Pre-caching assets failed, caching dynamically on fetch:", err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate Event
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event (Network-first with cache fallback)
self.addEventListener('fetch', (e) => {
  // Only intercept GET requests
  if (e.request.method !== 'GET') return;
  
  // Skip external API calls (e.g. Supabase DB calls) to avoid caching dynamic DB data
  const isSupabaseRequest = e.request.url.includes('supabase.co');
  if (isSupabaseRequest) return;

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // If network request is successful, cache it and return
        if (res && res.status === 200) {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, resClone);
          });
        }
        return res;
      })
      .catch(() => {
        // If network request fails (offline), serve from cache
        return caches.match(e.request).then(cachedResponse => {
          if (cachedResponse) return cachedResponse;
          
          // Return index.html as fallback if offline and requesting pages
          if (e.request.mode === 'navigate') {
            return caches.match('/assignment_tracker/index.html');
          }
        });
      })
  );
});
