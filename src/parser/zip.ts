import * as dom from './dom.js'
import * as util from './util.js'
import * as parser from './parser.js'

export class ZipParser implements parser.Parser {
    isSupportedFile(filename: string, ext: string) {
        return ext === 'zip'
    }

    parse(buffer: ArrayBuffer) : dom.Region[] {
        let p = new parser.ParseHelper(buffer)
        p.setEndian(dom.Endian.LE)

        // looking for the stupid EOCD :(
        const pos = util.searchPattern(buffer, [0x50, 0x4B, 0x05, 0x06], false)
        if (pos === -1) {
            throw 'cannot find EOCD'
        }

        const eocd = this.parseEOCD(p, pos, buffer.byteLength)
        const cd = p.createRegion('C', p.num.cdoffset, p.num.cdsize, 'CD', 'central directory')
/*    
        const signature = p.createRegion('signature', 0, 4, [0x50, 0x4b, 0x03, 0x04])
        const version = p.createRegion('version', 'Version needed to extract (minimum)', 4, 6)
        const gp = p.createRegion('general purpose', 6, 8)
        const method = p.createRegion('method', 'Compression method; e.g. none = 0, DEFLATE = 8 (or "\0x08\0x00")', 8, 10)
        const mtime = p.createRegion('mtime', 10, 12)
        const mdate = p.createRegion('mdate', 12, 14)
        const crc = p.createRegion('crc32', 14, 18)
        const compressedSize = p.createRegion('compressedSize', 18, 22)
        const uncompressedSize = p.createRegion('uncompressedSize', 22, 26)
        const filenameLength = p.createRegion('filenameLength', 26, 28)
        const extraFieldLength = p.createRegion('extra field length', 28, 30)
        const filename = p.createRegion('filename', 30, 30 + Number(filenameLength.value))
        const extra = p.createRegion('extra', 30 + Number(filenameLength.value), 30 + Number(filenameLength.value) + Number(extraFieldLength.value))
*/
        return [
            cd, eocd
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
}