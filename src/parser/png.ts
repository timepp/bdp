import * as parser from './parser.js'

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

export class PngParser implements parser.Parser {
  isSupportedFile (filename: string, ext: string, buffer:ArrayBuffer) {
    return ext === 'png' || parser.Helper.checkContent(buffer, 0, PNG_SIG)
  }

  parse (buffer: ArrayBuffer) : parser.Region[] {
    parser.Helper.ensureContent(buffer, 0, PNG_SIG)
    const p = new parser.Helper(buffer)
    p.endian = parser.Endian.BE
    const arr:parser.Region[] = []
    arr.push(p.createRegion('G', 0, PNG_SIG.length, 'signature'))
    while (p.position < buffer.byteLength) {
      const trunk = p.createCompoundRegion(-1, 0, 'trunk')
      const rl = p.createRegion('L', -1, 4, 'Length')
      const rt = p.createRegion('S', -1, 4, 'Type')
      const rd = this.parseTrunkData(p.fork(-1, p.num.Length), rt.strValue || '')
      const rc = p.createRegion('N', rt.endPos + p.num.Length, 4, 'CRC')
      trunk.subRegions = [rl, rt, rd, rc]
      trunk.endPos = p.position
      trunk.strValue = p.regionCache.Type.strValue
      arr.push(trunk)
    }
    return arr
  }

  parseTrunkData (p: parser.Helper, type: string): parser.Region {
    if (type === 'IHDR') {
      const r = p.createCompoundRegion(-1, -1, 'Data - Header')
      r.subRegions = [
        p.createRegion('N', -1, 4, 'Width'),
        p.createRegion('N', -1, 4, 'Height'),
        p.createRegion('N', -1, 1, 'Bit depth'),
        p.createRegion('N', -1, 1, 'Color type'),
        p.createRegion('N', -1, 1, 'Compress method'),
        p.createRegion('N', -1, 1, 'Filter method'),
        p.createRegion('N', -1, 1, 'Interlace method')
      ]
      return r
    } else if (type === 'tEXt') {
      const r = p.createCompoundRegion(-1, -1, 'Data')
      const arr = new Uint8Array(p.buffer)
      let s = p.position
      while (arr[s] !== 0 && s < arr.length) s++
      r.subRegions = [
        p.createRegion('S', -1, s - p.position, 'key'),
        p.createRegion('G', -1, 1, 'sep'),
        p.createRegion('S', -1, -1, 'value')
      ]
      r.strValue = `${p.regionCache.key.strValue}:${p.regionCache.value.strValue}`
      return r
    } else {
      return p.createRegion('G', -1, p.buffer.byteLength - p.position, 'Data')
    }
  }
}
