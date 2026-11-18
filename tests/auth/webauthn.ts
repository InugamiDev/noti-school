import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto';

// intent: software WebAuthn authenticator (P-256, attestation 'none') so passkey ceremonies run
// end to end through the real plugin and @simplewebauthn/server verification without a browser.
// status: done | next: none | confidence: high
type Cbor = number | string | Uint8Array | Map<Cbor, Cbor>;
function head(major: number, value: number) {
  if (value < 24) return Buffer.from([(major << 5) | value]);
  if (value < 256) return Buffer.from([(major << 5) | 24, value]);
  if (value < 65536) { const b = Buffer.alloc(3); b[0] = (major << 5) | 25; b.writeUInt16BE(value, 1); return b; }
  const b = Buffer.alloc(5); b[0] = (major << 5) | 26; b.writeUInt32BE(value, 1); return b;
}
function cbor(value: Cbor): Buffer {
  if (typeof value === 'number') return value >= 0 ? head(0, value) : head(1, -1 - value);
  if (typeof value === 'string') { const text = Buffer.from(value, 'utf8'); return Buffer.concat([head(3, text.length), text]); }
  if (value instanceof Uint8Array) return Buffer.concat([head(2, value.length), value]);
  return Buffer.concat([head(5, value.size), ...[...value].flatMap(([k, v]) => [cbor(k), cbor(v)])]);
}
const b64url = (value: Uint8Array) => Buffer.from(value).toString('base64url');
const sha256 = (value: Uint8Array | string) => createHash('sha256').update(value).digest();

export class SoftwareAuthenticator {
  readonly credentialId = randomBytes(32);
  private readonly privateKey: KeyObject;
  private readonly publicKey: KeyObject;
  private counter = 0;
  constructor(private readonly rpId: string, private readonly origin: string) {
    ({ privateKey: this.privateKey, publicKey: this.publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' }));
  }
  get id() { return b64url(this.credentialId); }
  private clientData(type: 'webauthn.create' | 'webauthn.get', challenge: string, origin: string) {
    return Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }));
  }
  register(challenge: string, origin = this.origin) {
    const jwk = this.publicKey.export({ format: 'jwk' });
    const cose = cbor(new Map<Cbor, Cbor>([[1, 2], [3, -7], [-1, 1],
      [-2, Buffer.from(jwk.x!, 'base64url')], [-3, Buffer.from(jwk.y!, 'base64url')]]));
    const idLength = Buffer.alloc(2); idLength.writeUInt16BE(this.credentialId.length);
    // Flags: user present, user verified, attested credential data included.
    const authData = Buffer.concat([sha256(this.rpId), Buffer.from([0x45]), Buffer.alloc(4), Buffer.alloc(16),
      idLength, this.credentialId, cose]);
    const attestationObject = cbor(new Map<Cbor, Cbor>([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]));
    return { id: this.id, rawId: this.id, type: 'public-key', clientExtensionResults: {},
      response: { clientDataJSON: b64url(this.clientData('webauthn.create', challenge, origin)),
        attestationObject: b64url(attestationObject), transports: ['internal'] } };
  }
  assert(challenge: string, origin = this.origin) {
    const count = Buffer.alloc(4); count.writeUInt32BE(++this.counter);
    const authenticatorData = Buffer.concat([sha256(this.rpId), Buffer.from([0x05]), count]);
    const clientDataJSON = this.clientData('webauthn.get', challenge, origin);
    const signature = sign('sha256', Buffer.concat([authenticatorData, sha256(clientDataJSON)]), this.privateKey);
    return { id: this.id, rawId: this.id, type: 'public-key', clientExtensionResults: {},
      response: { clientDataJSON: b64url(clientDataJSON), authenticatorData: b64url(authenticatorData), signature: b64url(signature) } };
  }
}
