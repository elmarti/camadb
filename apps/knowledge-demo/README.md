# CamaDB local knowledge demo

This is the public, open-source database demo for issue #88. It is not a paid-service frontend and has no account, telemetry, model API, or server-side data path.

## Run it

From the repository root:

```sh
yarn workspace @camadb/knowledge-demo build
yarn workspace @camadb/knowledge-demo start
```

Open `http://127.0.0.1:4173`, import the included sample or a plain-text document, and search it. After the service worker has installed, disconnect the network and reload to exercise the offline path.

## Privacy and storage

- Document content, chunks, vectors, searches, and result explanations stay in the browser.
- A Content Security Policy sets `connect-src 'none'`, preventing application code from opening an outbound connection.
- Records are stored in the browser's IndexedDB database `camadb-knowledge-demo-v1`.
- The app provides inspection, JSON export, individual deletion, and delete-all controls.
- Uninstalling the app does not necessarily clear browser site data; use **Delete everything** or the browser's site-storage controls.

The service worker requests only same-origin build assets so the application shell can reload offline. Hosting logs may still record ordinary requests for those static files; no user document content is included in them.

## Retrieval model and limits

The demo splits normalized text into bounded chunks of at most 900 characters, with a 120-character overlap only when a paragraph itself must be split. Files are limited to 2 MB, and CamaDB's 10,000-record atomic mutation limit remains in force.

Its built-in 128-dimensional embedding is a deterministic signed feature hash over tokens and adjacent token pairs. It demonstrates local vector and hybrid execution without downloading a model, but it is lexical—not a production semantic embedding. Applications can inject a real local embedding provider through `@camadb/memory` while retaining the same provenance checks.
