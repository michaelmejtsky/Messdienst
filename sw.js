/* =========================================================
   MESSDIENST – SERVICE WORKER
   Feuerwehr St. Pölten-Stadt
   Version: 7.0.0-rc5
   Stand: 08.10.2026

   Aufgabe:
   - GitHub-PWA-Hülle offline verfügbar halten
   - bei Internet immer zuerst aktuelle Dateien laden
   - bei Verbindungsfehler auf Cache zurückfallen
   - alte Messdienst-Caches bei neuer Version entfernen
   - fremde Caches derselben Domain NICHT löschen

   WICHTIG:
   Die eigentliche Google-Apps-Script-WebApp läuft im iframe
   und bleibt network-only. Dieser Service Worker cached nur
   Dateien der GitHub-PWA-Hülle.
   ========================================================= */

const CACHE_PREFIX = 'messdienst-';
const CACHE_NAME = 'messdienst-v7-rc5-20261008';

const CACHE_FILES = [
  './',
  './index.html',
  './manifest.json',
  './messdienst-icon.png'
];


/* =========================================================
   INSTALLATION
   ========================================================= */

self.addEventListener('install', event => {

  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(async cache => {

        /*
         * Dateien einzeln cachen.
         * Dadurch scheitert die komplette Installation nicht,
         * falls eine einzelne optionale Datei vorübergehend
         * nicht erreichbar ist.
         */
        await Promise.all(
          CACHE_FILES.map(async file => {
            try {
              await cache.add(file);
            } catch (error) {
              console.warn(
                'Messdienst: Datei konnte beim Installieren nicht gecacht werden:',
                file,
                error
              );
            }
          })
        );

      })
  );

  /*
   * Neue Service-Worker-Version soll nicht unnötig
   * im "waiting"-Status hängen bleiben.
   */
  self.skipWaiting();

});


/* =========================================================
   AKTIVIERUNG / ALTE CACHE-VERSIONEN ENTFERNEN
   ========================================================= */

self.addEventListener('activate', event => {

  event.waitUntil(

    caches
      .keys()
      .then(keys => {

        return Promise.all(

          keys
            .filter(key => {
              return (
                key.startsWith(CACHE_PREFIX) &&
                key !== CACHE_NAME
              );
            })
            .map(key => {
              console.log(
                'Messdienst: Alter Cache wird entfernt:',
                key
              );

              return caches.delete(key);
            })

        );

      })
      .then(() => self.clients.claim())

  );

});


/* =========================================================
   FETCH – NETWORK FIRST
   ========================================================= */

self.addEventListener('fetch', event => {

  /*
   * Nur GET-Anfragen behandeln.
   */
  if (event.request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(event.request.url);

  /*
   * Nur Dateien derselben Herkunft behandeln.
   *
   * Die Google-Apps-Script-WebApp im iframe liegt auf
   * script.google.com und darf von diesem Service Worker
   * nicht als Offline-Kopie behandelt werden.
   */
  if (requestUrl.origin !== self.location.origin) {
    return;
  }


  event.respondWith(

    fetch(event.request)

      .then(response => {

        /*
         * Nur erfolgreiche Antworten cachen.
         */
        if (
          response &&
          response.ok
        ) {

          const copy = response.clone();

          caches
            .open(CACHE_NAME)
            .then(cache => {
              return cache.put(
                event.request,
                copy
              );
            })
            .catch(error => {
              console.warn(
                'Messdienst: Antwort konnte nicht gecacht werden:',
                event.request.url,
                error
              );
            });

        }

        return response;

      })

      .catch(async () => {

        /*
         * Kein Netz:
         * 1. exakte Anfrage im Cache suchen
         * 2. bei Navigation auf die PWA-Startseite zurückfallen
         */

        const cached =
          await caches.match(event.request);

        if (cached) {
          return cached;
        }

        if (event.request.mode === 'navigate') {

          const fallback =
            await caches.match('./index.html') ||
            await caches.match('./');

          if (fallback) {
            return fallback;
          }

        }

        /*
         * Wenn keine Offline-Datei verfügbar ist,
         * einen normalen Netzwerkfehler zurückgeben.
         */
        return Response.error();

      })

  );

});


/* =========================================================
   OPTIONALER SOFORT-UPDATE-BEFEHL
   ========================================================= */

self.addEventListener('message', event => {

  if (
    event.data &&
    event.data.type === 'SKIP_WAITING'
  ) {

    self.skipWaiting();

  }

});
