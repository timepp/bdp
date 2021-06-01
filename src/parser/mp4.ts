import * as dom from './dom.js'
import * as parser from './parser.js'

export class Mp4Parser implements parser.Parser {
    isSupportedFile(filename: string, ext: string) {
        return ext === 'mp4'
    }

    parse(buffer: ArrayBuffer) : dom.Region[] {
        let p = new parser.ParseHelper(buffer)
        p.setEndian(dom.Endian.BE)

        const boxes = p.createRegion('C', 0, 0, 'Boxes')
        boxes.subRegions = []

        let pos = 0
        while (pos < buffer.byteLength) {
            const box = this.parseBox(p, pos)
            boxes.subRegions.push(box)
            pos = box.endPos
        }
    
        return [boxes]
    }

    parseBox(p: parser.ParseHelper, offset:number) {
        const box = p.createRegion('C', offset, 0, 'Box')
        box.subRegions = []
        const size = p.createRegion('N', offset, 4, 'Size')
        const type = p.createRegion('S', -1, 4, 'Type')
        box.subRegions.push(size, type)
        
        let length = Number(size.numValue)
        if (size.numValue === 0n) {
            const largeSize = p.createRegion('N', -1, 8, 'LargeSize')
            length = Number(largeSize.numValue)
            box.subRegions.push(largeSize)
        } else if (size.numValue === 1n) {
            length = p.buffer.byteLength - offset
        }

        const t = type.strValue || ''

        if (t === 'uuid') {
            const userType = p.createRegion('S', -1, 16, 'UserType')
            box.subRegions.push(userType)
        }

        const parsers : {[type:string]: (p:parser.ParseHelper, offset:number, length:number) => dom.Region[]} = {
            'ftyp': this.parseFileTypeBox,
        }

        const hdrSize = box.subRegions[box.subRegions.length - 1].endPos
        if (t in parsers) {
            const regions = parsers[t].call(this, p, offset + hdrSize, length - hdrSize)
            box.subRegions.push(...regions)
        }

        box.endPos = offset + length
        return box
    }

    parseFileTypeBox(p:parser.ParseHelper, offset: number, length: number) {
        const majorBrand = p.createRegion('S', offset, 4, 'MajorBrand')
        const minorVersion = p.createRegion('N', -1, 4, 'MinorVersion')
        const compatibleBrands = p.createRegion('C', -1, 0, 'CompatibleBrands')
        compatibleBrands.subRegions = []
        for (let i = 8; i < length; i += 4) {
            compatibleBrands.subRegions.push(p.createRegion('S', offset + i, 4, 'Brand'))
        }
        return [majorBrand, minorVersion, compatibleBrands]
    }
}
