// Konfigurabilni pragovi obračuna (P2-E2). Defaulti su IDENTIČNI ranije
// hardkodovanim vrednostima — bez podešavanja se ništa ne menja.
// App.jsx posle logina povuče /api/settings i pozove setCalcConfig; obračunske
// funkcije (utils.js, stacks.js, capacity.js) čitaju odavde umesto konstanti.

export const CALC_DEFAULTS = {
  overrunThresholdPct: 15, // task je "over" kad spent > est × (1 + prag/100)
  capacityTightPct: 85,    // load iznad ovoga (a ispod 100) = "tight"
  overrunTailPct: 10,      // preostali rad probijenog otvorenog taska = tail% × est
}

let current = { ...CALC_DEFAULTS }

export function setCalcConfig(partial) {
  for (const key of Object.keys(CALC_DEFAULTS)) {
    const v = parseFloat(partial?.[key])
    if (Number.isFinite(v) && v >= 0 && v <= 100) current[key] = v
  }
}

export function getCalcConfig() {
  return current
}

// Za testove — vrati na defaulte.
export function resetCalcConfig() {
  current = { ...CALC_DEFAULTS }
}
