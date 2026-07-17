import { randomBytes, createHash, timingSafeEqual, scryptSync } from 'node:crypto'

export const hashKey = (key) => createHash('sha256').update(key).digest('hex')

// Contraseñas de usuario: scrypt con sal por usuario (no SHA-256 pelado).
export function hashPassword(pw) {
  const salt = randomBytes(16)
  const dk = scryptSync(String(pw), salt, 32)
  return `scrypt$${salt.toString('hex')}$${dk.toString('hex')}`
}

export function verifyPassword(pw, stored) {
  try {
    const [scheme, saltHex, hashHex] = String(stored).split('$')
    if (scheme !== 'scrypt' || !saltHex || !hashHex) return false
    const expected = Buffer.from(hashHex, 'hex')
    const dk = scryptSync(String(pw), Buffer.from(saltHex, 'hex'), expected.length)
    return dk.length === expected.length && timingSafeEqual(dk, expected)
  } catch {
    return false
  }
}

export const randomPassword = () => randomBytes(9).toString('base64url')

export function generateApiKey() {
  const key = 'dw_' + randomBytes(24).toString('hex')
  return { key, prefix: key.slice(0, 11) + '…', hash: hashKey(key) }
}

// comparación en tiempo constante para el login admin
export function safeEqual(a, b) {
  const ba = Buffer.from(String(a))
  const bb = Buffer.from(String(b))
  if (ba.length !== bb.length) {
    // compara contra sí mismo para no filtrar longitud por timing
    timingSafeEqual(ba, ba)
    return false
  }
  return timingSafeEqual(ba, bb)
}
