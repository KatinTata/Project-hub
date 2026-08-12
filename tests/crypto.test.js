// Testovi za enkripciju tajni (P1-15): GCM roundtrip, legacy CBC čitanje,
// integritet (auth tag).

import { describe, it, expect, beforeAll } from 'vitest'
import crypto from 'node:crypto'

beforeAll(() => {
  process.env.ENCRYPTION_KEY = 'a'.repeat(64)
})

// jiraClient povlači i axios/dates ali ništa ne izvršava na importu osim definicija
import { encryptToken, decryptToken, isLegacyEncrypted } from '../server/jiraClient.js'

function legacyCbcEncrypt(text) {
  const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex')
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  return iv.toString('hex') + ':' + enc.toString('hex')
}

describe('encryptToken / decryptToken', () => {
  it('novi upisi su u GCM formatu (v2:iv:tag:ct)', () => {
    const stored = encryptToken('moj-tajni-token')
    expect(stored.startsWith('v2:')).toBe(true)
    expect(stored.split(':')).toHaveLength(4)
  })

  it('GCM roundtrip vraća original', () => {
    expect(decryptToken(encryptToken('moj-tajni-token'))).toBe('moj-tajni-token')
    expect(decryptToken(encryptToken('šđčćž UTF-8 ¤'))).toBe('šđčćž UTF-8 ¤')
  })

  it('stari CBC format se i dalje dešifruje', () => {
    const legacy = legacyCbcEncrypt('stari-jira-token')
    expect(isLegacyEncrypted(legacy)).toBe(true)
    expect(decryptToken(legacy)).toBe('stari-jira-token')
  })

  it('isLegacyEncrypted razlikuje formate', () => {
    expect(isLegacyEncrypted(encryptToken('x'))).toBe(false)
    expect(isLegacyEncrypted(null)).toBe(false)
  })

  it('manipulisan ciphertext baca grešku (auth tag), ne vraća smeće', () => {
    const stored = encryptToken('osetljiva-vrednost')
    const parts = stored.split(':')
    // flip poslednjeg karaktera ciphertext-a
    const last = parts[3].slice(-1) === '0' ? '1' : '0'
    const tampered = [parts[0], parts[1], parts[2], parts[3].slice(0, -1) + last].join(':')
    expect(() => decryptToken(tampered)).toThrow()
  })

  it('manipulisan tag takođe baca grešku', () => {
    const stored = encryptToken('osetljiva-vrednost')
    const parts = stored.split(':')
    const flipped = parts[2].slice(-1) === '0' ? '1' : '0'
    const tampered = [parts[0], parts[1], parts[2].slice(0, -1) + flipped, parts[3]].join(':')
    expect(() => decryptToken(tampered)).toThrow()
  })
})
