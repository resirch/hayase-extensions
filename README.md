# Hayase Extensions

A collection of extensions for [Hayase](https://hayase.watch).

## Install

In Hayase, open **Settings → Extensions → Add Extension** and paste the manifest URL:

```
https://raw.githubusercontent.com/resirch/hayase-extensions/main/index.json
```

All extensions in this manifest will be added at once. Toggle individual ones from the extensions list.

## Included extensions

| Name | Type | Source | Notes |
|------|------|--------|-------|
| Nyaa | torrent | [nyaa.si](https://nyaa.si) | English-translated anime (category `1_2`). Reads the official RSS feed directly via Hayase's CORS bypass. |

## Extensions

### Nyaa

- Searches `nyaa.si` for English-translated anime (`c=1_2`).
- `single(query)` searches `<title> <zero-padded-episode> <resolution>p`.
- `batch(query)` searches `<title> batch <resolution>p`.
- `movie(query)` searches `<title> <resolution>p`.
- Query exclusions become Nyaa negative search terms (`-x265`, `-web-dl`, etc.).
- Option **Sort by date** — order results by upload date instead of seeders.

Accuracy is set to `medium` because results come from string searches; titles such as "S01E01" or "01v2" can leak through. Hayase re-scrapes peer counts before presenting results.

## Repo layout

```
.
├── index.json          # combined manifest (an array of extensions)
├── src/                # extension sources
│   └── nyaa.js
├── dist/               # bundled output served to Hayase
│   └── nyaa.js
└── test/run.mjs        # live integration check
```

## Build

```sh
npm install
npm run build           # writes dist/*.js
npm run build:min       # minified
npm test                # live check against nyaa.si
```

To add a new extension:
1. Add `src/<name>.js` exporting `{ test, single, batch, movie }` (or the subset that applies).
2. Add a build target to `package.json` (or extend the existing one to glob `src/*.js`).
3. Append a new manifest object to `index.json`.

## License

MIT
