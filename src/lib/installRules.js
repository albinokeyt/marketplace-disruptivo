// Reglas PURAS de las instalaciones automáticas (sin base de datos ni red): se prueban en test/installs.test.js
import crypto from 'node:crypto'

// Claves públicas oficiales de HighLevel para verificar la firma de sus webhooks
// (marketplace.gohighlevel.com/docs/webhook/WebhookIntegrationGuide). Cabecera actual: X-GHL-Signature (Ed25519);
// la legacy X-WH-Signature (RSA-SHA256) se depreció el 2026-09-01, pero se sigue aceptando si llega.
export const GHL_ED25519_KEY = process.env.GHL_WEBHOOK_PUBLIC_KEY || `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAi2HR1srL4o18O8BRa7gVJY7G7bupbN3H9AwJrHCDiOg=
-----END PUBLIC KEY-----`

export const GHL_RSA_KEY = `-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAokvo/r9tVgcfZ5DysOSC
Frm602qYV0MaAiNnX9O8KxMbiyRKWeL9JpCpVpt4XHIcBOK4u3cLSqJGOLaPuXw6
dO0t6Q/ZVdAV5Phz+ZtzPL16iCGeK9po6D6JHBpbi989mmzMryUnQJezlYJ3DVfB
csedpinheNnyYeFXolrJvcsjDtfAeRx5ByHQmTnSdFUzuAnC9/GepgLT9SM4nCpv
uxmZMxrJt5Rw+VUaQ9B8JSvbMPpez4peKaJPZHBbU3OdeCVx5klVXXZQGNHOs8gF
3kvoV5rTnXV0IknLBXlcKKAQLZcY/Q9rG6Ifi9c+5vqlvHPCUJFT5XUGG5RKgOKU
J062fRtN+rLYZUV+BjafxQauvC8wSWeYja63VSUruvmNj8xkx2zE/Juc+yjLjTXp
IocmaiFeAO6fUtNjDeFVkhf5LNb59vECyrHD2SQIrhgXpO4Q3dVNA5rw576PwTzN
h/AMfHKIjE4xQA1SZuYJmNnmVZLIZBlQAF9Ntd03rfadZ+yDiOXCCs9FkHibELhC
HULgCsnuDJHcrGNd5/Ddm5hxGQ0ASitgHeMZ0kcIOwKDOzOU53lDza6/Y09T7sYJ
PQe7z0cvj7aE4B+Ax1ZoZGPzpJlZtGXCsu9aTEGEnKzmsFqwcSsnw3JB31IGKAyk
T1hhTiaCeIY/OwwwNUY2yvcCAwEAAQ==
-----END PUBLIC KEY-----`

const tryVerify = (algo, pem, raw, sigB64) => {
  try {
    return crypto.verify(algo, Buffer.from(raw), crypto.createPublicKey(pem), Buffer.from(String(sigB64), 'base64'))
  } catch {
    return false
  }
}

// ¿El cuerpo CRUDO del webhook lo firmó HighLevel? Se firma el body tal cual llega (antes de parsear el JSON).
export function verifyGhlSignature(raw, headers = {}, keys = {}) {
  const ed = headers['x-ghl-signature']
  if (ed && tryVerify(null, keys.ed25519 || GHL_ED25519_KEY, raw || '', ed)) return true
  const rsa = headers['x-wh-signature']
  if (rsa && tryVerify('sha256', keys.rsa || GHL_RSA_KEY, raw || '', rsa)) return true
  return false
}

// Estados de una conexión:
//   connected    → token de subcuenta válido: se le puede cobrar
//   awaiting     → la app está instalada en GHL pero todavía no hay token (falta el de agencia o falló el canje)
//   error        → el refresh del token falló; se repara solo si hay token de agencia
//   uninstalled  → GHL avisó de que se desinstaló
//   disconnected → la desconectó el administrador a mano: NO se reconecta sola (solo si se reinstala la app)
// Una agencia que no es la nuestra instala o abre la app (la app es pública: p. ej. el equipo de revisión de GHL).
// No es un error: se le explica qué es y no se conecta ni se cobra nada.
export const FOREIGN_AGENCY_CODE = 'FOREIGN_AGENCY'
export const FOREIGN_AGENCY_MSG =
  'Marketplace Disruptivo es el centro de saldo y apps de los clientes de la agencia Departamento Disruptivo. ' +
  'Tu agencia no está dada de alta, así que no se ha conectado nada ni se cobrará nada. ' +
  'Si quieres usarlo, escríbenos a departamentodisruptivo@gmail.com.'
export const FOREIGN_AGENCY_MSG_EN =
  'Marketplace Disruptivo is the wallet and app hub for clients of the Departamento Disruptivo agency. ' +
  'Your agency is not enrolled, so nothing was connected and nothing will be charged. ' +
  'To get access, contact departamentodisruptivo@gmail.com.'

// ¿La identidad / el token viene de otra agencia? Solo se afirma con un companyId Y con nuestra agencia configurada
// (sin Company ID en Configuración no hay con qué comparar: se sigue el flujo normal y no se bloquea a nadie).
export function isForeignCompany(companyId, ghlCfg = {}, admins = {}) {
  const cid = String(companyId || '').trim()
  const list = [ghlCfg.company_id, ...(Array.isArray(admins.company_ids) ? admins.company_ids : [])]
    .map((x) => String(x || '').trim()).filter(Boolean)
  return Boolean(cid) && list.length > 0 && !list.includes(cid)
}

export const SELF_HEAL = ['awaiting', 'error', 'uninstalled']

// La redirección de GHL llega al host que tiene registrado la app (puede ser el dominio viejo o el nuevo):
// el canje del code tiene que usar exactamente esa URL, así que se deriva de la propia petición.
export function callbackUriFrom(hostname, fallback) {
  const host = String(hostname || '').toLowerCase().trim()
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return `https://${host}/api/oauth/callback`
  return fallback
}

// ¿Es de nuestra agencia? (Company ID de Configuración o los autorizados para SSO)
export function isOurCompany(companyId, ghlCfg = {}, admins = {}) {
  const cid = String(companyId || '').trim()
  if (!cid) return false
  const list = [ghlCfg.company_id, ...(Array.isArray(admins.company_ids) ? admins.company_ids : [])]
    .map((x) => String(x || '').trim()).filter(Boolean)
  return list.includes(cid)
}

// Respuesta de «subcuentas donde está instalada la app»: la API legacy devuelve { locations: [...] } y la v3
// { items: [...] }; cada una con _id (o id), name e isInstalled. Devuelve [{ locationId, name }] sin duplicados.
export function parseInstalledLocations(data) {
  const arr = Array.isArray(data?.locations) ? data.locations : Array.isArray(data?.items) ? data.items : []
  const out = new Map()
  for (const l of arr) {
    const id = String(l?._id || l?.id || l?.locationId || '').trim()
    if (!id || l?.isInstalled === false) continue
    if (!out.has(id)) out.set(id, l?.name ? String(l.name) : null)
  }
  return [...out].map(([locationId, name]) => ({ locationId, name }))
}

// ¿Tiene el token el permiso que pide GHL para mintear tokens de subcuenta?
export const hasScope = (scope, wanted) => String(scope || '').split(/\s+/).includes(wanted)
