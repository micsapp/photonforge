<script setup lang="ts">
import { computed, ref } from 'vue'
import { library } from '../stores/library'
import {
  duplicateGroups,
  hashMissing,
  hashProgress,
  quarantineDuplicates,
} from '../lib/dedupe'

const groups = computed(() => duplicateGroups(library.photos))
const hashing = computed(() => hashProgress.running)
const quarantining = ref<string | null>(null)

async function startHashing() {
  await hashMissing()
}

async function quarantineGroup(hash: string, keepId: string) {
  quarantining.value = hash
  const group = groups.value.find((g) => g[0].hash === hash)!
  await quarantineDuplicates(group, keepId)
  quarantining.value = null
}
</script>

<template>
  <div class="view">
    <header class="view-head">
      <div>
        <h2>Duplicate finder</h2>
        <p>
          Byte-exact SHA-256 comparison. Duplicates are moved to
          <code>_quarantine/</code> — browsers cannot use the Recycle Bin.
        </p>
      </div>
      <button class="primary" :disabled="hashing" @click="startHashing">
        {{ hashing ? `Hashing ${hashProgress.done}/${hashProgress.total}` : 'Scan for duplicates' }}
      </button>
    </header>

    <p v-if="!groups.length && !hashing" class="empty">
      No duplicates found (or hashing not run yet).
    </p>

    <div v-for="group in groups" :key="group[0].hash!" class="dup-group">
      <div class="group-title">
        <code>{{ group[0].hash!.slice(0, 16) }}…</code>
        <span>{{ group.length }} identical files</span>
      </div>
      <div v-for="p in group" :key="p.id" class="member" :class="{ keeper: false }">
        <span class="path">{{ p.path }}</span>
        <button
          class="ghost"
          :disabled="quarantining === group[0].hash"
          @click="quarantineGroup(group[0].hash!, p.id)"
        >
          keep this, remove others
        </button>
      </div>
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
  font-size: 12px;
}
.primary,
.ghost {
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
  opacity: 0.5;
  cursor: default;
}
.ghost {
  background: none;
  border: 1px solid #e5484d66;
  color: #ff8a8e;
  padding: 5px 10px;
  font-size: 12px;
}
.empty {
  text-align: center;
  color: #55627a;
  margin-top: 80px;
}
.dup-group {
  border: 1px solid #232f42;
  border-radius: 12px;
  margin-bottom: 14px;
  overflow: hidden;
}
.group-title {
  display: flex;
  justify-content: space-between;
  padding: 9px 16px;
  background: #131b28;
  font-size: 12.5px;
  color: #8b99b3;
}
.member {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  border-top: 1px solid #161c26;
  font-size: 13px;
}
.path {
  color: #c7d3e8;
  word-break: break-all;
}
</style>
