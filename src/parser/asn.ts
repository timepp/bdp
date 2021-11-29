import * as dom from './common/dom.js'
import * as parser from './common/parser.js'
import * as util from './common/util.js'

export enum TagClass {
    Universal = 0,
    Application = 1,
    ContextSpecific = 2,
    Private = 3
}

export type Type = {
    tagClass: TagClass,
    constructed: boolean,
    tagNumber: number
}

export const standardTypes = [
    'EOC', 
    'Boolean', 
    'Integer',
    'BitString',
    'OctetString',
    'NULL',
    'OID',
    'ObjectDescriptor',
    'External',
    'Real',
    'Enumerated',
    'EmbededPDV',
    'UTF8String',
    'RelativeOID',
    'Time',
    'Reserved',
    'Sequence',
    'Set',
    'NumericString',
    'PrintableString',
    'T61String',
    'VideotexString',
    'IA5String',
    'UTCTime',
    'GeneralizedTime',
    'GraphicString',
    'VisibleString',
    'GeneralString',
    'UniversalString',
    'CharacterString',
    'BMPString',
    'Date',
    'TimeOfDay',
    'DateTime',
    'Duration',
    'OIDIRI',
    'RelativeOIDIRI'
]

export class BerParser implements parser.Parser {
    isSupportedFile(filename: string, ext: string, buffer:ArrayBuffer) {
        return ext === 'ber' || ext === 'der' || ext === 'cer'
    }

    parse(buffer: ArrayBuffer) : dom.Region[] {
        const arr = new Uint8Array(buffer)
        let p = new parser.ParseHelper(buffer)
        return this.parseTLV(p)
    }

    parseTLV(p: parser.ParseHelper) : dom.Region[] {
        const r: dom.Region[] = []
        while (p.position < p.buffer.byteLength) {
            const arr = new Uint8Array(p.buffer.slice(p.position))
            const [t, tl] = parseAsnType(arr)
            console.log('position: ', p.position)
            console.log(t, tl)
            const [l, ll, eoc] = parseAsnLength(arr.slice(tl))
            console.log(l, ll, eoc)
            const T = p.createRegion('G', -1, tl, 'Type', `${t.tagNumber}`)
            T.strValue = t.tagClass === TagClass.Universal? standardTypes[t.tagNumber] : `${t.tagNumber}`
            const L = p.createRegion('G', -1, ll, 'Length', `length: ${l}`)
            L.numValue = BigInt(l)
            let V: dom.Region | undefined
            if (t.constructed) {
                const b2 = p.buffer.slice(0, p.position + l)
                const p2 = new parser.ParseHelper(b2)
                V = p.createCompoundRegion(-1, l + (eoc ? 2 : 0), 'Value')
                V.strValue = `${V.startPos} - ${V.endPos}`
                p2.position = V.startPos
                V.subRegions = this.parseTLV(p2)
            } else {
                V = p.createRegion('G', -1, l + (eoc ? 2 : 0), 'Value')
            }
            const tlv = p.createCompoundRegion(T.startPos, tl + ll + l + (eoc? 2: 0), 'TLV', '', [T, L, V])
            tlv.strValue = `${T.strValue}`
            p.position = tlv.endPos
            r.push(tlv)
        }
        return r
    }
}

export function parseAsnType(arr: Uint8Array): [Type, number] {
    const tagClass = arr[0] >> 6
    const constructed = ((arr[0] >> 5) & 1) === 1
    const n = arr[0] & 0x1F
    if (n === 0x1F) {
        // long form
        let tagNumber = 0
        let i = 1
        for (; ; i++) {
            const x = arr[i] & 0x7F
            tagNumber = tagNumber * 128 + x
            if (arr[i] < 0x80) break
        }
        return [{tagClass, constructed, tagNumber}, i + 1]
    }

    return [{tagClass, constructed, tagNumber:n}, 1]
}

export function parseAsnLength(arr: Uint8Array) : [number, number, boolean] {
    if (arr[0] < 0x80) {
        // short form
        return [arr[0], 1, false]
    }

    if (arr[0] === 0x80) {
        // indefinite form, scan for EOC
        for (let i = 0; ; i++) {
            if (arr[i] === 0 && arr[i+1] === 0) {
                return [i-1, 1, true]
            }
        }
        throw `EOC not found in ASN indefinite form`
    }

    // long form
    const ll = arr[0] & 0x7f
    const l = util.parseValue(arr, 1, ll + 1, true, false)
    return [Number(l), ll + 1, false]
}
