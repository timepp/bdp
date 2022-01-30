import * as parser from './parser.js'

const generalPurposeFlagDef: parser.FlagDefinition = [
  [0, 1, 'Encrypted', ''],
  [3, 1, 'Z', 'If this bit is set, the fields crc-32, compressed size and uncompressed size are set to zero in the local header.'],
  [4, 1, 'ED', 'EnhancedDeflating'],
  [5, 1, 'Patched', '']
]

const generalPurposeFlagDefImploding: parser.FlagDefinition = [
  [1, 1, '8K', 'If set: 8K Sliding dictionary is used; If clear: 4K is used'],
  [1, 0, '4K', ''],
  [2, 1, '3SF', 'If set: 3 Shannon-Fano trees were used to encode the sliding dictionary output. If clear: 2 Shannon-Fano trees were used.'],
  [2, 0, '2SF', ''],
  ...generalPurposeFlagDef
]

const generalPurposeFlagDefDeflating: parser.FlagDefinition = [
  [2, [0, 0], 'Normal', ''],
  [2, [0, 1], 'Maximum', ''],
  [2, [1, 0], 'Fast', ''],
  [2, [1, 1], 'SuperFast', ''],
  ...generalPurposeFlagDef
]

const compressionMethodDef: parser.ValueDefinition = {
  0: 'store',
  1: 'Shrunk',
  2: 'Reduced 1',
  3: 'Reduced 2',
  4: 'Reduced 3',
  5: 'Reduced 4',
  6: 'Imploded',
  7: 'Tokenizing',
  8: 'Deflated',
  9: 'Deflate64',
  10: 'PKWARE'
}

export class ZipParser implements parser.Parser {
  isSupportedFile (filename: string, ext: string, buffer:ArrayBuffer) {
    return ext === 'zip' || parser.Helper.checkContent(buffer, 0, [0x50, 0x4b, 0x03, 0x04])
  }

  getParsingOptions () {
    return [{
      id: 'encoding',
      name: 'File name encoding',
      description: 'Zip specification does not have a place to specify file name encoding. If you encounter file name problem you can guess a new encoding and try again',
      defaultValue: 'utf-8'
    }]
  }

  parse (buffer: ArrayBuffer, options?: parser.ParsingOptions) : parser.Region[] {
    const p = new parser.Helper(buffer)
    p.setEndian(parser.Endian.LE)
    p.setTextEncoding(options?.encoding)

    const ret: parser.Region[] = []

    // looking for EOCD
    const pos = p.searchPatternBackward(buffer, [0x50, 0x4B, 0x05, 0x06])
    if (pos === -1) {
      throw new Error('cannot find EOCD')
    }

    const [eocd, cdOffset32, cdSize32, cdRecords32] = this.parseEOCD(p, pos, buffer.byteLength)
    ret.push(eocd)

    let [cdOffset, cdSize, cdRecords] = [cdOffset32, cdSize32, cdRecords32]
    if (cdOffset === 0xFFFFFFFF && cdSize === 0xFFFFFFFF && cdRecords === 0xFFFF && pos > 20 && p.checkContent(pos - 20, [0x50, 0x4B, 0x06, 0x07])) {
      const [eocd64Locator, eocd64, cdOffset64, cdSize64, cdRecords64] = this.parseEOCD64(p, pos - 20)
      ret.unshift(eocd64, eocd64Locator)
      cdOffset = cdOffset64
      cdSize = cdSize64
      cdRecords = cdRecords64
    }

    const cd = p.createCompoundRegion(cdOffset, cdSize, 'CD', 'central directory')
    const regions = new Array(cdRecords)
    cd.subRegions = regions
    cd.subRegionFetcher = index => {
      if (regions[index] !== undefined) {
        return regions[index]
      }

      let lastKnownIndex = -1
      let lastEndPos = cd.startPos
      for (let i = index - 1; i >= 0; i--) {
        if (regions[i] !== undefined) {
          lastKnownIndex = i
          lastEndPos = regions[i].endPos
        }
      }

      for (let i = lastKnownIndex; i < index - 1; i++) {
        // cd record length = 46 + n + m + k; n, m, k = uint16(arr, 28, 30, 32)
        const n = p.parseUint(buffer, lastEndPos + 28, lastEndPos + 30)
        const m = p.parseUint(buffer, lastEndPos + 30, lastEndPos + 32)
        const k = p.parseUint(buffer, lastEndPos + 32, lastEndPos + 34)
        lastEndPos += 46 + Number(n) + Number(m) + Number(k)
      }

      return this.parseCD(p, lastEndPos)
    }

    const lf = p.createCompoundRegion(0, cdOffset, 'LocalFiles', '')
    lf.subRegions = new Array(cdRecords)
    lf.subRegionFetcher = index => {
      if (cd.subRegions === undefined || cd.subRegionFetcher === undefined) {
        throw new Error('not possible')
      }
      let cdr = cd.subRegions[index]
      if (cdr === undefined) {
        cdr = cd.subRegionFetcher(index)
      }

      const pos = p.getNumber('localHeaderOffset', cdr)
      return this.parseLocalFile(p, pos)
    }

    ret.unshift(lf, cd)
    return ret
  }

  parseEOCD (p: parser.Helper, offset: number, end: number) : [parser.Region, number, number, number] {
    const eocd = p.createCompoundRegion(offset, end - offset, 'EOCD', 'End of central directory record')
    eocd.subRegions = [
      p.createGeneralRegion(offset, 4, 'signature', ''),
      p.createNumberRegion(offset + 4, 2, 'num'),
      p.createNumberRegion(offset + 6, 2, 'cdNum'),
      p.createNumberRegion(offset + 8, 2, 'cdRecords'),
      p.createNumberRegion(offset + 10, 2, 'totalRecords'),
      p.createSizeRegion(offset + 12, 4, 'cdSize'),
      p.createOffsetRegion(offset + 16, 4, 'cdOffset'),
      p.createNumberRegion(offset + 20, 2, 'commentLength'),
      p.createNumberRegion(offset + 22, p.getNumber('commentLength'), 'comment')
    ]
    return [eocd, p.getNumber('cdOffset'), p.getNumber('cdSize'), p.getNumber('cdRecords')]
  }

  parseEOCD64 (p: parser.Helper, offset: number): [parser.Region, parser.Region, number, number, number] {
    p.position = offset
    const eocd64Locator = p.createCompoundRegion(-1, -1, 'EOCD64Locator', '', [
      p.createGeneralRegion(-1, 4, 'signature'),
      p.createNumberRegion(-1, 4, 'eocd64Disk'),
      p.createOffsetRegion(-1, 8, 'eocd64Offset'),
      p.createSizeRegion(-1, 4, 'diskCount')
    ])

    p.position = p.getNumber('eocd64Offset')
    const eocd64 = p.createCompoundRegion(-1, -1, 'EOCD64', '', [
      p.createGeneralRegion(-1, 4, 'signature'),
      p.createSizeRegion(-1, 8, 'size'),
      p.createNumberRegion(-1, 2, 'versionMade'),
      p.createNumberRegion(-1, 2, 'versionCompat'),
      p.createNumberRegion(-1, 4, 'numDisk'),
      p.createNumberRegion(-1, 4, 'numDiskWithCD'),
      p.createNumberRegion(-1, 8, 'cdRecordsCurrentDisk'),
      p.createNumberRegion(-1, 8, 'cdRecords'),
      p.createSizeRegion(-1, 8, 'cdSize'),
      p.createOffsetRegion(-1, 8, 'cdOffset'),
      p.createGeneralRegion(-1, p.getNumber('size') - 44, 'extensibleData')
    ])

    return [eocd64Locator, eocd64, p.getNumber('cdOffset'), p.getNumber('cdSize'), p.getNumber('cdRecords')]
  }

  // parse one cd record
  parseCD (p: parser.Helper, offset: number) {
    const cd = p.createCompoundRegion(offset, offset + 46, 'CD', 'central directory record')
    cd.subRegions = [
      p.createGeneralRegion(offset, 4, 'signature'),
      p.createNumberRegion(offset + 4, 2, 'version'),
      p.createNumberRegion(offset + 6, 2, 'versionMin'),
      p.createNumberRegion(offset + 8, 2, 'generalPurpose'),
      p.createNumberRegion(offset + 10, 2, 'compressionMethod', '', compressionMethodDef),
      p.createNumberRegion(offset + 12, 2, 'mtime'),
      p.createNumberRegion(offset + 14, 2, 'mdate'),
      p.createNumberRegion(offset + 16, 4, 'crc32'),
      p.createSizeRegion(offset + 20, 4, 'compressedSize'),
      p.createSizeRegion(offset + 24, 4, 'uncompressedSize'),
      p.createSizeRegion(offset + 28, 2, 'filenameLength'),
      p.createSizeRegion(offset + 30, 2, 'extraFieldLength'),
      p.createSizeRegion(offset + 32, 2, 'commentLength'),
      p.createNumberRegion(offset + 34, 2, 'diskNum'),
      p.createNumberRegion(offset + 36, 2, 'internalAttr'),
      p.createNumberRegion(offset + 38, 4, 'externalAttr'),
      p.createNumberRegion(offset + 42, 4, 'localHeaderOffset'),
      p.createStringRegion(offset + 46, p.getNumber('filenameLength'), 'filename'),
      p.createGeneralRegion(-1, p.getNumber('extraFieldLength'), 'extraField'),
      p.createStringRegion(-1, p.getNumber('commentLength'), 'comment')
    ]
    cd.endPos = p.position
    cd.strValue = p.regionCache.filename.strValue

    const m = p.getNumber('compressionMethod')
    p.regionCache.generalPurpose.flagDefinition = m === 6 ? generalPurposeFlagDefImploding : (m === 8 || m === 9 ? generalPurposeFlagDefDeflating : generalPurposeFlagDef)

    return cd
  }

  parseLocalFile (p: parser.Helper, offset: number) {
    const f = p.createCompoundRegion(offset, offset + 30, 'FILE', 'local file record')
    f.subRegions = [
      p.createGeneralRegion(offset, 4, 'signature'),
      p.createNumberRegion(offset + 4, 2, 'version'),
      p.createFlagRegion(offset + 6, 2, 'generalPurpose'),
      p.createNumberRegion(offset + 8, 2, 'compressionMethod', '', compressionMethodDef),
      p.createNumberRegion(offset + 10, 2, 'mtime'),
      p.createNumberRegion(offset + 12, 2, 'mdate'),
      p.createNumberRegion(offset + 14, 4, 'crc32'),
      p.createSizeRegion(offset + 18, 4, 'compressedSize'),
      p.createSizeRegion(offset + 22, 4, 'uncompressedSize'),
      p.createSizeRegion(offset + 26, 2, 'filenameLength'),
      p.createSizeRegion(offset + 28, 2, 'extraFieldLength'),
      p.createStringRegion(offset + 30, p.getNumber('filenameLength'), 'filename'),
      p.createGeneralRegion(-1, p.getNumber('extraFieldLength'), 'extraField'),
      p.createGeneralRegion(-1, p.getNumber('compressedSize'), 'compressedData')
    ]
    f.endPos = p.position
    f.strValue = p.regionCache.filename.strValue

    const m = p.getNumber('compressionMethod')
    p.regionCache.generalPurpose.flagDefinition = m === 6 ? generalPurposeFlagDefImploding : (m === 8 || m === 9 ? generalPurposeFlagDefDeflating : generalPurposeFlagDef)

    return f
  }
}
