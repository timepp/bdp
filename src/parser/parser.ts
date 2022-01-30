// A "binary file parse result" is a list of regions (can be overlap), each has the format like below

export enum RegionType {
  Number,
  Flag,
  Offset,
  Size,
  String,
  Time,
  General, // general untyped data
  Compound, // compound region that contains sub regions
}

export enum Endian { BE, LE }

export type ValueDefinition = {
  [id:string]:string
}

export type FlagDefinition = [number, number | number[], string, string][]

export type Region = {
    // general properties
    ID: string
    type: RegionType
    description: string
    startPos: number
    endPos: number

    // values
    endian?: Endian
    numValue?: bigint
    strValue?: string
    interpretedValue?: string
    valueDefinition?: ValueDefinition
    flagDefinition?: FlagDefinition

    // subRegions can be `undefined`, in such case use the following lazy fetching function to get data on demand
    subRegions?: Region[]
    subRegionFetcher?: (index: number) => Region
}

export type FileDOM = {
    buffer: ArrayBuffer,
    regions: Region[]
}

export type ParsingOptionDef = {
    id: string,
    name: string,
    description: string,
    defaultValue: string,
}

export type ParsingOptions = {
    [id:string]: string
}

export interface Parser {
    /** check if the file can be parsed by the concrete parser */
    isSupportedFile(filename: string, ext: string, buffer:ArrayBuffer): boolean

    getParsingOptions?(): ParsingOptionDef[]

    parse(buffer: ArrayBuffer, options?: ParsingOptions) : Region[]
}

export class Helper {
  buffer: ArrayBuffer
  position = 0
  endian = Endian.LE
  textEncoding: string = 'utf-8'
  regionCache: { [id:string]: Region } = {}

  constructor (buffer: ArrayBuffer) {
    this.buffer = buffer
  }

  fork (pos: number, length: number) {
    if (pos === -1) {
      pos = this.position
    }
    const p = new Helper(this.buffer.slice(0, pos + length))
    p.position = pos
    p.endian = this.endian
    return p
  }

  updatePosAndLength (pos: number, length: number) {
    if (pos === -1) {
      pos = this.position
    }

    if (length === -1) {
      length = this.buffer.byteLength - pos
    }

    return [pos, length]
  }

  // TODO: when to automatically update pos and cache??

  createCompoundRegion (pos: number, length: number, ID: string, description:string = '', subRegions:Region[] = []): Region {
    [pos, length] = this.updatePosAndLength(pos, length)
    const r = {
      ID, type: RegionType.Compound, description, startPos: pos, endPos: pos + length, subRegions
    }
    if (subRegions.length > 0) {
      r.startPos = subRegions[0].startPos
      r.endPos = subRegions[subRegions.length - 1].endPos
    }
    return r
  }

  createNumberRegion (pos: number, length: number, ID:string, description = '', valueDefinition?: ValueDefinition, flagDefinition?: FlagDefinition, isSigned = false, subNumberType: RegionType = RegionType.Number) {
    [pos, length] = this.updatePosAndLength(pos, length)
    const r: Region = {
      ID, type: subNumberType, description, startPos: pos, endPos: pos + length, endian: this.endian
    }
    r.numValue = Helper.parseBigint(this.buffer, pos, pos + length, this.endian === Endian.BE, isSigned)
    r.valueDefinition = valueDefinition
    r.flagDefinition = flagDefinition
    this.position = r.endPos
    this.regionCache[ID] = r
    return r
  }

  createFlagRegion (pos: number, length: number, ID:string, description = '', flagDefinition?: FlagDefinition) {
    return this.createNumberRegion(pos, length, ID, description, undefined, flagDefinition, false, RegionType.Flag)
  }

  createSignedNumberRegion (pos: number, length: number, ID:string, description = '') {
    return this.createNumberRegion(pos, length, ID, description, undefined, undefined, true)
  }

  createOffsetRegion (pos: number, length: number, ID:string, description = '') {
    return this.createNumberRegion(pos, length, ID, description, undefined, undefined, false, RegionType.Offset)
  }

  createSizeRegion (pos: number, length: number, ID:string, description = '') {
    return this.createNumberRegion(pos, length, ID, description, undefined, undefined, false, RegionType.Size)
  }

  createTimeRegion (pos: number, length: number, ID:string, description = '') {
    return this.createNumberRegion(pos, length, ID, description, undefined, undefined, false, RegionType.Time)
  }

  createStringRegion (pos: number, length: number, ID:string, description = '', textEncoding = this.textEncoding, isNullTerminated = false) {
    [pos, length] = this.updatePosAndLength(pos, length)
    const r: Region = {
      ID, type: RegionType.String, description, startPos: pos, endPos: pos + length, endian: this.endian
    }
    const d = new TextDecoder(textEncoding)
    if (isNullTerminated) {
      r.strValue = d.decode(this.buffer.slice(pos, pos + length)).split('\0')[0]
    } else {
      r.strValue = d.decode(this.buffer.slice(pos, pos + length))
    }
    this.position = r.endPos
    this.regionCache[ID] = r
    return r
  }

  createZeroTerminatedStringRegion (pos: number, ID: string, description = '', textEncoding = this.textEncoding) {
    if (pos === -1) pos = this.position
    let index = this.searchPatternForward(pos, [0])
    if (index === -1) index = this.buffer.byteLength
    return this.createStringRegion(pos, index + 1 - pos, ID, description, textEncoding, true)
  }

  createGeneralRegion (pos: number, length: number, ID:string, description = '') {
    [pos, length] = this.updatePosAndLength(pos, length)
    const r: Region = {
      ID, type: RegionType.General, description, startPos: pos, endPos: pos + length, endian: this.endian
    }
    this.position = r.endPos
    this.regionCache[ID] = r
    return r
  }

  // create callback function for 'createRegion' to validate content
  CV (content: number[]) {
    const that = this
    return function (r:Region) {
      Helper.ensureContent(that.buffer, r.startPos, content)
    }
  }

  setEndian (endian: Endian) {
    this.endian = endian
  }

  setTextEncoding (enc?: string) {
    if (enc !== undefined) {
      this.textEncoding = enc
    }
  }

  getNumber (name: string, r?: Region) {
    if (r !== undefined && r.subRegions !== undefined) {
      for (const subRegion of r.subRegions) {
        if (subRegion.ID === name) {
          return Number(subRegion.numValue)
        }
      }
      return 0
    }
    return Number(this.regionCache[name].numValue)
  }

  searchPatternForward (position: number, pattern: number[]): number {
    const arr = new Uint8Array(this.buffer)
    for (let i = position; i <= arr.length - pattern.length; i++) {
      let match = true
      for (let j = 0; j < pattern.length; j++) {
        if (arr[i + j] !== pattern[j]) {
          match = false
        }
      }
      if (match) return i
    }

    return -1
  }

  searchPatternBackward (buf: ArrayBuffer, pattern: number[]): number {
    const arr = new Uint8Array(buf)
    for (let i = arr.length - pattern.length; i >= 0; i--) {
      let match = true
      for (let j = 0; j < pattern.length; j++) {
        if (arr[i + j] !== pattern[j]) {
          match = false
        }
      }
      if (match) return i
    }

    return -1
  }

  parseInt (buf: ArrayBuffer, start: number, end: number): bigint {
    return Helper.parseBigint(buf, start, end, this.endian === Endian.BE, true)
  }

  parseUint (buf: ArrayBuffer, start: number, end: number): bigint {
    return Helper.parseBigint(buf, start, end, this.endian === Endian.BE, false)
  }

  static getValueDefinition (e: any) {
    const def: {[id:string]: string} = {}
    for (const k of Object.keys(e)) {
      def[e[k]] = k
    }
    return def
  }

  static ensureLength (buf: ArrayBuffer, len: number, start: number = 0) {
    if (buf.byteLength < start + len) throw Error('invalid ico file')
  }

  checkContent (start: number, data: number[]) {
    return Helper.checkContent(this.buffer, start, data)
  }

  static checkContent (buf: ArrayBuffer, start: number, data: number[]) {
    const arr1 = new Uint8Array(data)
    const arr2 = new Uint8Array(buf, start, data.length)
    for (let i = 0; i < data.length; i++) {
      if (arr1[i] !== arr2[i]) {
        return false
      }
    }
    return true
  }

  static ensureContent (buf: ArrayBuffer, start: number, data: number[]) {
    if (!Helper.checkContent(buf, start, data)) {
      throw Error('fixed content mismatch')
    }
  }

  static parseNullTerminatedString (buf: ArrayBuffer, start: number) {
    const arr = new Uint8Array(buf)
    for (let i = start; ; i++) {
      if (arr[i] === 0) {
        const decoder = new TextDecoder()
        return decoder.decode(buf.slice(start, i))
      }
    }
  }

  static parseLengthPrefixedString (buf: ArrayBuffer, offset:number, lengthPrefixLength:number, lengthPrefixBigEndian: boolean, encoding: string, byteScale:number) {
    const len = Number(Helper.parseBigint(buf, offset, offset + lengthPrefixLength, lengthPrefixBigEndian, false))
    return Helper.parseFixedLengthString(buf, offset + lengthPrefixLength, len * byteScale, encoding)
  }

  static parseFixedLengthString (buf: ArrayBuffer, offset: number, len: number, encoding: string) {
    const decoder = new TextDecoder(encoding)
    return decoder.decode(buf.slice(offset, offset + len))
  }

  static trimNull (s:string) {
    let i = s.length - 1
    while (i >= 0) {
      if (s.charCodeAt(i) !== 0) break
      i--
    }
    return s.slice(0, i + 1)
  }

  static parseBigint (buf: ArrayBuffer, start: number, end: number, isBigEndian: boolean, isSigned: boolean) : bigint {
    const s = isBigEndian ? start : end - 1
    const e = isBigEndian ? end : start - 1
    const d = isBigEndian ? 1 : -1
    const arr = new Uint8Array(buf)

    let val = 0n
    let base = 1n
    for (let i = s; i !== e; i += d) {
      val = val * 256n
      val += BigInt(arr[i])
      base *= 256n
    }

    if (isSigned && arr[s] >= 128) {
      val = val - base
    }

    return val
  }
}
