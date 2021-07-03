import * as dom from './common/dom.js'
import * as parser from './common/parser.js'

export class TTFParser implements parser.Parser {
    isSupportedFile(filename: string, ext: string) {
        return ext === 'ttf'
    }

    parse(buffer: ArrayBuffer) : dom.Region[] {
        let p = new parser.ParseHelper(buffer)
        p.setEndian(dom.Endian.BE)

        const offsetSubTable = p.createRegion('C', 0, 12, 'offsetSubTable', ' keeps record of the tables in the font and provides offset information to access each table in the directory')
        offsetSubTable.subRegions = [
            p.createRegion('N', 0,  4, 'scalarType', 'A tag to indicate the OFA scaler to be used to rasterize this font'),
            p.createRegion('L', -1, 2, 'numTables'),
            p.createRegion('N', -1, 2, 'searchRange'),
            p.createRegion('N', -1, 2, 'entrySelector'),
            p.createRegion('N', -1, 2, 'rangeShift'),
        ]

        const tableDirectory = p.createRegion('C', 12, 16 * p.num.numTables, 'TableDirectory', 'Contains entries for each table in the font')
        tableDirectory.subRegions = []
        for (let i = 0; i < p.num.numTables; i++) {
            tableDirectory.subRegions.push(this.parseTableDirectory(p, tableDirectory.startPos + i * 16))
        }
    
        return [
            offsetSubTable,
            tableDirectory
        ]
    }

    parseTableDirectory(p:parser.ParseHelper, offset: number) {
        const td = p.createRegion('C', offset, 16, 'TableInfo')
        td.subRegions = [
            p.createRegion('S', offset, 4, 'tag'),
            p.createRegion('N', -1,     4, 'checksum'),
            p.createRegion('P', -1,     4, 'offset'),
            p.createRegion('L', -1,     4, 'length')
        ]
        td.strValue = p.regionCache.tag.strValue
        return td
    }
}