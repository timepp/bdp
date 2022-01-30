import * as parser from './parser/parser.js'
import * as ico from './parser/ico.js'
import { PeParser } from './parser/pe.js'
import { ZipParser } from './parser/zip.js'
import { RiffParser } from './parser/riff.js'
import { TTFParser } from './parser/ttf.js'
import { Mp4Parser } from './parser/mp4.js'
import { Mp3Parser } from './parser/mp3.js'
import { BerParser } from './parser/asn.js'
import { PngParser } from './parser/png.js'
import { JpgParser } from './parser/jpg.js'
import { GzipParser } from './parser/gz.js'
import { ProtoBufferParser } from './parser/pbf.js'

export { ParsingOptionDef, ParsingOptions } from './parser/parser.js'

export class BinaryDataParser {
  parsers: {[id:string]:parser.Parser}
  buffer?: ArrayBuffer
  parser?: parser.Parser
  parsingOptions: {[id:string]:parser.ParsingOptions} = {}

  constructor () {
    this.parsers = {
      ico: new ico.IcoParser(),
      zip: new ZipParser(),
      pe: new PeParser(),
      riff: new RiffParser(),
      ttf: new TTFParser(),
      mp3: new Mp3Parser(),
      mp4: new Mp4Parser(),
      ber: new BerParser(),
      png: new PngParser(),
      jpg: new JpgParser(),
      gzip: new GzipParser(),
      protobuf: new ProtoBufferParser()
    }
  }

  getParsingOptionDef () {
    const options: {[id:string]:parser.ParsingOptionDef[]} = {}
    for (const k of Object.keys(this.parsers)) {
      const p = this.parsers[k]
      if (p.getParsingOptions !== undefined) {
        options[k] = p.getParsingOptions()
      }
    }
    return options
  }

  setParsingOptions (options: {[id:string]:parser.ParsingOptions}) {
    this.parsingOptions = options
  }

  findParser (buffer: ArrayBuffer, filename: string, forceType?: string) {
    const ext = filename.split('.').pop()?.toLowerCase() || ''
    if (forceType) {
      return forceType
    } else {
      for (const k of Object.keys(this.parsers)) {
        if (this.parsers[k].isSupportedFile(filename, ext, buffer)) {
          console.log('selected parser: ' + k)
          return k
        }
      }
    }
  }

  parse (buffer: ArrayBuffer, filename: string, forceType?: string) {
    const result = { buffer, regions: [] as parser.Region[] }
    this.buffer = buffer

    const type = this.findParser(buffer, filename, forceType)
    if (type !== undefined) {
      result.regions = this.parsers[type].parse(buffer, this.parsingOptions[type])
    }
    return result
  }
}
