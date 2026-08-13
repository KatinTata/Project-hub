// npm `prepare` hook — instalira husky git hookove SAMO u lokalnom razvoju.
//
// Zašto skripta a ne `"prepare": "husky"`: na produkcijskom buildu (Railway)
// devDependencies se ne instaliraju, pa je `husky` binarno nedostupan i
// `npm ci` pada sa `sh: 1: husky: not found` (exit 127) — što je blokiralo
// SVE deploye. Ovde svaki neuspeh tiho preskačemo: git hookovi su razvojna
// pogodnost, nikad razlog da produkcijski build padne.

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const skip = process.env.CI === 'true' || process.env.NODE_ENV === 'production' || !existsSync('.git')
if (skip) process.exit(0)

try {
  execFileSync('husky', [], { stdio: 'inherit', shell: true })
} catch {
  // husky nije instaliran (npr. --omit=dev) — nije greška za build
}
