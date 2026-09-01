// Client-side SHA-256 for upload dedup/resume: hash the file locally, ask the
// server whether the workspace blob store (content-addressed by sha256)
// already holds the bytes, and skip the transfer when it does.
//
// crypto.subtle.digest has no streaming form, so small files go through it
// whole (native speed) while anything larger runs through the incremental
// pure-JS implementation below in slice()d chunks — constant memory, works for
// multi-GB files.

const SUBTLE_LIMIT = 32 * 1024 * 1024 // whole-buffer native digest below this
const CHUNK_SIZE = 8 * 1024 * 1024

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

class Sha256 {
  private h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19])
  private block = new Uint8Array(64)
  private blockLen = 0
  private bytesTotal = 0
  private w = new Uint32Array(64)

  update(data: Uint8Array): void {
    this.bytesTotal += data.length
    let offset = 0
    if (this.blockLen > 0) {
      const need = 64 - this.blockLen
      const take = Math.min(need, data.length)
      this.block.set(data.subarray(0, take), this.blockLen)
      this.blockLen += take
      offset = take
      if (this.blockLen === 64) {
        this.compress(this.block, 0)
        this.blockLen = 0
      }
    }
    while (offset + 64 <= data.length) {
      this.compress(data, offset)
      offset += 64
    }
    if (offset < data.length) {
      this.block.set(data.subarray(offset), 0)
      this.blockLen = data.length - offset
    }
  }

  digestHex(): string {
    const bitLen = this.bytesTotal * 8
    const pad = new Uint8Array(((this.blockLen < 56 ? 64 : 128) - this.blockLen))
    pad[0] = 0x80
    // 64-bit big-endian bit length; JS numbers hold file sizes well below 2^53.
    const view = new DataView(pad.buffer)
    view.setUint32(pad.length - 8, Math.floor(bitLen / 0x100000000), false)
    view.setUint32(pad.length - 4, bitLen >>> 0, false)
    this.update(pad)
    let out = ''
    for (let i = 0; i < 8; i++) out += this.h[i].toString(16).padStart(8, '0')
    return out
  }

  private compress(data: Uint8Array, offset: number): void {
    const w = this.w
    for (let i = 0; i < 16; i++) {
      const j = offset + i * 4
      w[i] = (data[j] << 24) | (data[j + 1] << 16) | (data[j + 2] << 8) | data[j + 3]
    }
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15]
      const b = w[i - 2]
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3)
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
    }
    const hs = this.h
    let a = hs[0], b = hs[1], c = hs[2], d = hs[3], e = hs[4], f = hs[5], g = hs[6], h = hs[7]
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))
      const ch = (e & f) ^ (~e & g)
      const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const t2 = (S0 + maj) >>> 0
      h = g; g = f; f = e; e = (d + t1) >>> 0
      d = c; c = b; b = a; a = (t1 + t2) >>> 0
    }
    hs[0] = (hs[0] + a) >>> 0; hs[1] = (hs[1] + b) >>> 0; hs[2] = (hs[2] + c) >>> 0; hs[3] = (hs[3] + d) >>> 0
    hs[4] = (hs[4] + e) >>> 0; hs[5] = (hs[5] + f) >>> 0; hs[6] = (hs[6] + g) >>> 0; hs[7] = (hs[7] + h) >>> 0
  }
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** sha256 hex of a File/Blob; onProgress gets 0..1 (only meaningful for large files). */
export async function sha256File(file: Blob, onProgress?: (fraction: number) => void): Promise<string> {
  if (file.size <= SUBTLE_LIMIT && crypto?.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
    onProgress?.(1)
    return toHex(digest)
  }
  const hasher = new Sha256()
  for (let offset = 0; offset < file.size; offset += CHUNK_SIZE) {
    const chunk = await file.slice(offset, offset + CHUNK_SIZE).arrayBuffer()
    hasher.update(new Uint8Array(chunk))
    onProgress?.(Math.min(1, (offset + chunk.byteLength) / file.size))
  }
  return hasher.digestHex()
}
