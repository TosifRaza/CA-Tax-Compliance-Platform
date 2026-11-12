import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto'
import { mkdir, readFile, writeFile, stat } from 'fs/promises'
import path from 'path'

// =====================================================================
// Encrypted-at-rest file storage for client documents (gap R-10, PDF §7).
// Files are AES-256-GCM encrypted before touching the disk and decrypted
// only in-memory inside the authorized streaming route. Key management:
//   1. process.env.FILE_ENCRYPTION_KEY (hex 64 chars / any passphrase) if set
//   2. otherwise a key file (db/.filekey, mode 0600) is created on first use
// Backwards compatibility: legacy plaintext files (no ENC1: prefix) are
// still readable so existing stored documents keep working.
//
// basicMalwareScan is a pragmatic first-pass screen (EICAR test string,
// executable magic bytes, MIME/content mismatch) — it is NOT a substitute
// for a full antivirus engine, and the UI copy says so honestly.
// =====================================================================

const ENC_PREFIX = 'ENC1:'
const UPLOAD_ROOT = path.join(process.cwd(), 'db', 'uploads')

let cachedKey: Buffer | null = null

async function loadKey(): Promise<Buffer> {
  if (cachedKey) return cachedKey
  const envKey = process.env.FILE_ENCRYPTION_KEY
  if (envKey && envKey.length >= 16) {
    cachedKey = envKey.match(/^[0-9a-fA-F]{64}$/) ? Buffer.from(envKey, 'hex') : createHash('sha256').update(envKey).digest()
    return cachedKey
  }
  const keyPath = path.join(process.cwd(), 'db', '.filekey')
  try {
    const existing = await readFile(keyPath)
    if (existing.length === 32) {
      cachedKey = existing
      return cachedKey
    }
  } catch { /* first run */ }
  const key = randomBytes(32)
  await mkdir(path.dirname(keyPath), { recursive: true })
  await writeFile(keyPath, key, { mode: 0o600 })
  cachedKey = key
  return cachedKey
}

export function uploadRoot(): string {
  return UPLOAD_ROOT
}

export function storedPath(applicationId: string, storedName: string): string {
  return path.join(UPLOAD_ROOT, applicationId, storedName)
}

/** Encrypt-and-write a document. Bytes on disk are always ENC1: sealed. */
export async function writeDocumentFile(applicationId: string, storedName: string, bytes: Buffer): Promise<string> {
  const filePath = storedPath(applicationId, storedName)
  await mkdir(path.dirname(filePath), { recursive: true })
  const key = await loadKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(bytes), cipher.final()])
  const tag = cipher.getAuthTag()
  const sealed = Buffer.concat([Buffer.from(ENC_PREFIX, 'utf8'), iv, tag, enc])
  await writeFile(filePath, sealed)
  return filePath
}

/** Read a stored document, transparently decrypting ENC1: sealed files and
 *  passing through legacy plaintext (documents stored before encryption). */
export async function readDocumentFile(filePath: string): Promise<Buffer> {
  const raw = await readFile(filePath)
  if (!raw.subarray(0, 5).toString('utf8').startsWith(ENC_PREFIX)) return raw
  const key = await loadKey()
  const iv = raw.subarray(5, 17)
  const tag = raw.subarray(17, 33)
  const data = raw.subarray(33)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()])
}

export async function fileExists(filePath: string): Promise<boolean> {
  try { await stat(filePath); return true } catch { return false }
}

// ---------------- Upload screening ----------------

const EXEC_MAGICS: { bytes: number[]; label: string }[] = [
  { bytes: [0x4d, 0x5a], label: 'Windows executable (MZ)' },
  { bytes: [0x7f, 0x45, 0x4c, 0x46], label: 'Linux executable (ELF)' },
  { bytes: [0xca, 0xfe, 0xba, 0xbe], label: 'Mach-O / Java class' },
  { bytes: [0xfe, 0xed, 0xfa, 0xce], label: 'Mach-O executable' },
]

const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'

/** First-pass content screen. Returns null when clean, or a reason string. */
export function basicMalwareScan(bytes: Buffer, mimeType: string): string | null {
  const head = bytes.subarray(0, 1024)
  if (head.toString('latin1').includes(EICAR)) return 'Malware signature detected (EICAR test file).'
  for (const m of EXEC_MAGICS) {
    if (m.bytes.every((b, i) => head[i] === b)) return `${m.label} content is not allowed.`
  }
  if (head[0] === 0x23 && head[1] === 0x21) return 'Script files (shebang) are not allowed.'
  // MIME/content mismatch: declared PDF/JPG/PNG must show the right magic.
  const isPdf = head.subarray(0, 5).toString('latin1') === '%PDF-'
  const isJpg = head[0] === 0xff && head[1] === 0xd8
  const isPng = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47
  const looksKnown = isPdf || isJpg || isPng
  if (!looksKnown && bytes.length > 100) {
    return `File content does not match an allowed document type (declared ${mimeType}).`
  }
  return null
}
