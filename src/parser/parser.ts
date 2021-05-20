import * as dom from './dom.js'
import * as util from './util.js'

export interface Parser {
    parse(buffer: ArrayBuffer) : dom.Region[]
    isSupportedFile(filename: string, ext: string): boolean
}

export class ParseHelper {
    buffer: ArrayBuffer
    position: number
    endian: dom.Endian
    num: { [id:string]:number } // memo for recent numbers

    constructor(buffer: ArrayBuffer) {
        this.buffer = buffer
        this.position = 0
        this.num = {}
        this.endian = dom.Endian.LE
    }

    createRegion(type: dom.RegionType, pos: number, length: number, ID:string, description?:string, callback?:(r:dom.Region)=>void) : dom.Region {
        const r: dom.Region = {
            ID, type, description: description || '', startPos: pos, endPos: pos + length, endian: this.endian
        }

        switch (type) {
            case 'N':
                r.numValue = util.parseValue(this.buffer, pos, pos + length, this.endian === dom.Endian.BE, false)
                this.num[ID] = Number(r.numValue)
                break
            case 'n':
                r.numValue = util.parseValue(this.buffer, pos, pos + length, this.endian === dom.Endian.BE, true)
                this.num[ID] = Number(r.numValue)
                break
            case 'S':
                const d = new TextDecoder()
                r.strValue = d.decode(this.buffer.slice(pos, pos + length))
                break
            case 'G':
            case 'C':
                break
        }

        if (callback) {
            callback(r)
        }

        return r
    }

    // create callback function for 'createRegion' to validate content
    CV(content: number[]) {
        const that = this
        return function(r:dom.Region) {
            util.ensureContent(that.buffer, r.startPos, content)
        }
    }

    setEndian(endian: dom.Endian) {
        this.endian = endian
    }
}
