# Edirom Mobile

## Overview

Edirom Mobile is the mobile web client for navigating editions, works, concordances, and view windows in the Edirom ecosystem.

## Deployment

Edirom Mobile is not a standalone application. It is a submodule of [Edirom-Online-Frontend](https://github.com/Edirom/Edirom-Online-Frontend) (`mobile/`) and is copied into the Frontend's build, so it is served at `<frontend>/mobile/`:

- The Frontend redirects mobile devices to `mobile/index.html` (`resources/js/device-gateway.js`) and offers a "switch to mobile" button on the desktop UI. Mobile links back with "Zur Desktop-Ansicht".
- Backend and WebSocket URLs are read from the Frontend's `../config.json`.
- The Edirom web components are **not** part of this repository. `index.html` loads them from the Frontend's submodules in `../resources/js/` (`edirom-concordance-navigator`, `edirom-navigator`, `edirom-annotation-view`, `edirom-text-viewer`, `edirom-image-viewer`, `edirom-controls`, `edirom-qr-code-scanner`, and `edirom-connected-workspace`, which is loaded on demand). They have to stay siblings in that directory, because they import each other (for example `../edirom-core-web-components/src/edirom-icon.js`).

To develop locally, check out Edirom-Online-Frontend with its submodules (`git submodule update --init --recursive`) and serve its build. The WebSocket server for the connected workspace is started from [edirom-ws-server](https://github.com/Edirom/edirom-ws-server).

## Startup URL Parameters

Edirom Mobile supports deep-linking through three URL parameters:

- `edition`: Edition ID
- `work`: Work ID
- `connection`: Concordance connection ID

Example:

```text
http://localhost:8089/mobile/index.html?edition=edirom_edition_example&work=edirom_work_291f7ad8-9bb8-45eb-9186-801dec2f80d9&connection=test2
```
