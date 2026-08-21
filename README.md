# PhotonForge ⚡

> **High-Performance Open-Source RAW Photo & GPU Darkroom Engine**

PhotonForge is an optimized, production-ready stack for managing tens of thousands of RAW photos (CR2, CR3, NEF, ARW, DNG) powered by **PhotoPrism**, **Darktable OpenCL GPU Acceleration**, and **MariaDB**.

It pairs directly with native desktop apps like **[PhotoGallery (C# / .NET 8)](https://github.com/MrMartellato/PhotoGallery)** and **[digiKam](https://www.digikam.org/)** for fast local culling and management.

---

## 🚀 Quick Start

### 1. Configure Environment
Review and update `.env` passwords:
```bash
nano .env
```

### 2. Point to Your RAW Photos
In `.env`, point `PATH_ORIGINALS` to your RAW photo directory:
* **Linux:** `PATH_ORIGINALS=/mnt/storage/Photos`
* **Windows / WSL 2:** `PATH_ORIGINALS=/mnt/d/Photos/RAW` (or wherever your Windows drive is located)

### 3. Launch PhotonForge
```bash
./manage.sh start
```
Open **[http://localhost:2342](http://localhost:2342)** in your browser.

---

## 💻 Windows Desktop Companion: `PhotoGallery`

For rapid local desktop culling on Windows, use the native C# (.NET 8) app at [MrMartellato/PhotoGallery](https://github.com/MrMartellato/PhotoGallery):
* **Fast Embedded RAW Previews:** Reads embedded JPEGs instantly from CR2/CR3/NEF/ARW files without waiting for full demosaicing.
* **Non-Destructive Workflows:** Point `PhotoGallery` to your RAW folder on Windows (`D:\Photos\RAW`) and mount the same folder in `PhotonForge`.
* **Date Organization & Deduplication:** Organize your imported files into `YYYY-MM-DD` folders with byte-level hash deduplication.

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the complete gap analysis and desktop-to-server sync roadmap.

---

## ⚡ GPU Acceleration (NVIDIA / Intel / AMD)

### NVIDIA GPUs (CUDA & OpenCL)
1. Ensure **NVIDIA Container Toolkit** is installed on Linux / Docker Desktop (WSL 2 handles this automatically).
2. Verify GPU detection inside the container:
   ```bash
   ./manage.sh gpu-check
   ```

### Intel / AMD GPUs (VA-API & OpenCL)
In `docker-compose.yml`, uncomment:
```yaml
devices:
  - "/dev/dri:/dev/dri"
```

---

## 🛠️ CLI Management Commands

Use the bundled `./manage.sh` helper:

```bash
./manage.sh start       # Start in background
./manage.sh stop        # Stop all containers
./manage.sh status      # View container health
./manage.sh logs        # Stream real-time logs
./manage.sh index       # Run full RAW indexing & GPU demosaicing
./manage.sh gpu-check   # Test Darktable & OpenCL inside container
./manage.sh shell       # Open interactive container shell
```

---

## 📁 Directory Structure

```
photonforge/
├── ARCHITECTURE.md      # Full architecture specification (from md.micstec.com)
├── README.md            # Operational documentation
├── docker-compose.yml   # PhotoPrism + MariaDB + GPU definition
├── .env                 # Passwords, ports, and worker counts
├── manage.sh            # Management CLI
├── data/
│   ├── originals/       # (Read-Only) RAW files mounted here
│   ├── storage/         # Generated thumbnails, cache & sidecars
│   └── import/          # Auto-import drop folder
```

---

## 🔒 Non-Destructive Data Safety Guarantee
All RAW originals are mounted as **Read-Only (`:ro`)**. PhotonForge will never modify, overwrite, or delete your original RAW files. All edits, ratings, and generated thumbnails are stored in `.xmp` sidecars and `data/storage`.
