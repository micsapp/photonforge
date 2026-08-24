import { getFileHandleByPath } from './fs'

/**
 * Standard XMP sidecars (PhotoPrism / digiKam / Lightroom compatible).
 * Writes <file>.xmp next to each photo with xmp:Rating and dc:subject tags.
 */

const XMP_NS = `xmlns:x="adobe:ns:meta/"
  xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
  xmlns:xmp="http://ns.adobe.com/xap/1.0/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"`

export function buildXmp(rating: number, rejected: boolean, tags: string[]): string {
  const label = rejected ? '\n      <xmp:Label>Reject</xmp:Label>' : ''
  const subjects = tags.length
    ? `
      <dc:subject>
        <rdf:Bag>
          ${tags.map((t) => `<rdf:li>${escapeXml(t)}</rdf:li>`).join('\n          ')}
        </rdf:Bag>
      </dc:subject>`
    : ''
  return `<?xml version="1.0" encoding="UTF-8"?>
<x:xmpmeta ${XMP_NS}>
  <rdf:RDF>
    <rdf:Description rdf:about="">
      <xmp:Rating>${rating}</xmp:Rating>${label}${subjects}
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>`
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!,
  )
}

function sidecarPath(photoPath: string): string {
  return `${photoPath}.xmp`
}

export async function writeSidecar(
  root: FileSystemDirectoryHandle,
  file: { path: string },
  rating: number,
  rejected: boolean,
  tags: string[],
): Promise<void> {
  const handle = await getFileHandleByPath(root, sidecarPath(file.path)).catch(() => null)
  if (!handle) return
  const writable = await handle.createWritable()
  await writable.write(buildXmp(rating, rejected, tags))
  await writable.close()
}

/** Returns existing rating/rejected/tags from a sidecar, or null. */
export async function readSidecar(
  root: FileSystemDirectoryHandle,
  file: { path: string },
): Promise<{ rating: number; rejected: boolean; tags: string[] } | null> {
  const handle = await getFileHandleByPath(root, sidecarPath(file.path)).catch(() => null)
  if (!handle) return null
  const text = await (await handle.getFile()).text().catch(() => '')
  if (!text.includes('<x:xmpmeta') && !text.includes('<x:xapmeta')) return null

  const rating = Number(text.match(/<xmp:Rating>(\d+)<\/xmp:Rating>/)?.[1] ?? 0)
  const rejected = /<xmp:Label>Reject<\/xmp:Label>/.test(text)
  const tags = [...text.matchAll(/<rdf:li>([^<]+)<\/rdf:li>/g)].map((m) => m[1])
  return { rating, rejected, tags }
}
