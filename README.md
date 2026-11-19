# Edirom Mobile

## Overview

Edirom Mobile is the mobile web client for navigating editions, works, concordances, and view windows in the Edirom ecosystem.

## Deployment

Edirom Mobile is not a standalone application. It is a submodule of [Edirom-Online-Frontend](https://github.com/Edirom/Edirom-Online-Frontend) (`mobile/`) and is copied into the Frontend's build, so it is served at `<frontend>/mobile/`:

- The Frontend redirects mobile devices to `mobile/index.html` (`resources/js/device-gateway.js`) and offers a "switch to mobile" button on the desktop UI. Mobile links back with a "Switch to desktop view" entry in its menu.
- Backend and WebSocket URLs are read from the Frontend's `../config.json`.
- The Edirom web components are **not** part of this repository. `index.html` loads them from the Frontend's submodules in `../resources/js/` (`edirom-concordance-navigator`, `edirom-navigator`, `edirom-annotation-view`, `edirom-text-viewer`, `edirom-image-viewer`, `edirom-controls`, `edirom-qr-code-scanner`, and `edirom-connected-workspace`, which is loaded on demand). They have to stay siblings in that directory, because they import each other (for example `../edirom-core-web-components/src/edirom-icon.js`).

To develop locally, check out Edirom-Online-Frontend with its submodules (`git submodule update --init --recursive`) and serve its build. The WebSocket server for the connected workspace is started from [edirom-ws-server](https://github.com/Edirom/edirom-ws-server).

## Startup URL Parameters

Edirom Mobile supports deep-linking through these URL parameters:

- `edition`: Edition ID
- `work`: Work ID
- `connection`: Concordance connection ID
- `lang`: UI language, `de` or `en` (see [Language](#language))
- `uri`: a document to open, e.g. `xmldb:exist:///db/apps/ed1/sources/source1.xml#surface_12`. The same parameter as in Edirom-Frontend's Desktop UI. It needs `edition`.

Example:

```text
http://localhost:8089/mobile/index.html?edition=edirom_edition_example&work=edirom_work_291f7ad8-9bb8-45eb-9186-801dec2f80d9&connection=test2
```

## Preferences

Edirom Mobile reads the edition's preferences (`prefs.xml`, see `resources/js/preferenceController.js`). Options of the `<web-components>` section are read with `getWebComponentOption` / `getWebComponentFlag`.

- `edirom_concordance_navigator` → `enable_qr_code_scanner`: the QR-code scanner of the Concordance Navigator is **off by default**. It is only enabled if the edition sets `value="true"`:

  ```xml
  <web-components>
      <web-component key="edirom_concordance_navigator">
          <option key="enable_qr_code_scanner" value="true"/>
      </web-component>
  </web-components>
  ```

  Boolean options are opt-in: anything but `true` (case-insensitive) counts as off.

- `edirom_concordance_navigator` → `qr_regex`: a regular expression that a scanned QR code has to match to be acted on. Without it every code is accepted. An invalid regex logs a warning and disables the scanner. Write `&` as `&amp;` and `<` as `&lt;` in the XML.

  ```xml
  <option key="qr_regex" value="^https://qr\.example\.com/"/>
  ```

  Set it whenever the scanner is on: it is also what decides which URLs Mobile may fetch (see below).

### What a scanned QR code does

1. A **document URI** (`xmldb:exist://…`) opens in a view.
2. A link to **Mobile itself** (its own page, or Edirom-Frontend's root, which forwards to Mobile; not with `ui=desktop`) is applied in the running app: edition, work and connection change in place.
3. Any **other `http(s)` URL** is asked for its target once, as it may be a *short link* such as `https://qr.example.com/aGq`: Mobile fetches it with `Accept: application/json` and expects `{"url": "<target>"}`. The target is then handled like a scanned code (steps 1 and 2; any other web page is opened in this tab), but not asked for again. If the request fails (no network, no CORS headers, an error, no valid answer) the URL is opened in this tab as it is.

The resolver only has to answer such requests with JSON and CORS headers; Mobile knows no host names (see `resources/js/shortLinkResolver.js`). Only `http(s)` and `xmldb:` targets are accepted.

## Theming

Colours are not hard-coded. `resources/css/theme-edirom.css` defines the palette as CSS custom properties (the Edirom grey palette, with the names used by Edirom-Frontend's `eo-palette.css`) and is loaded before `styles.css`:

| Token | Default | Used for |
|---|---|---|
| `--eo-primary` | `#333333` | dark surfaces (header, menu, buttons, concordance bar); text on light surfaces |
| `--eo-secondary` | `#cccccc` | text on dark surfaces, view header, control bar fills |
| `--eo-tertiary` | `#ffffff` | page background, popovers, input fields |
| `--eo-highlight` | `#f9d76e` | "filter active" indicator |
| `--eo-background` | `#586e75` | not used by Mobile at the moment |

`styles.css` maps these to the generic `--primary-color`, `--secondary-color` and `--tertiary-color` that the web components read. To use another colour scheme, load a file that sets the same `--eo-*` names instead of `theme-edirom.css`.
