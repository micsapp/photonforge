<script setup lang="ts">
import { computed, ref } from 'vue'
import { filteredPhotos, library } from '../stores/library'
import { applyPlanEntry, buildPlan, type OrganizeResult } from '../lib/organizer'

const result = ref<OrganizeResult | null>(null)
const running = ref(false)

const plan = computed(() => buildPlan(filteredPhotos.value))

const previewGroups = computed(() => {
  const byDir = new Map<string, number>()
  for (const e of plan.value) byDir.set(e.destDir, (byDir.get(e.destDir) ?? 0) + 1)
  return [...byDir.entries()].sort(([a], [b]) => a.localeCompare(b))
})

async function apply() {
  if (running.value || !plan.value.length) return
  running.value = true
  const res: OrganizeResult = { moved: 0, skipped: 0, errors: [], done: false }
  for (const entry of plan.value) {
    const r = await applyPlanEntry(entry)
    if (r === 'moved') res.moved++
    else if (r === 'skipped') res.skipped++
    else res.errors.push(entry.photo.path)
    library.scanFound = res.moved + res.skipped
  }
  res.done = true
  result.value = res
  running.value = false
}
</script>

<template>
  <div class="view">
    <header class="view-head">
      <div>
        <h2>Date organizer</h2>
        <p>Sorts files into <code>YYYY-MM-DD</code> folders using EXIF capture date (falls back to file date). Identical name+size targets are skipped; sidecars move along.</p>
      </div>
      <button class="primary" :disabled="running || !plan.length" @click="apply">
        {{ running ? `Moving… ${library.scanFound}` : `Move ${plan.length} files` }}
      </button>
    </header>

    <div v-if="previewGroups.length" class="groups">
      <div v-for="[dir, count] in previewGroups" :key="dir" class="group-row">
        <span class="folder">📁 {{ dir }}</span>
        <span class="count">{{ count }} files</span>
      </div>
    </div>
    <p v-else class="empty">Everything is already organized. ✨</p>

    <div v-if="result" class="result">
      ✅ Moved {{ result.moved }}, skipped {{ result.skipped }}
      <span v-if="result.errors.length">, {{ result.errors.length }} failed</span>
    </div>
  </div>
</template>

<style scoped>
.view {
  position: absolute;
  inset: 0;
  overflow-y: auto;
  padding: 24px;
}
.view-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 20px;
}
h2 {
  margin: 0 0 6px;
  font-size: 18px;
}
p {
  color: #8b99b3;
  font-size: 13px;
  max-width: 560px;
  line-height: 1.5;
}
code {
  background: #1a2230;
  padding: 1px 6px;
  border-radius: 4px;
}
.primary {
  background: #2563eb;
  border: none;
  color: white;
  padding: 10px 18px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  flex-shrink: 0;
}
.primary:disabled {
  opacity: 0.45;
  cursor: default;
}
.groups {
  border: 1px solid #1c2330;
  border-radius: 12px;
  overflow: hidden;
}
.group-row {
  display: flex;
  justify-content: space-between;
  padding: 9px 16px;
  font-size: 13.5px;
  border-bottom: 1px solid #161c26;
}
.group-row:nth-child(odd) {
  background: #10141b;
}
.count {
  color: #7c8aa5;
}
.empty {
  color: #55627a;
  text-align: center;
  margin-top: 80px;
}
.result {
  margin-top: 16px;
  padding: 12px 16px;
  background: #12271c;
  border: 1px solid #1d4a33;
  border-radius: 10px;
  color: #86e0ab;
  font-size: 13.5px;
}
</style>
