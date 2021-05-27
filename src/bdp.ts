import * as parser from './parser/parser.js'
import * as ico from './parser/ico.js'
import {PeParser} from './parser/pe.js'
import { ZipParser } from './parser/zip.js'
import { RiffParser } from './parser/riff.js'
import { TTFParser } from './parser/ttf.js'

const parsers: {
    [id:string]: parser.Parser
} = {}

export function init() {
    parsers.ico = new ico.IcoParser()
    parsers.zip = new ZipParser()
    parsers.pe = new PeParser()
    parsers.riff = new RiffParser()
    parsers.ttf = new TTFParser()
}

export async function parse(buffer: Blob, filename: string, forceType?: string) {
    const ext = filename.split('.').pop()?.toLowerCase() || ''
    let parser: parser.Parser | null = null
    if (forceType) {
        parser = parsers[forceType]
    } else {
        for (const k of Object.keys(parsers)) {
            if (parsers[k].isSupportedFile(filename, ext)) {
                parser = parsers[k]
                console.log('selected parser: ' + k)
                break
            }
        }
    }

    const arr = await buffer.arrayBuffer()

    try {
        if (parser === null) {
            throw "couldn't find a parser"
        }

        const r = parser.parse(arr)
        return {
            buffer: arr, regions: r
        }
    } catch (e) {
        console.log(e)
        return {
            buffer: arr, regions: []
        }
    }
}

//console.log(buffer)
//const r = ico.parseIco(buffer)
//console.log(r)

//console.dir(r, {depth: 6, compact: true, breakLength: 200})