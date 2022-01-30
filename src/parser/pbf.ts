import * as parser from './parser.js'

// https://developers.google.com/protocol-buffers/docs/encoding

enum WireType {
  Varint = 0,
  Number64 = 1,
  LengthDelimited = 2,
  StartGroup = 3,
  EndGroup = 4,
  Number32 = 5
}

export class ProtoBufferParser implements parser.Parser {
  isSupportedFile (filename: string, ext: string) {
    return ext === 'proto' || ext === 'pb'
  }

  parseVarint (a: Uint8Array, index: number) {
    let value = 0n
    let len = 0
    while (index + len < a.length) {
      const byte = a[index + len]
      value = value * 128n + BigInt(byte & 127)
      len = len + 1
      if (byte < 128) break
    }
    return { value, len }
  }

  parseMessages (p: parser.Helper, len: number): parser.Region[] {
    const arr = new Uint8Array(p.buffer)
    const ret: parser.Region[] = []
    const endPos = p.position + len
    while (p.position < endPos) {
      const v = this.parseVarint(arr, p.position)
      const wireType = v.value % 8n
      const fieldNum = v.value / 8n
      const tag = p.createGeneralRegion(p.position, v.len, 'tag')
      tag.description = `${fieldNum}: ${WireType[Number(wireType)]}`
      const m = this.parseMessage(p, Number(wireType))
      const r = p.createCompoundRegion(-1, -1, 'message', '', [tag, m])
      ret.push(r)
    }
    return ret
  }

  parseMessage (p: parser.Helper, type: number) {
    const arr = new Uint8Array(p.buffer)
    const typeName = WireType[type]
    if (type === WireType.Varint) {
      const v = this.parseVarint(arr, p.position)
      const r = p.createGeneralRegion(p.position, v.len, typeName)
      r.type = parser.RegionType.Number
      r.numValue = (v.value % 2n === 0n) ? v.value / 2n : (-v.value - 1n) / 2n
      return r
    } else if (type === WireType.Number32) {
      return p.createNumberRegion(-1, 4, typeName)
    } else if (type === WireType.Number64) {
      return p.createNumberRegion(-1, 8, typeName)
    } else if (type === WireType.LengthDelimited) {
      const v = this.parseVarint(arr, p.position)
      const l = p.createGeneralRegion(p.position, v.len, 'Len')
      l.type = parser.RegionType.Number
      l.numValue = v.value
      const startPos = p.position
      const r = p.createCompoundRegion(p.position, Number(v.value), 'Content')
      try {
        r.subRegions = this.parseMessages(p, Number(v.value))
      } catch (e) {
        console.log('heuristic parse of proto buffer stopped with lacking of schema')
      }
      const ret = p.createCompoundRegion(startPos, Number(v.value), typeName, '', [l, r])
      p.position = startPos + Number(v.value)
      return ret
    } else {
      throw new Error(`unknown proto buffer message type: ${type}`)
    }
  }

  parse (buffer: ArrayBuffer) : parser.Region[] {
    const p = new parser.Helper(buffer)
    p.setEndian(parser.Endian.LE)

    return this.parseMessages(p, buffer.byteLength)
  }
}
