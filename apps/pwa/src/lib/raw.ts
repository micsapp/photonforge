/**
 * Main-thread pool around the RAW extraction worker.
 * Concurrency scales with CPU cores, mirroring the native app's
 * multi-worker thumbnail pipeline.
 */

export interface ExtractResult {
  ok: boolean
  preview: Blob | null
  thumb: Blob | null
  method: string
}

interface Pending {
  resolve: (r: ExtractResult) => void
}

export class RawExtractor {
  private workers: Worker[] = []
  private idle: Worker[] = []
  private pending = new Map<Worker, { id: number; resolve: Pending['resolve'] }>()
  private queue: Array<{ file: File; resolve: (r: ExtractResult) => void }> = []
  private nextId = 1

  constructor() {
    const n = Math.max(2, Math.min(navigator.hardwareConcurrency || 4, 12) - 1)
    for (let i = 0; i < n; i++) this.spawn()
  }

  private spawn() {
    const worker = new Worker(new URL('./raw.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent) => {
      const task = this.pending.get(worker)
      if (!task) return
      this.pending.delete(worker)
      const { preview, thumb, method } = e.data as Omit<ExtractResult, 'ok'>
      task.resolve({ ok: !!preview, preview, thumb, method })
      this.idle.push(worker)
      this.drain()
    }
    worker.onerror = () => {
      const task = this.pending.get(worker)
      if (task) {
        this.pending.delete(worker)
        task.resolve({ ok: false, preview: null, thumb: null, method: 'worker-error' })
        this.idle.push(worker)
        this.drain()
      }
    }
    this.workers.push(worker)
    this.idle.push(worker)
  }

  private drain() {
    while (this.queue.length && this.idle.length) {
      const job = this.queue.shift()!
      const worker = this.idle.pop()!
      const id = this.nextId++
      this.pending.set(worker, { id, resolve: job.resolve })
      worker.postMessage({ id, file: job.file })
    }
  }

  extract(file: File): Promise<ExtractResult> {
    return new Promise((resolve) => {
      this.queue.push({ file, resolve })
      this.drain()
    })
  }

  destroy() {
    for (const w of this.workers) w.terminate()
    this.workers = []
    this.idle = []
    for (const [, t] of this.pending) t.resolve({ ok: false, preview: null, thumb: null, method: 'terminated' })
    this.pending.clear()
  }
}
