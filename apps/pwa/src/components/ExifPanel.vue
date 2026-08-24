<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { library, libraryRoot } from '../stores/library'
import { readFileByPath } from '../lib/fs'

interface ExifRow {
  label: string
  value: string
  href?: string
}

const rows = ref<ExifRow[]>([])
const loading = ref(false)
const cache = new Map<string, ExifRow[]>()

const photo = computed(() => library.photos.find((p) => p.id === library.selectedId))

watch(
  () => photo.value?.id,
  async (id) => {
    if (!photo.value || id == null) {
      rows.value = []
      return
    }
    const cached = cache.get(id)
    if (cached) {
      rows.value = cached
      return
    }
    loading.value = true
    try {
      const { parse } = await import('exifr')
      const file = await readFileByPath(libraryRoot.value!, photo.value.path)
      const data = await parse(file)
      const d = (data ?? {}) as Record<string, unknown>
      rows.value = buildRows(d)
      cache.set(id, rows.value)
    } catch {
      rows.value = []
    } finally {
      loading.value = false
    }
  },
)

function fmtExposure(v: unknown): string | null {
  if (!v || typeof v !== 'object') return null
  const [num, den] = v as [number, number]
  if (!den) return null
  return `${num}/${den}`
}

function buildRows(d: Record<string, unknown>): ExifRow[] {
  const out: ExifRow[] = []
  const push = (label: string, value: unknown, fmt?: (v: never) => string) => {
    if (value == null || value === '') return
    out.push({ label, value: fmt ? fmt(value as never) : String(value) })
  }

  push('Camera', d.Make && d.Model ? `${d.Make} ${d.Model}`.replace(/\s+/g, ' ') : d.Model)
  push('Lens', d.LensModel ?? d.LensMake)
  const exp = fmtExposure(d.ExposureTime)
  if (exp) out.push({ label: 'Shutter', value: `${exp}s` })
  if (d.FNumber) out.push({ label: 'Aperture', value: `f/${d.FNumber}` })
  if (d.ISO) out.push({ label: 'ISO', value: String(d.ISO) })
  if (d.FocalLength) out.push({ label: 'Focal length', value: `${Math.round(Number(d.FocalLength))}mm` })
  if (d.DateTimeOriginal instanceof Date)
    out.push({ label: 'Taken', value: d.DateTimeOriginal.toLocaleString() })

  const lat = d.latitude as number | undefined
  const lon = d.longitude as number | undefined
  if (lat != null && lon != null) {
    out.push({
      label: 'GPS',
      value: `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
      href: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`,
    })
  }
  push('Size', d.ImageWidth && d.ImageHeight ? `${d.ImageWidth} × ${d.ImageHeight}` : null)
  return out
}
</script>

<template>
  <aside class="exif-panel" :class="{ open: !!photo }">
    <template v-if="photo">
      <h3>Inspector</h3>
      <p class="fname">{{ photo.path }}</p>
      <dl>
        <div v-for="row in rows" :key="row.label" class="row">
          <dt>{{ row.label }}</dt>
          <dd>
            <a v-if="row.href" :href="row.href" target="_blank" rel="noreferrer">{{ row.value }}</a>
            <template v-else>{{ row.value }}</template>
          </dd>
        </div>
      </dl>
      <p v-if="!rows.length && !loading" class="none">No EXIF data found.</p>
      <p v-if="loading" class="none">Reading metadata…</p>
    </template>
  </aside>
</template>

<style scoped>
.exif-panel {
  position: absolute;
  top: 0;
  right: -320px;
  width: 300px;
  bottom: 0;
  background: #12161d;
  border-left: 1px solid #232a36;
  padding: 16px;
  transition: right 0.18s ease;
  overflow-y: auto;
}
.exif-panel.open {
  right: 0;
}
h3 {
  margin: 0 0 4px;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  color: #7c8aa5;
}
.fname {
  font-size: 12px;
  color: #a9b6cc;
  word-break: break-all;
  margin: 0 0 14px;
}
.row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 0;
  border-bottom: 1px solid #1b212c;
  font-size: 13px;
}
dt {
  color: #7c8aa5;
  white-space: nowrap;
}
dd {
  margin: 0;
  color: #e6edf7;
  text-align: right;
  overflow-wrap: anywhere;
}
a {
  color: #4da3ff;
  text-decoration: none;
}
.none {
  color: #55627a;
  font-size: 13px;
}
</style>
