import * as dom from './common/dom.js'
import * as parser from './common/parser.js'

export class RiffParser implements parser.Parser {
    formType: string = ''

    isSupportedFile(filename: string, ext: string) {
        return ['wav', 'ani'].indexOf(ext) >= 0
    }

    parse(buffer: ArrayBuffer) : dom.Region[] {
        let p = new parser.ParseHelper(buffer)
        p.setEndian(dom.Endian.LE)

        return this.parseChunks(p, 0)
    }

    parseChunks(p:parser.ParseHelper, offset: number) {
        const regions: dom.Region[] = []
        while (offset < p.buffer.byteLength) {
            const chunk = p.createRegion('C', offset, 0, 'Trunk', 'RIFF Trunk')
            chunk.subRegions = [
                p.createRegion('S', offset, 4, 'FourCC', 'RIFF FourCC tag'),
                p.createRegion('N', -1, 4, 'Size', 'RIFF chunk size')
            ]
            const size = p.num.Size
            const tag = p.regionCache.FourCC.strValue?.trim() || ""
            const content = this.parseContent(p, tag, offset + 8, size)
            chunk.subRegions.push(...content)
            chunk.strValue = tag
            chunk.endPos = offset + size + 8
            regions.push(chunk)

            offset += size + 8
        }
        return regions
    }

    parseContent(p:parser.ParseHelper, fourCC: string, offset: number, size: number) {
        if (fourCC === 'RIFF') {
            const formType = p.createRegion('S', offset, 4, 'FormType')
            this.formType = formType.strValue || ''
            return [
                formType,
                ...this.parseChunks(p, offset + 4)
            ]
        } else if (this.formType === 'WAVE' && fourCC === 'fmt') {
            return [
                p.createRegion('N', offset, 2, 'formatTag'),
                p.createRegion('N', -1,     2, 'channels'),
                p.createRegion('N', -1,     4, 'samplesPerSecond'),
                p.createRegion('N', -1,     4, 'avgBytesPerSecond'),
                p.createRegion('N', -1,     2, 'blockAlign'),
                p.createRegion('N', -1,     2, 'bitsPerSample')
            ]
        } else if (this.formType === 'WAVE' && fourCC === 'data') {
            return [
                p.createRegion('G', offset, size, 'data')
            ]
        } else if (fourCC === 'LIST') {
            return [
                p.createRegion('S', offset, 4, 'ListName'),
                ...this.parseChunks(p, offset + 4)
            ]
        } else{
            return [
                p.createRegion('G', offset, size, 'data')
            ]
        }
    }
}