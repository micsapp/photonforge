<script setup lang="ts">
import { onMounted, ref } from 'vue'
import {
  library,
  chooseRoot,
  attachSavedRoot,
  reauthorizeRoot,
  forgetRoot,
  rescan,
} from './stores/library'
import { setSetting } from './lib/db'
import PhotoGrid from './components/PhotoGrid.vue'
import CullViewer from './components/CullViewer.vue'
import ExifPanel from './components/ExifPanel.vue'
import OrganizerView from './components/OrganizerView.vue'
import DuplicatesView from './components/DuplicatesView.vue'
import SyncView from './components/SyncView.vue'

const view = ref<'library' | 'organizer' | 'duplicates' | 'sync'>('library')

const VIEWS = [
  { key: 'library', label: 'Library' },
  { key: 'organizer', label: 'Organizer' },
  { key: 'duplicates', label: 'Duplicates' },
  { key: 'sync', label: 'Sync' },
] as const

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'unrated', label: 'Unrated' },
  { key: 'rated', label: 'Rated' },
  { key: 'picks', label: 'Picks ≥3★' },
  { key: 'rejected', label: 'Rejected' },
] as const

onMounted(async () => {
  await attachSavedRoot()
})

async function openFolder() {
  if (!(await chooseRoot())) return
  await setSetting('lastRootName', library.rootName)
}

async function reconnect() {
  if (await reauthorizeRoot()) await rescan()
}

async function disconnect() {
  await forgetRoot()
  location.reload()
}
</script>

<template>
  <div class="app">
    <header class="topbar">
      <div class="brand">PhotoForge<span class="cursor">_</span></div>

      <button v-if="!library.rootHandle" class="primary" @click="openFolder">
        📁 Open photo folder
      </button>
      <template v-else>
        <span class="root-name" title="Attached library root">📂 {{ library.rootName }}</span>
        <button class="ghost" @click="reconnect">Reconnect</button>
        <button class="ghost" @click="disconnect">Disconnect</button>
      </template>

      <nav class="filters">
        <button
          v-for="f in FILTERS"
          :key="f.key"
          :class="{ active: library.filter === f.key }"
          @click="library.filter = f.key"
        >
          {{ f.label }}
        </button>
      </nav>

      <nav class="views">
        <button
          v-for="v in VIEWS"
          :key="v.key"
          class="view-tab"
          :class="{ active: view === v.key }"
          @click="view = v.key"
        >
          {{ v.label }}
        </button>
      </nav>

      <span class="stats">{{ library.photos.length }} photos</span>
    </header>

    <div v-if="library.scanning || library.extracting" class="pipeline-bar">
      <span v-if="library.scanning">Scanning… {{ library.scanFound }} files found</span>
      <template v-else>
        Building previews: {{ library.extractDone }} / {{ library.photos.length }}
        <progress :value="library.extractDone" :max="library.photos.length" />
      </template>
    </div>

    <main class="workspace">
      <template v-if="view === 'library'">
        <PhotoGrid />
        <ExifPanel />
      </template>
      <OrganizerView v-else-if="view === 'organizer'" />
      <DuplicatesView v-else-if="view === 'duplicates'" />
      <SyncView v-else />
    </main>

    <CullViewer />
  </div>
</template>

<style scoped>
.app {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #0e1116;
  color: #dfe7f5;
}
.topbar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 16px;
  border-bottom: 1px solid #1c2330;
  background: #10141b;
  flex-wrap: wrap;
}
.brand {
  font-weight: 700;
  font-size: 17px;
  letter-spacing: 0.5px;
  color: #4da3ff;
}
.cursor { animation: blink 1.2s steps(1) infinite; }
@keyframes blink { 50% { opacity: 0; } }

.root-name {
  font-size: 13px;
  color: #a9b6cc;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.primary {
  background: #2563eb;
  border: none;
  color: white;
  padding: 8px 14px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
}
.primary:hover { background: #3b82f6; }
.ghost {
  background: none;
  border: 1px solid #2a3345;
  color: #a9b6cc;
  padding: 6px 12px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 12px;
}
.filters {
  display: flex;
  gap: 4px;
  
}
.filters button {
  background: none;
  border: none;
  color: #7c8aa5;
  padding: 7px 11px;
  border-radius: 7px;
  cursor: pointer;
  font-size: 13px;
}
.filters button:hover { color: #dfe7f5; }
.filters button.active {
  background: #1a2230;
  color: #4da3ff;
}
.stats {
  font-size: 12px;
  color: #55627a;
}
.views {
  display: flex;
  gap: 4px;
  margin-left: auto;
}
.view-tab {
  background: none;
  border: none;
  color: #7c8aa5;
  padding: 8px 14px;
  border-radius: 7px;
  cursor: pointer;
  font-size: 13.5px;
}
.view-tab:hover {
  color: #dfe7f5;
}
.view-tab.active {
  background: #1a2230;
  color: #4da3ff;
}
.pipeline-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 16px;
  background: #14202e;
  color: #9ecbff;
  font-size: 12.5px;
  border-bottom: 1px solid #1c2330;
}
progress { accent-color: #4da3ff; width: 220px; }
.workspace {
  position: relative;
  flex: 1;
  overflow: hidden;
}
</style>
