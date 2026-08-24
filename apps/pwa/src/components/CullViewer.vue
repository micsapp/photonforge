<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { filteredPhotos, library, setRating, toggleReject, fullPreviewUrl } from '../stores/library'

const url = ref<string | null>(null)
const loading = ref(false)

const photo = computed(() => {
  const i = library.viewerIndex
  return i != null && i >= 0 && i < filteredPhotos.value.length ? filteredPhotos.value[i] : null
})

const counter = computed(() =>
  photo.value ? `${library.viewerIndex! + 1} / ${filteredPhotos.value.length}` : '',
)

watch(
  () => [photo.value?.id] as const,
  async ([id]) => {
    if (!photo.value || id == null) {
      url.value = null
      return
    }
    loading.value = true
    const u = await fullPreviewUrl(photo.value)
    if (photo.value.id === id) url.value = u
    loading.value = false
  },
  { immediate: true },
)

function close() {
  library.viewerIndex = null
}
function step(delta: number) {
  const n = filteredPhotos.value.length
  if (!n) return
  let i = (library.viewerIndex ?? 0) + delta
  i = Math.max(0, Math.min(n - 1, i))
  library.viewerIndex = i
}

function onKey(e: KeyboardEvent) {
  if (library.viewerIndex == null) return
  switch (e.key) {
    case 'Escape': close(); break
    case 'ArrowRight': case ' ': e.preventDefault(); step(1); break
    case 'ArrowLeft': step(-1); break
    case '0': setRating(photo.value!.id, 0); break
    case '1': case '2': case '3': case '4': case '5':
      setRating(photo.value!.id, Number(e.key)); break
    case 'x': case 'X': toggleReject(photo.value!.id); break
  }
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div v-if="photo" class="cull-overlay" @click.self="close">
      <header class="cull-bar">
        <span class="counter">{{ counter }}</span>
        <span class="fname">{{ photo.name }}</span>
        <button class="close-btn" title="Close (Esc)" @click="close">✕</button>
      </header>

      <div class="cull-stage" @click.self="close">
        <img v-if="url" :src="url" alt="" />
        <div v-else class="loading">{{ loading ? 'Extracting preview…' : 'No preview available' }}</div>
      </div>

      <footer class="cull-controls">
        <button
          v-for="n in 5"
          :key="n"
          class="star"
          :class="{ on: photo.rating >= n }"
          @click="setRating(photo.id, n)"
        >★</button>
        <button class="star clear" :disabled="!photo.rating" @click="setRating(photo.id, 0)">clear</button>
        <button class="reject-btn" :class="{ active: photo.rejected }" @click="toggleReject(photo.id)">
          ✕ Reject <small>(X)</small>
        </button>
      </footer>
    </div>
  </Teleport>
</template>

<style scoped>
.cull-overlay {
  position: fixed;
  inset: 0;
  background: #05070aee;
  z-index: 50;
  display: flex;
  flex-direction: column;
}
.cull-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 16px;
  color: #dfe7f5;
  font-size: 14px;
}
.counter { opacity: 0.7; min-width: 110px; }
.fname { flex: 1; text-align: center; font-weight: 500; }
.close-btn {
  background: none;
  border: none;
  color: #aab6cc;
  font-size: 18px;
  cursor: pointer;
}
.cull-stage {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.cull-stage img {
  max-width: 96%;
  max-height: 92%;
  object-fit: contain;
  box-shadow: 0 8px 48px #000c;
}
.loading { color: #7c8aa5; }
.cull-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px;
}
.star {
  background: none;
  border: none;
  font-size: 30px;
  color: #3a465c;
  cursor: pointer;
  transition: transform 0.08s ease, color 0.12s ease;
}
.star:hover { transform: scale(1.15); }
.star.on { color: #ffb84d; }
.star.clear {
  font-size: 13px;
  color: #7c8aa5;
  margin-left: 14px;
  text-transform: uppercase;
  letter-spacing: 1px;
}
.reject-btn {
  margin-left: 18px;
  background: none;
  border: 1px solid #e5484d66;
  color: #e5484d;
  border-radius: 8px;
  padding: 6px 14px;
  cursor: pointer;
  font-size: 14px;
}
.reject-btn.active {
  background: #e5484d;
  color: white;
}
.reject-btn small { opacity: 0.7; }
</style>
