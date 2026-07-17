import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { generateApiKey, hashKey, safeEqual, hashPassword, verifyPassword } from '../src/lib/crypto.js'
import { numOr } from '../src/db.js'
import { buildAuthUrl } from '../src/lib/ghl.js'
import { decryptGhlSso, ssoAuthorized } from '../src/lib/sso.js'

// Reproduce el cifrado de CryptoJS/GHL (OpenSSL "Salted__" + EVP_BytesToKey MD5) para probar el descifrado.
function ghlEncrypt(obj, secret) {
  const salt = crypto.randomBytes(8)
  let d = Buffer.alloc(0), prev = Buffer.alloc(0)
  while (d.length < 48) { prev = crypto.createHash('md5').update(Buffer.concat([prev, Buffer.from(secret), salt])).digest(); d = Buffer.concat([d, prev]) }
  const key = d.subarray(0, 32), iv = d.subarray(32, 48)
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
  const ct = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()])
  return Buffer.concat([Buffer.from('Salted__'), salt, ct]).toString('base64')
}

test('generateApiKey produce claves con prefijo dw_ y hash estable', () => {
  const { key, prefix, hash } = generateApiKey()
  assert.match(key, /^dw_[0-9a-f]{48}$/)
  assert.ok(prefix.startsWith('dw_'))
  assert.equal(hash, hashKey(key))
  // dos claves distintas no colisionan
  assert.notEqual(generateApiKey().key, generateApiKey().key)
})

test('hashKey es determinista y sensible al valor', () => {
  assert.equal(hashKey('abc'), hashKey('abc'))
  assert.notEqual(hashKey('abc'), hashKey('abd'))
})

test('safeEqual compara correctamente y no lanza con longitudes distintas', () => {
  assert.equal(safeEqual('secreto', 'secreto'), true)
  assert.equal(safeEqual('secreto', 'secretO'), false)
  assert.equal(safeEqual('corto', 'muchomaslargo'), false)
  assert.equal(safeEqual('', ''), true)
})

test('numOr normaliza strings de pg y rechaza no-numéricos', () => {
  assert.equal(numOr('12.5'), 12.5)
  assert.equal(numOr(0), 0)
  assert.equal(numOr(''), null)
  assert.equal(numOr(null), null)
  assert.equal(numOr(undefined), null)
  assert.equal(numOr('abc'), null)
  assert.equal(numOr('abc', 7), 7)
  assert.equal(numOr(undefined, 50), 50)
})

test('buildAuthUrl incluye scopes y el state cuando se pasa', () => {
  const cfg = { client_id: 'cid123' }
  const url = new URL(buildAuthUrl(cfg, 'https://x.test/cb', { scopes: ['charges.write'], state: 's1' }))
  assert.equal(url.searchParams.get('client_id'), 'cid123')
  assert.equal(url.searchParams.get('redirect_uri'), 'https://x.test/cb')
  assert.equal(url.searchParams.get('scope'), 'charges.write')
  assert.equal(url.searchParams.get('state'), 's1')
  assert.equal(url.searchParams.get('response_type'), 'code')
  // sin state no aparece el parámetro
  const url2 = new URL(buildAuthUrl(cfg, 'https://x.test/cb'))
  assert.equal(url2.searchParams.get('state'), null)
})

test('hashPassword/verifyPassword: sal por usuario, verifica y rechaza', () => {
  const h = hashPassword('miClave123')
  assert.match(h, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{64}$/)
  assert.equal(verifyPassword('miClave123', h), true)
  assert.equal(verifyPassword('otra', h), false)
  // dos hashes de la misma contraseña difieren (sal distinta)
  assert.notEqual(hashPassword('x'), hashPassword('x'))
  // entrada corrupta no lanza
  assert.equal(verifyPassword('x', 'basura'), false)
})

test('decryptGhlSso descifra el formato de GHL y rechaza el secreto incorrecto', () => {
  const secret = 'super-secreto-de-la-app'
  const identity = { userId: 'u1', email: 'Dueno@Correo.com', companyId: 'comp123', role: 'admin' }
  const blob = ghlEncrypt(identity, secret)
  const out = decryptGhlSso(blob, secret)
  assert.equal(out.email, 'Dueno@Correo.com')
  assert.equal(out.companyId, 'comp123')
  // secreto incorrecto → lanza (no descifra basura silenciosamente)
  assert.throws(() => decryptGhlSso(blob, 'otro-secreto'))
  // payload con formato inválido → lanza
  assert.throws(() => decryptGhlSso('no-es-salted', secret))
})

test('ssoAuthorized: fail-closed, empresa solo admin-agencia, email preciso', () => {
  const cfg = { company_id: 'ownerCo' }
  const agencyAdmin = { type: 'agency', role: 'admin' }
  // admin de la agencia dueña entra automáticamente
  assert.equal(ssoAuthorized({ companyId: 'ownerCo', ...agencyAdmin }, {}, cfg), true)
  // usuario de SUBCUENTA (o rol restringido) bajo la agencia dueña: DENEGADO (arrastra el companyId)
  assert.equal(ssoAuthorized({ companyId: 'ownerCo', type: 'account', role: 'user' }, {}, cfg), false)
  assert.equal(ssoAuthorized({ companyId: 'ownerCo', type: 'agency', role: 'user' }, {}, cfg), false)
  // email en lista blanca entra sin importar el rol (lo nombraste tú), case-insensitive
  assert.equal(ssoAuthorized({ email: 'X@Y.com', type: 'account', role: 'user' }, { emails: ['x@y.com'] }, {}), true)
  // companyId en lista blanca: solo admin de agencia
  assert.equal(ssoAuthorized({ companyId: 'c9', ...agencyAdmin }, { company_ids: ['c9'] }, {}), true)
  assert.equal(ssoAuthorized({ companyId: 'c9', type: 'account', role: 'user' }, { company_ids: ['c9'] }, {}), false)
  // sin coincidencia → denegado
  assert.equal(ssoAuthorized({ companyId: 'ajeno', email: 'nadie@z.com', ...agencyAdmin }, { emails: ['x@y.com'] }, cfg), false)
  // fail-closed: sin config no entra nadie
  assert.equal(ssoAuthorized({ companyId: 'x', email: 'a@b.com', ...agencyAdmin }, {}, {}), false)
})
