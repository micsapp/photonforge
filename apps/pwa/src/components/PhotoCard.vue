<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { thumbUrl } from '../stores/library'
import type { PhotoRecord } from '../lib/db'

const props = defineProps<{ photo: PhotoRecord }>()
const emit = defineEmits<{ open: [] }>()

const url = ref<string | null>(null)
let objectUrl: string | null = null

onMounted(async () => {
  objectUrl = await thumbUrl(props.photo)
  url.value = objectUrl
})
</script>

<template>
  <div class="tile" :class="{ rejected: photo.rejected }" title="Click to open cull view" @click="emit('open')">
    <img v-if="url" :src="url" loading="lazy" alt="" />
    <div v-else class="placeholder"><span>{{ photo.ext.toUpperCase() }}</span></div>
    <div class="tile-badges">
      <span v-if="photo.rating" class="stars">{{ '★'.repeat(photo.rating) }}</span>
      <span v-if="photo.rejected" class="reject-badge">✕</span>
    </div>
    <span class="tile-name">{{ photo.name }}</span>
  </div>
</template>

<style scoped>
.tile {
  position: relative;
  flex: 0 0 auto;
  border-radius: 10px;
  overflow: hidden;
  background: #171c24;
  cursor: pointer;
  border: 1px solid transparent;
}
.tile:hover {
  border-color: rgba(77, 163, 255, 0.4);
}
.tile.rejected img {
  opacity: 0.35;
}
.tile img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #55627a;
  font-size: 13px;
  letter-spacing: 1px;
}
.tile-badges {
  position: absolute;
  top: 6px;
  left: 8px;
  right: 8px;
  display: flex;
  justify-content: space-between;
  pointer-events: none;
}
.stars {
  color: #ffb84d;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
  font-size: 15px;
}
.reject-badge {
  background: #e5484d;
  color: white;
  border-radius: 50%;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}
.tile-name {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 14px 8px 4px;
  font-size: 11px;
  color: #dfe7f5;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.65));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
