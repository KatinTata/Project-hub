// Glavna nit: red poslova ka svgWorker.thread.js (P2-B5). Jedan trajni worker
// obrađuje renderovanja sekvencijalno — prirodno ograničenje paralelnosti;
// pri padu workera svi tekući poslovi dobijaju grešku i worker se ponovo
// podiže pri sledećem pozivu.
import { Worker } from 'node:worker_threads'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WORKER_PATH = path.join(__dirname, 'svgWorker.thread.js')

let worker = null
let seq = 0
const pending = new Map()

function ensureWorker() {
  if (worker) return worker
  worker = new Worker(WORKER_PATH)
  worker.unref() // ne drži proces u životu kad nema posla
  worker.on('message', ({ id, png, error }) => {
    const job = pending.get(id)
    if (!job) return
    pending.delete(id)
    if (error) job.reject(new Error(error))
    else job.resolve(Buffer.from(png))
  })
  const fail = err => {
    for (const job of pending.values()) job.reject(err instanceof Error ? err : new Error('SVG worker je pao'))
    pending.clear()
    worker = null
  }
  worker.on('error', fail)
  worker.on('exit', code => { if (code !== 0 && pending.size) fail(new Error(`SVG worker izašao sa kodom ${code}`)); worker = null })
  return worker
}

export function renderSvgToPng(svg, fontFiles) {
  const id = ++seq
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    ensureWorker().postMessage({ id, svg, fontFiles })
  })
}
