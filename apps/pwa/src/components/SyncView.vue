<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { sync, connect, triggerIndex, saveSyncConfig, loadSyncConfig } from '../lib/sync'
import { library } from '../stores/library'

const form = reactive({ ...sync.config })
const indexing = ref(false)
const indexResult = ref('')

onMounted(async () => {
  await loadSyncConfig()
  Object.assign(form, sync.config)
})

async function doConnect() {
  sync.config = { ...form }
  await connect()
  await saveSyncConfig()
}

async function doIndex() {
  indexing.value = true
  indexResult.value = (await triggerIndex()) || '✅ Index job started'
  indexing.value = false
}
</script>

<template>
  <div class="view">
    <h2>PhotonForge server sync</h2>
    <p class="sub">
      Point this at your PhotonForge instance. The server mounts the same folder
      read-only, so files organized here appear there after triggering an index.
      Remote GPU/AI processing happens entirely server-side.
    </p>

    <div class="card">
      <label>
        Server URL
        <input v-model="form.baseUrl" placeholder="http://localhost:2342" spellcheck="false" />
      </label>
      <label>
        User
        <input v-model="form.username" autocomplete="username" />
      </label>
      <label>
        Password
        <input v-model="form.password" type="password" autocomplete="current-password" />
      </label>
      <div class="actions">
        <button class="primary" @click="doConnect">Connect</button>
        <button class="ghost" :disabled="sync.status !== 'connected' || indexing" @click="doIndex">
          {{ indexing ? 'Triggering…' : 'Trigger server index' }}
        </button>
      </div>
      <p v-if="sync.message" :class="['status', sync.status]">{{ sync.message }}</p>
      <p v-if="indexResult" class="status">{{ indexResult }}</p>
    </div>

    <div class="note card">
      <strong>How sync works</strong>
      <ol>
        <li>Cull / rate / organize locally — ratings are written as standard .xmp sidecars next to each RAW.</li>
        <li>Trigger the server index; PhotoPrism picks up the same files and sidecars via its API.</li>
        <li>AI tagging, face clustering and sharing run on the server with its own database.</li>
      </ol>
      <p v-if="!library.rootHandle" class="warn">Open a photo folder first.</p>
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
h2 {
  margin: 0 0 6px;
}
.sub,
.note p {
  color: #8b99b3;
  font-size: 13px;
  max-width: 560px;
  line-height: 1.5;
}
.card {
  background: #10141b;
  border: 1px solid #1c2330;
  border-radius: 12px;
  padding: 20px;
  margin-top: 16px;
  max-width: 520px;
}
label {
  display: block;
  font-size: 12.5px;
  color: #8b99b3;
  margin-bottom: 12px;
}
input {
  display: block;
  width: 100%;
  margin-top: 4px;
  padding: 9px 12px;
  background: #0b0e13;
  border: 1px solid #232c3d;
  border-radius: 8px;
  color: #e6edf7;
  font-size: 14px;
}
input:focus {
  outline: none;
  border-color: #4da3ff;
}
.actions {
  display: flex;
  gap: 10px;
  margin-top: 4px;
}
.primary {
  background: #2563eb;
  border: none;
  color: white;
  padding: 9px 18px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13.5px;
}
.primary:disabled {
  opacity: 0.5;
}
.ghost {
  background: none;
  border: 1px solid #2a3345;
  color: #a9b6cc;
  padding: 9px 14px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13.5px;
}
.status {
  margin-top: 12px;
  font-size: 13px;
}
.status.connected {
  color: #86e0ab;
}
.status.error {
  color: #ff8a8e;
}
.note ol {
  padding-left: 18px;
  color: #aab6cc;
  font-size: 13px;
  line-height: 1.7;
}
.warn {
  color: #ffb84d;
}
</style>
