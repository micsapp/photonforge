# PhotoForge PWA

Local-first RAW photo culling, rating and organizing — installable as a
Windows app (Edge/Chrome → *Settings → Apps → Install this site as an app*).

Replaces the planned C# desktop companion (ARCHITECTURE.md §4) with a web app
that has feature parity with `MrMartellato/PhotoGallery`:

| PhotoGallery function | PWA module |
|---|---|
| Embedded RAW preview extraction (`ExifReader.GetEmbeddedPreview`) | `src/lib/raw.worker.ts` — TIFF IFD walker (ARW/NEF/CR2/DNG/RW2/ORF) + CR3 ISO-BMFF parser + SOI/EOI byte-scan fallback; rejects SOF3 lossless-RAW streams |
| Thumbnail concurrency | worker pool scaled to CPU cores (`src/lib/raw.ts`) |
| EXIF inspector | `src/components/ExifPanel.vue` via exifr (incl. GPS → OpenStreetMap link) |
| Content-hash tagging | SHA-256 in `src/lib/hash.ts`, persisted in IndexedDB (`src/lib/db.ts`) — survives moves/renames |
| Batch date organizer (YYYY-MM-DD, dup-skip) | `src/lib/organizer.ts` + Organizer view |
| Duplicate finder | `src/lib/dedupe.ts` — full-file SHA-256 groups; removals go to `_quarantine/` (browsers cannot use Recycle Bin) |
| `.xmp` sidecars | `src/lib/xmp.ts` — writes `xmp:Rating`, Reject label, `dc:subject`; reads them back on scan (digiKam/Lightroom/PhotoPrism compatible) |
| PhotonForge sync | `src/lib/sync.ts` — PhotoPrism session auth + index trigger |

## Run

```bash
cd apps/pwa
npm install
npm run dev        # dev server
npm run build      # production bundle → dist/
npm run preview    # serve the built bundle
```

Open the served URL in Edge on Windows and click **Install** (or
*Settings → Apps*) to get a standalone window.

## Usage

1. **Open photo folder** — pick your RAW library root (e.g. `D:\Photos\RAW`).
   The handle is remembered; next launch just click **Reconnect**.
2. The pipeline scans recursively, then extracts embedded previews in
   background workers (~100–300 ms per RAW, no demosaic).
3. **Cull**: click a tile to open the viewer.
   - `1`–`5` rate · `0` clear · `X` reject · `←`/`→` navigate · `Esc` close
   - Ratings are written to `<file>.xmp` sidecars immediately.
4. **Organizer** — preview the date grouping, then apply moves (sidecars move too).
5. **Duplicates** — hash the library, review identical groups, keep one and
   quarantine the rest.
6. **Sync** — point at PhotonForge (`http://localhost:2342`), connect, trigger
   server indexing after organizing.

## Notes

- Requires a Chromium browser (Edge/Chrome ≥ 86) for File System Access API;
  Firefox/Safari fall back to read-only demo behavior without folder picking.
- Originals are never modified — only sidecar files are written, and moves are
  copy+delete of untouched bytes.
- Full-resolution pixel peeping uses cache-on-first-view: embedded previews are
  extracted on demand in the culling viewer, thumbnails persist in IndexedDB.
