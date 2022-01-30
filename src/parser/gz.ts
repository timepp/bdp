import * as parser from './parser.js'

export class GzipParser implements parser.Parser {
  isSupportedFile (filename: string, ext: string, buffer: ArrayBuffer) {
    return parser.Helper.checkContent(buffer, 0, [0x1f, 0x8b])
  }

  parse (buffer: ArrayBuffer) : parser.Region[] {
    const p = new parser.Helper(buffer)
    p.setEndian(parser.Endian.LE)

    const cmDef = {
      8: 'Deflate'
    }

    const flagDef = {
      1: 'FTEXT',
      2: 'FHCRC',
      4: 'FEXTRA',
      8: 'FNAME',
      16: 'FCOMMENT'
    }

    const extraFlagDef = {
      2: 'slowest',
      4: 'fastest'
    }

    const osDef = {
      0: 'FAT filesystem (MS-DOS, OS/2, NT/Win32)',
      1: 'Amiga',
      2: 'VMS (or OpenVMS)',
      3: 'Unix',
      4: 'VM/CMS',
      5: 'Atari TOS',
      6: 'HPFS filesystem (OS/2, NT)',
      7: 'Macintosh',
      8: 'Z-System',
      9: 'CP/M',
      10: 'TOPS-20',
      11: 'NTFS filesystem (NT)',
      12: 'QDOS',
      13: 'Acorn RISCOS',
      255: 'unknown'
    }

    const subRegions: parser.Region[] = []
    const signature = p.createGeneralRegion(0, 2, 'Signature', 'GZip file magic header')
    const cm = p.createNumberRegion(2, 1, 'CompressionMethod', 'Compression method', cmDef)
    const flag = p.createFlagRegion(3, 1, 'Flag', '', flagDef)
    const mtime = p.createTimeRegion(4, 4, 'Motification time')
    const xfl = p.createFlagRegion(8, 1, 'ExtraFlag', '', extraFlagDef)
    const os = p.createNumberRegion(9, 1, 'OS', '', osDef)
    subRegions.push(signature, cm, flag, mtime, xfl, os)

    const v = Number(flag.numValue)

    if (v & 4) {
      const extra = p.createCompoundRegion(-1, 0, 'ExtraFields')
      const xlen = p.createSizeRegion(-1, 2, 'XLEN')
      extra.subRegions = [
        xlen,
        ...this.parseExtraContent(p, Number(xlen.numValue))
      ]
      extra.endPos = p.position
      subRegions.push(extra)
    }

    if (v & 8) {
      subRegions.push(p.createZeroTerminatedStringRegion(-1, 'FileName'))
    }

    if (v & 16) {
      subRegions.push(p.createZeroTerminatedStringRegion(-1, 'FileComment'))
    }

    if (v & 1) {
      subRegions.push(p.createNumberRegion(-1, 2, 'FHCRC'))
    }

    subRegions.push(
      p.createGeneralRegion(p.position, p.buffer.byteLength - 8 - p.position, 'Compressed Data'),
      p.createNumberRegion(-1, 4, 'CRC32'),
      p.createNumberRegion(-1, 4, 'ISIZE')
    )

    const gz = p.createCompoundRegion(0, -1, 'gzip', 'gzip file format', subRegions)
    return [gz]
  }

  parseExtraContent (p: parser.Helper, len: number) {
    const regions = []
    const endPos = p.position + len
    while (p.position < endPos) {
      const r = p.createCompoundRegion(-1, -1, 'ExtraField', '', [
        p.createStringRegion(-1, 2, 'SI'),
        p.createSizeRegion(-1, 2, 'LEN'),
        p.createGeneralRegion(-1, Number(p.regionCache.LEN.numValue), 'ExtraContent')
      ])
      regions.push(r)
    }
    return regions
  }
}
