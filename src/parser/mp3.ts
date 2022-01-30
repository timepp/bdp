import * as parser from './parser.js'

export class Mp3Parser implements parser.Parser {
  isSupportedFile (filename: string, ext: string) {
    return ext === 'mp3'
  }

  parse (buffer: ArrayBuffer) : parser.Region[] {
    const p = new parser.Helper(buffer)
    p.setEndian(parser.Endian.BE)
    const ret: parser.Region[] = []

    if (parser.Helper.checkContent(buffer, 0, [0x49, 0x44, 0x33])) {
      ret.push(this.parseID3v2(p))
    }

    return ret
  }

  parseID3v2 (p: parser.Helper) {
    const id3v2 = p.createRegion('C', 0, 0, 'ID3v2', 'https://id3.org/id3v2.3.0')
    id3v2.subRegions = []

    const z0 = Number(p.parseValue(p.buffer, 6, 7, false))
    const z1 = Number(p.parseValue(p.buffer, 7, 8, false))
    const z2 = Number(p.parseValue(p.buffer, 8, 9, false))
    const z3 = Number(p.parseValue(p.buffer, 9, 10, false))
    const length = ((((z0 * 128) + z1) * 128) + z2) * 128 + z3
    const tagHeader = p.createRegion('C', 0, 10, 'TagHeader')
    tagHeader.subRegions = [
      p.createRegion('G', 0, 3, 'FileID'),
      p.createRegion('N', 3, 1, 'MajorVersion'),
      p.createRegion('N', 4, 1, 'RevisionNumber'),
      p.createRegion('N', 5, 1, 'Flags'),
      p.createRegion('G', 6, 4, 'TagSize')
    ]
    p.regionCache.TagSize.numValue = BigInt(length)
    id3v2.endPos = length + 10
    id3v2.subRegions.push(tagHeader)

    for (let pos = p.position; pos < id3v2.endPos;) {
      const frame = p.createRegion('C', pos, 0, 'Frame')
      frame.subRegions = []

      const id = p.createRegion('S', pos, 4, 'ID')
      const size = p.createRegion('L', -1, 4, 'Size')
      const flags = p.createRegion('N', -1, 2, 'Flags')
      if (size.numValue === 0n) {
        // A tag must contain at least one frame. A frame must be at least 1 byte big, excluding the header.
        break
      }
      const ret = this.parseId3v2FrameContent(p, id.strValue || '', pos + 10, p.num.Size)
      frame.interpretedValue = p.regionCache.ID.strValue + ' ' + ret.str
      frame.subRegions.push(id, size, flags, ...ret.regions)

      id3v2.subRegions.push(frame)
      pos += p.num.Size + 10
    }

    return id3v2
  }

  parseId3v2FrameContent (p:parser.Helper, id:string, offset: number, len: number) {
    let str = ''
    const regions: parser.Region[] = []
    if (id === 'TXXX') {
      console.log('TODO for TXXX')
    } else if (id.startsWith('T')) {
      const encoding = p.createRegion('N', offset, 1, 'encoding')
      regions.push(encoding)

      if (encoding.numValue === 1n) {
        encoding.interpretedValue = 'unicode'
        const bom = p.createRegion('G', offset + 1, 2, 'BOM')
        const enc = parser.Helper.checkContent(p.buffer, bom.startPos, [0xFF, 0xFE]) ? 'utf-16le' : 'utf-16be'
        const text = p.createRegion('G', offset + 3, len - 3, 'Text')
        const s = parser.Helper.parseFixedLengthString(p.buffer, text.startPos, len - 3, enc)
        text.strValue = parser.Helper.trimNull(s)
        regions.push(bom, text)
        str = text.strValue
      } else {
        encoding.interpretedValue = 'iso-8859-1'
        const text = p.createRegion('S', offset + 1, len - 1, 'Text')
        regions.push(text)
        str = text.strValue || ''
      }
    }

    // fallback
    if (regions.length === 0) {
      regions.push(p.createRegion('G', offset, len, 'Content'))
    }

    return { str, regions }
  }
}
