const mediaExtensions: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', avif: 'image/avif', heic: 'image/heic', heif: 'image/heif',
  bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff', svg: 'image/svg+xml',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', '3gp': 'video/3gpp',
}

export function isPreviewMedia(file: File): boolean {
  return /^(image|video)\//.test(file.type)
}

// Inspect a bounded header locally. Signatures outrank supplied metadata;
// extensions only fill in absent/generic MIME types. This is UI classification,
// not validation of an upload's safety or browser decoder support.
export async function classifySharedFiles(files: File[]): Promise<{ kind: 'photo' | 'file'; files: File[] }> {
  const normalized = await Promise.all(files.map(async file => {
    const bytes = new Uint8Array(await file.slice(0, 64).arrayBuffer())
    const ascii = (start: number, length: number) => String.fromCharCode(...bytes.slice(start, start + length))
    let detected = ''
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) detected = 'image/jpeg'
    else if (ascii(0, 8) === '\x89PNG\r\n\x1a\n') detected = 'image/png'
    else if (['GIF87a', 'GIF89a'].includes(ascii(0, 6))) detected = 'image/gif'
    else if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') detected = 'image/webp'
    else if (ascii(0, 5) === '%PDF-') detected = 'application/pdf'
    else if (ascii(0, 4) === 'PK\x03\x04') detected = 'application/zip'
    else if (ascii(4, 4) === 'ftyp') {
      const brands = [ascii(8, 4)]
      const boxSize = new DataView(bytes.buffer).getUint32(0)
      for (let i = 16; i + 4 <= Math.min(bytes.length, boxSize); i += 4) brands.push(ascii(i, 4))
      if (brands.some(brand => ['avif', 'avis'].includes(brand))) detected = 'image/avif'
      else if (brands.some(brand => ['heic', 'heix', 'hevc', 'hevx'].includes(brand))) detected = 'image/heic'
      else if (brands.some(brand => ['mif1', 'msf1'].includes(brand))) detected = 'image/heif'
      else if (brands.includes('qt  ')) detected = 'video/quicktime'
      else if (brands.some(brand => ['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'M4V '].includes(brand))) detected = 'video/mp4'
    }
    const mime = file.type.toLowerCase().split(';')[0].trim()
    const generic = !mime || ['application/octet-stream', 'binary/octet-stream', '*/*'].includes(mime)
    const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
    const type = detected || (generic ? mediaExtensions[extension] || mime : mime)
    return type === file.type ? file : new File([file], file.name, { type, lastModified: file.lastModified })
  }))
  return { kind: normalized.length > 0 && normalized.every(isPreviewMedia) ? 'photo' : 'file', files: normalized }
}
