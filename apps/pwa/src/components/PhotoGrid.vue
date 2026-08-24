<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RecycleScroller } from 'vue-virtual-scroller'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'
import PhotoCard from './PhotoCard.vue'
import { filteredPhotos, library } from '../stores/library'
import type { PhotoRecord } from '../lib/db'

const CELL = 200
const GAP = 8
const viewport = ref<HTMLElement | null>(null)
const cols = ref(4)
let observer: ResizeObserver | null = null

onMounted(() => {
  observer = new ResizeObserver(measure)
  if (viewport.value) observer.observe(viewport.value)
  measure()
})

function measure() {
  const w = viewport.value?.clientWidth ?? 800
  cols.value = Math.max(1, Math.floor((w - GAP) / (CELL + GAP)))
}

const rows = computed(() => {
  const out: Array<{ key: number; photos: PhotoRecord[] }> = []
  const list = filteredPhotos.value
  for (let i = 0; i < list.length; i += cols.value) {
    out.push({ key: i, photos: list.slice(i, i + cols.value) })
  }
  return out
})

function open(rowIndex: number) {
  library.viewerIndex = rowIndex * cols.value
  if (library.viewerIndex! >= filteredPhotos.value.length) library.viewerIndex = filteredPhotos.value.length - 1
}
</script>

<template>
  <div ref="viewport" class="grid-viewport">
    <RecycleScroller
      class="grid-scroller"
      :items="rows"
      :item-size="CELL + GAP"
      key-field="key"
      :buffer="800"
    >
      <template #default="{ item: row, index: rowIndex }">
        <div class="grid-row" :style="{ paddingLeft: GAP + 'px' }">
          <PhotoCard
            v-for="photo in row.photos"
            :key="photo.id"
            :photo="photo"
            @open="open(rowIndex)"
          />
        </div>
      </template>
    </RecycleScroller>

    <div v-if="!filteredPhotos.length && !library.scanning" class="empty">
      <p>No photos yet.</p>
      <p class="hint">Open your photo folder from the toolbar to build the catalog.</p>
    </div>
  </div>
</template>

<style scoped>
.grid-viewport {
  position: absolute;
  inset: 0;
  overflow-y: auto;
}
.grid-row {
  display: flex;
  gap: 8px;
}
.empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #7c8aa5;
}
.hint {
  font-size: 13px;
  opacity: 0.7;
}
</style>
