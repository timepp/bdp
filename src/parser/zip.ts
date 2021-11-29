import * as dom from './common/dom.js'
import * as util from './common/util.js'
import * as parser from './common/parser.js'

export class ZipParser implements parser.Parser {
    isSupportedFile(filename: string, ext: string, buffer:ArrayBuffer) {
        return ext === 'zip' || util.checkContent(buffer, 0, [0x50, 0x4b, 0x03, 0x04])
    }

    parse(buffer: ArrayBuffer) : dom.Region[] {
        let p = new parser.ParseHelper(buffer)
        p.setEndian(dom.Endian.LE)

        // looking for the stupid EOCD :(
        const pos = util.searchPattern(buffer, [0x50, 0x4B, 0x05, 0x06], false)
        if (pos === -1) {
            throw 'cannot find EOCD'
        }

        const that = this
        const eocd = this.parseEOCD(p, pos, buffer.byteLength)
        const cd = p.createRegion('C', p.num.cdoffset, p.num.cdsize, 'CD', 'central directory')
        cd.subRegions = new Array(p.num.cdrecords)
        cd.subRegionFetcher = function (index: number) {
            if (cd.subRegions === undefined) {
                throw 'not possbile'
            }
            if (cd.subRegions[index] !== undefined) {
                return cd.subRegions[index]
            }
            
            let lastKnownIndex = -1
            let lastEndPos = cd.startPos
            for (let i = index - 1; i >= 0; i--) {
                if (cd.subRegions[i] !== undefined) {
                    lastKnownIndex = i
                    lastEndPos = cd.subRegions[i].endPos
                }
            }

            for (let i = lastKnownIndex; i < index - 1; i++) {
                // cd record length = 46 + n + m + k; n, m, k = uint16(arr, 28, 30, 32)
                const n = util.parseValue(buffer, lastEndPos + 28, lastEndPos + 30, false, false)
                const m = util.parseValue(buffer, lastEndPos + 30, lastEndPos + 32, false, false)
                const k = util.parseValue(buffer, lastEndPos + 32, lastEndPos + 34, false, false)
                lastEndPos += 46 + Number(n) + Number(m) + Number(k)
            }

            return that.parseCD(p, lastEndPos)
        }

        const lf = p.createRegion('C', 0, p.num.cdoffset, 'LocalFiles', '')
        lf.subRegions = new Array(p.num.cdrecords)
        lf.subRegionFetcher = function (index: number) {
            if (cd.subRegions === undefined || cd.subRegionFetcher === undefined) {
                throw 'not possible'
            }
            let cdr = cd.subRegions[index]
            if (cdr === undefined) {
                cdr = cd.subRegionFetcher(index)
            }
            
            const pos = p.getNumber(cdr.subRegions, 'localHeaderOffset')
            return that.parseLocalFile(p, pos)
        }

        return [
            lf, cd, eocd
        ]
    }

    parseEOCD(p: parser.ParseHelper, offset: number, end: number) {
        const eocd = p.createRegion('C', offset, end - offset, 'EOCD', 'End of central directory record')
        eocd.subRegions = [
            p.createRegion('G', offset,      4, 'signature', '', p.CV([0x50, 0x4b, 0x05, 0x06])),
            p.createRegion('N', offset + 4,  2, 'num'),
            p.createRegion('N', offset + 6,  2, 'cdnum'),
            p.createRegion('N', offset + 8,  2, 'cdrecords'),
            p.createRegion('N', offset + 10, 2, 'totalrecords'),
            p.createRegion('N', offset + 12, 4, 'cdsize'),
            p.createRegion('N', offset + 16, 4, 'cdoffset'),
            p.createRegion('N', offset + 20, 2, 'commentLength'),
            p.createRegion('S', offset + 22, p.num['commentLength'], 'comment')
        ]
        return eocd
    }

    // parse one cd record
    parseCD(p: parser.ParseHelper, offset: number) {
        const cd = p.createRegion('C', offset, offset + 46, 'CD', 'central directory record')
        cd.subRegions = [
            p.createRegion('G', offset,      4, 'signature', '', p.CV([0x50, 0x4b, 0x01, 0x02])),
            p.createRegion('N', offset + 4,  2, 'version'),
            p.createRegion('N', offset + 6,  2, 'versionMin'),
            p.createRegion('N', offset + 8,  2, 'generalPurpose'),
            p.createRegion('N', offset + 10, 2, 'compressionMethod'),
            p.createRegion('N', offset + 12, 2, 'mtime'),
            p.createRegion('N', offset + 14, 2, 'mdate'),
            p.createRegion('N', offset + 16, 4, 'crc32'),
            p.createRegion('N', offset + 20, 4, 'compressedSize'),
            p.createRegion('N', offset + 24, 4, 'uncompressedSize'),
            p.createRegion('N', offset + 28, 2, 'filenameLength'),
            p.createRegion('N', offset + 30, 2, 'extraFieldLength'),
            p.createRegion('N', offset + 32, 2, 'commentLength'),
            p.createRegion('N', offset + 34, 2, 'diskNum'),
            p.createRegion('N', offset + 36, 2, 'internalAttr'),
            p.createRegion('N', offset + 38, 4, 'externalAttr'),
            p.createRegion('N', offset + 42, 4, 'localHeaderOffset'),
            p.createRegion('S', offset + 46, p.num.filenameLength, 'filename'),
            p.createRegion('G', -1,          p.num.extraFieldLength, 'extraField'),
            p.createRegion('S', -1,          p.num.commentLength, 'comment'),
        ]
        cd.endPos = p.position
        cd.strValue = p.regionCache.filename.strValue
        
        return cd
    }

    parseLocalFile(p: parser.ParseHelper, offset: number) {
        const f = p.createRegion('C', offset, offset + 30, 'FILE', 'local file record')
        f.subRegions = [
            p.createRegion('G', offset,      4, 'signature', '', p.CV([0x50, 0x4b, 0x03, 0x04])),
            p.createRegion('N', offset + 4,  2, 'version'),
            p.createRegion('N', offset + 6,  2, 'generalPurpose'),
            p.createRegion('N', offset + 8,  2, 'compressionMethod'),
            p.createRegion('N', offset + 10, 2, 'mtime'),
            p.createRegion('N', offset + 12, 2, 'mdate'),
            p.createRegion('N', offset + 14, 4, 'crc32'),
            p.createRegion('N', offset + 18, 4, 'compressedSize'),
            p.createRegion('N', offset + 22, 4, 'uncompressedSize'),
            p.createRegion('N', offset + 26, 2, 'filenameLength'),
            p.createRegion('N', offset + 28, 2, 'extraFieldLength'),
            p.createRegion('S', offset + 30, p.num.filenameLength, 'filename'),
            p.createRegion('G', -1,          p.num.extraFieldLength, 'extraField'),
            p.createRegion('G', -1,          p.num.compressedSize, 'compressedData'),
        ]
        f.endPos = p.position
        f.strValue = p.regionCache.filename.strValue
        
        return f
    }
}
