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

> **Implemented:** `Dockerfile` builds a custom PhotoPrism image with the NVIDIA
> OpenCL ICD registered, and `config/darktable/darktablerc` controls Darktable
> acceleration. The stack was verified end-to-end on this machine (WSL2 +
> RTX 5070 Ti + docker.io engine).

### NVIDIA on WSL 2 (current setup)
CUDA works (verified via `nvidia-smi` inside the container), but **NVIDIA OpenCL is
not available in WSL 2 containers** — WSL only exposes the GPU through `/dev/dxg`
(CUDA); OpenCL requires `/dev/nvidia0`, which WSL does not provide. Therefore
`config/darktable/darktablerc` keeps `opencl=false` to avoid a failed-init delay
(~0.5 s) on every RAW conversion. Darktable demosaicing runs multi-core CPU.

### Native Linux with NVIDIA / Intel / AMD GPU
1. Ensure **nvidia-container-toolkit** is installed (`sudo nvidia-ctk runtime configure --runtime=docker && sudo systemctl restart docker`).
2. Set `opencl=true` in `config/darktable/darktablerc`.
3. For Intel / AMD GPUs, uncomment `/dev/dri` in `docker-compose.yml`.
4. Rebuild: `docker compose up -d --build`

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

> **Note:** On this machine Docker runs natively inside WSL 2 (docker.io +
> `docker-compose-v2`). If `./manage.sh` reports `docker-compose: command not found`,
> use `docker compose ...` (v2 syntax) or install `docker-compose-v2`.

---

## 📁 Directory Structure

```
photonforge/
├── ARCHITECTURE.md        # Full architecture specification (from md.micstec.com)
├── README.md              # Operational documentation
├── docker-compose.yml     # PhotoPrism + MariaDB + GPU definition
├── Dockerfile             # PhotoPrism image + NVIDIA OpenCL ICD registration
├── config/
│   └── darktable/
│       └── darktablerc    # Darktable OpenCL / processing settings
├── .env                   # Passwords, ports, worker counts, photo paths
├── manage.sh              # Management CLI
├── data/
│   ├── originals/         # Default originals location (see PATH_ORIGINALS)
│   ├── storage/           # Generated thumbnails, cache & sidecars
│   └── import/            # Auto-import drop folder
```

Current `.env` points `PATH_ORIGINALS=/mnt/c/prg/rawPhotosTest` (~4,060 files:
ARW + JPG, 121 GB).

---

## 🔒 Non-Destructive Data Safety Guarantee
All RAW originals are mounted as **Read-Only (`:ro`)**. PhotonForge will never modify, overwrite, or delete your original RAW files. All edits, ratings, and generated thumbnails are stored in `.xmp` sidecars and `data/storage`.
