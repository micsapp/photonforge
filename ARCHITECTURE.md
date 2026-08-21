# PhotonForge & Windows Native PhotoGallery Architecture Guide

## 1. Executive Summary & Tool Comparison

Managing tens of thousands of RAW photos (CR2, CR3, NEF, ARW, DNG) requires specialized tools for non-destructive storage, high-throughput GPU processing, rapid desktop culling, and mobile cloud sync.

### Open-Source Solutions Comparison

| Tool | Type | Key Tech Stack | Database | GPU RAW Processing | Primary Strength |
| :--- | :--- | :--- | :--- | :---: | :--- |
| **[PhotoPrism](https://www.photoprism.app/)** | Server / Web | Go (Golang), Vue.js, TensorFlow | MariaDB / SQLite | **Yes (Darktable OpenCL)** | Best server for GPU-accelerated RAW demosaicing and folder-first indexing. |
| **[PhotoGallery (Windows)](https://github.com/MrMartellato/PhotoGallery)** | Native Windows Desktop | C# (.NET 8), WPF, Magick.NET | SQLite | Embedded JPEG Extractor | Fast native Windows UI, virtualized grid, fast embedded RAW preview, date organizer. |
| **[Immich](https://immich.app/)** | Server / Web / Mobile | TypeScript, Python, Flutter | PostgreSQL (`pgvector`) + Redis | No (CPU only; GPU for AI/Video) | Best overall Google Photos replacement; native mobile auto-sync; CLIP AI search. |
| **[digiKam](https://www.digikam.org/)** | Desktop DAM | C++ (Qt) | SQLite / MariaDB | UI OpenGL | Gold standard for local 10k–100k+ RAW culling and `.xmp` metadata. |
| **[Darktable](https://www.darktable.org/)** | Desktop RAW Developer | C / C++ (GTK) | SQLite | **Full 100% OpenCL Pipeline** | Industry-standard open-source 32-bit floating-point GPU RAW developer. |

---

## 2. Windows Native App Audit: `MrMartellato/PhotoGallery`

We analyzed the native Windows application codebase at [`https://github.com/MrMartellato/PhotoGallery`](https://github.com/MrMartellato/PhotoGallery).

### What `PhotoGallery` Currently Implements Well:
1. **WPF Virtualized Grid (.NET 8):** Fast UI that handles thousands of photos smoothly with virtualized row containers.
2. **Embedded RAW Preview Extraction:** Implements `ExifReader.GetEmbeddedPreview` to pull full-resolution embedded JPEGs from RAW files before falling back to full demosaicing.
3. **Comprehensive EXIF Inspector:** Uses `MetadataExtractor` to expose shutter speed, aperture, ISO, focal length, lens, and GPS.
4. **Content-Hash Tagging:** Uses SQLite (`tags.db`) with SHA-1/SHA-256 hashes so tags persist across file moves and renames.
5. **Batch Date Organizer:** Sorts messy folders into `YYYY-MM-DD` directory hierarchies (Move/Copy with duplicate skipping).
6. **Duplicate Finder:** Byte-exact hash deduplication with bulk Recycle Bin deletion.

---

### Gap Analysis: Missing Functions from Our Target Plan

| Feature / Architecture | Present in `PhotoGallery`? | Target Architectural Plan | Impact & Recommendation |
| :--- | :---: | :--- | :--- |
| **PhotoPrism / Server Integration** | ❌ **Missing** | Sync tags, albums, and upload batches to `PhotonForge` via PhotoPrism REST API. | Add a PhotoPrism API service to allow 1-click sync between desktop and web server. |
| **Standard `.xmp` Sidecars** | ❌ **Missing** | Read/write tags and ratings to standard `.xmp` sidecar files compatible with Darktable, digiKam, and PhotoPrism. | Replace/supplement internal SQLite `tags.db` with standard XMP sidecar generation. |
| **1–5 Star Rating & Culling** | ❌ **Missing** | Fast hotkey culling (`1-5` for stars, `0` to unrate, `X` to reject) for photographers. | Add `Rating` property to `PhotoItem` and bind to keyboard shortcuts. |
| **Direct GPU RAW Demosaicing** | ⚠️ **Partial** (CPU Magick.NET) | Offload full demosaicing to OpenCL (`darktable-cli`) or DirectX 12 Compute Shaders. | Hook into `darktable-cli` OpenCL or LibRaw C++ DLL for non-embedded RAW fallback. |
| **Thumbnail Concurrency** | ⚠️ **Throttled** (2 workers) | Multi-core parallel decoding (4–16 worker threads matching CPU cores). | Change `_thumbWorkers >= 2` limit to `Environment.ProcessorCount`. |
| **Interactive Map / Geolocation** | ❌ **Missing** | Interactive map pins for GPS EXIF data. | Add an OpenStreetMap / WebView2 map popup for geotagged photos. |
| **AI / Semantic Search** | ❌ **Missing** | Natural language photo search (via PhotoPrism server or local DirectML/ONNX). | Query PhotoPrism CLIP search endpoint from the search bar. |

---

## 3. Recommended Desktop + Server Architecture

```mermaid
flowchart TD
    subgraph Windows Desktop Client "PhotoGallery (.NET 8 WPF)"
        A["Local RAW Photos (D:\Photos\RAW)"] --> B["Fast Embedded JPEG Decoder \n(ExifReader)"]
        B --> C["Virtualized 120 FPS Gallery Grid"]
        C --> D["Culling & 1-5 Star Ratings \n(Writes .xmp Sidecars)"]
        D --> E["PhotoPrism REST API Sync Client \n• Uploads new batches\n• Triggers remote GPU indexing\n• Syncs tags & albums"]
    end

    subgraph Server Engine "PhotonForge (PhotoPrism + MariaDB)"
        E <-->|"REST API / WebSockets"| F["PhotoPrism Server \n• Darktable OpenCL GPU Demosaicing\n• MariaDB High Concurrency\n• AI Scene & Face Tagging"]
        F <--> G["Mobile Web / Remote Access"]
    end
```

---

## 4. Native Windows App Extension Roadmap for `PhotoGallery`

To upgrade `PhotoGallery` into the complete companion client for `PhotonForge`:

### Step 1: Add `.xmp` Sidecar Synchronization
```csharp
// Example: Write standard XMP sidecar for PhotoPrism/Darktable compatibility
public static void WriteXmpSidecar(string photoPath, int rating, List<string> tags)
{
    string xmpPath = photoPath + ".xmp";
    string xmpContent = $@"<x:xmpmeta xmlns:x=""adobe:ns:meta/"">
  <rdf:RDF xmlns:rdf=""http://www.w3.org/1999/02/22-rdf-syntax-ns#"">
    <rdf:Description rdf:about="""" xmlns:xmp=""http://ns.adobe.com/xap/1.0/"" xmlns:dc=""http://purl.org/dc/elements/1.1/"">
      <xmp:Rating>{rating}</xmp:Rating>
      <dc:subject>
        <rdf:Bag>
          {string.Join("\n          ", tags.Select(t => $"<rdf:li>{t}</rdf:li>"))}
        </rdf:Bag>
      </dc:subject>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>";
    File.WriteAllText(xmpPath, xmpContent);
}
```

### Step 2: Add PhotoPrism REST API Client
Add a background sync service calling `http://localhost:2342/api/v1/`:
* `POST /api/v1/session` — Authenticate using `.env` credentials.
* `POST /api/v1/index` — Trigger server GPU indexing after organizing files.
* `POST /api/v1/import` — Auto-upload newly imported photos.

### Step 3: Uncap Thumbnail Concurrency
In `ViewModels/MainViewModel.cs`:
```csharp
// Replace fixed limit of 2 with CPU core count
private void EnsureThumbWorkers()
{
    lock (_thumbQueue)
    {
        int maxWorkers = Math.Max(2, Environment.ProcessorCount - 1);
        if (_thumbWorkers >= maxWorkers) return;
        _thumbWorkers++;
    }
    _ = ThumbWorkerAsync();
}
```

---

## 5. The Built Server Stack: `PhotonForge`

The server stack is deployed at `/home/mli/photonforge`.

### Directory Tree
```
photonforge/
├── ARCHITECTURE.md      # Downloaded architecture spec (from md.micstec.com)
├── README.md            # Quick-start & operational documentation
├── docker-compose.yml   # PhotoPrism + MariaDB 11 + GPU passthrough
├── .env                 # Passwords, paths, worker counts, GPU presets
├── manage.sh            # Management CLI (start, stop, index, gpu-check)
└── data/
    ├── originals/       # (Read-only) Mount point for RAW files
    ├── storage/         # Generated thumbnails & cache
    └── import/          # Auto-import drop folder
```
