# Hayase Extensions

A collection of extensions for [Hayase](https://hayase.watch).

## Install

In Hayase, open **Settings → Extensions → Add Extension** and paste the manifest URL:

```
https://raw.githubusercontent.com/resirch/hayase-extensions/main/index.json
```

All three extensions in this manifest are added at once. Toggle individual ones from the extensions list.

## Included extensions

| Name | Type | Accuracy | Source | Lookup |
|------|------|----------|--------|--------|
| Nyaa | torrent | medium | [nyaa.si](https://nyaa.si) RSS | title + episode (string) |
| SeaDex | torrent | high | [releases.moe](https://releases.moe) API | AniList ID |
| AnimeTosho | torrent | high | [feed.animetosho.org](https://animetosho.org) JSON | AniDB IDs |

### Nyaa

- Searches `nyaa.si` for English-translated anime (category `1_2`).
- `single(query)` → `<title> <zero-padded-episode> <resolution>p`.
- `batch(query)` → `<title> batch <resolution>p`.
- `movie(query)` → `<title> <resolution>p`.
- Exclusions from the query become Nyaa negative search terms (`-x265`, `-web-dl`, etc.).
- Option **Sort by date** — order by upload date instead of seeders.

### SeaDex

- Looks up curated "best release" entries on [releases.moe](https://releases.moe) by AniList ID.
- Returns torrents tagged `best` (community-verified best release) or `alt` (good alternatives).
- Skips redacted entries (private trackers).
- For `batch`, filters to torrents with at least `episodeCount` files.
- Requires AniList ID in the query — throws a user-friendly error if missing.

### AnimeTosho

- Queries [feed.animetosho.org](https://feed.animetosho.org) by AniDB IDs.
- `single` needs `anidbEid` (episode ID); `batch` / `movie` need `anidbAid` (anime ID).
- Resolution and exclusions are baked into the AnimeTosho advanced-query string (`qx=1&q=...`).
- Fake DHT peer counts (≥30000) are zeroed out.
- Entries with `anidb_fid` (mapped file) report accuracy `high`; others `medium`.

## Repo layout

```
.
├── index.json          # combined manifest (array of extensions)
├── src/                # extension sources
│   ├── nyaa.js
│   ├── seadex.js
│   └── animetosho.js
├── dist/               # bundled output served to Hayase
├── scripts/build.mjs   # esbuild driver — bundles every src/*.js
└── test/run.mjs        # live integration check
```

## Build

```sh
npm install
npm run build           # writes dist/*.js
npm run build:min       # minified
npm test                # live check against all three sources
```

Adding a new extension:
1. Drop `src/<name>.js` exporting `{ test, single, batch, movie }` (or the subset that applies).
2. Append a new manifest object to `index.json` (with the `code` URL pointing at `dist/<name>.js`).
3. `npm run build` — the build script bundles every file in `src/` automatically.

## License

MIT
