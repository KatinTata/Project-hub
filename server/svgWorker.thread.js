// Worker thread za SVG → PNG rasterizaciju (P2-B5). Resvg render je sinhron i
// CPU-težak; ovde se izvršava van glavnog event loop-a pa /health i ostali
// zahtevi ostaju responzivni dok se generiše veliki izveštaj.
import { parentPort } from 'node:worker_threads'
import { Resvg } from '@resvg/resvg-js'

parentPort.on('message', ({ id, svg, fontFiles }) => {
  try {
    const png = new Resvg(svg, {
      font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'Hanken Grotesk' },
      fitTo: { mode: 'zoom', value: 2 }, // 2× for crisp embedding
    }).render().asPng()
    parentPort.postMessage({ id, png })
  } catch (e) {
    parentPort.postMessage({ id, error: e.message || String(e) })
  }
})
