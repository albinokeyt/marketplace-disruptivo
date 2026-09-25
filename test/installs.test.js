import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {
  verifyGhlSignature, callbackUriFrom, isOurCompany, parseInstalledLocations, hasScope, SELF_HEAL,
} from '../src/lib/installRules.js'

const pem = (k) => k.export({ type: 'spki', format: 'pem' })

test('verifyGhlSignature: acepta la firma Ed25519 de X-GHL-Signature sobre el cuerpo crudo', () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
  const raw = JSON.stringify({ type: 'INSTALL', appId: 'a1', locationId: 'L1', companyId: 'C1' })
  const sig = crypto.sign(null, Buffer.from(raw), privateKey).toString('base64')
  const keys = { ed25519: pem(publicKey) }
  assert.equal(verifyGhlSignature(raw, { 'x-ghl-signature': sig }, keys), true)
  // un solo byte cambiado invalida la firma
  assert.equal(verifyGhlSignature(raw.replace('L1', 'L2'), { 'x-ghl-signature': sig }, keys), false)
  // sin cabecera, o firma basura, no pasa
  assert.equal(verifyGhlSignature(raw, {}, keys), false)
  assert.equal(verifyGhlSignature(raw, { 'x-ghl-signature': 'no-es-base64-valida' }, keys), false)
})

test('verifyGhlSignature: sigue aceptando la firma legacy RSA de X-WH-Signature', () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
  const raw = '{"type":"UNINSTALL","appId":"a1","locationId":"L1"}'
  const sig = crypto.sign('sha256', Buffer.from(raw), privateKey).toString('base64')
  assert.equal(verifyGhlSignature(raw, { 'x-wh-signature': sig }, { rsa: pem(publicKey) }), true)
  assert.equal(verifyGhlSignature(raw + ' ', { 'x-wh-signature': sig }, { rsa: pem(publicKey) }), false)
})

test('verifyGhlSignature: una firma de otra clave (no de GHL) se rechaza con las claves oficiales', () => {
  const { privateKey } = crypto.generateKeyPairSync('ed25519')
  const raw = '{"type":"INSTALL","locationId":"L1"}'
  const sig = crypto.sign(null, Buffer.from(raw), privateKey).toString('base64')
  assert.equal(verifyGhlSignature(raw, { 'x-ghl-signature': sig }), false)
})

test('callbackUriFrom: usa el host al que redirigió GHL y, si no es válido, la URL configurada', () => {
  const fb = 'https://marketplace.escaladoacelerado.es/api/oauth/callback'
  assert.equal(callbackUriFrom('marketplace.escaladoacelerado.es', fb), fb)
  assert.equal(callbackUriFrom('apps-propias-marketplace.f7m8z2.easypanel.host', fb),
    'https://apps-propias-marketplace.f7m8z2.easypanel.host/api/oauth/callback')
  assert.equal(callbackUriFrom('localhost', fb), fb)
  assert.equal(callbackUriFrom('evil.com/../x', fb), fb)
  assert.equal(callbackUriFrom('', fb), fb)
})

test('isOurCompany: solo la agencia de Configuración o las autorizadas para SSO', () => {
  const cfg = { company_id: 'C1' }
  const admins = { company_ids: ['C2'] }
  assert.equal(isOurCompany('C1', cfg, admins), true)
  assert.equal(isOurCompany('C2', cfg, admins), true)
  assert.equal(isOurCompany('C3', cfg, admins), false)
  assert.equal(isOurCompany('', cfg, admins), false)
  assert.equal(isOurCompany('C1', {}, {}), false)
})

test('parseInstalledLocations: entiende la API legacy (locations) y la v3 (items), sin duplicados ni desinstaladas', () => {
  assert.deepEqual(parseInstalledLocations({ locations: [
    { _id: 'L1', name: 'Uno', isInstalled: true },
    { _id: 'L2', name: 'Dos', isInstalled: false },
    { _id: 'L1', name: 'Uno repetido', isInstalled: true },
  ], count: 3 }), [{ locationId: 'L1', name: 'Uno' }])
  assert.deepEqual(parseInstalledLocations({ items: [{ _id: 'L9', name: 'Nueve', isInstalled: true }, { id: 'L8' }] }),
    [{ locationId: 'L9', name: 'Nueve' }, { locationId: 'L8', name: null }])
  assert.deepEqual(parseInstalledLocations({}), [])
  assert.deepEqual(parseInstalledLocations(null), [])
})

test('hasScope y estados que se reparan solos', () => {
  assert.equal(hasScope('charges.write oauth.readonly oauth.write', 'oauth.write'), true)
  assert.equal(hasScope('charges.write oauth.readonly', 'oauth.write'), false)
  assert.equal(hasScope(null, 'oauth.write'), false)
  // la desconexión manual del administrador NUNCA se deshace sola
  assert.equal(SELF_HEAL.includes('disconnected'), false)
  assert.deepEqual([...SELF_HEAL].sort(), ['awaiting', 'error', 'uninstalled'])
})
