import * as parser from './parser.js'

const JPG_SIG = [0xff, 0xd8]

export class JpgParser implements parser.Parser {
  isSupportedFile (filename: string, ext: string, buffer:ArrayBuffer) {
    return ext === 'jpg' || parser.Helper.checkContent(buffer, 0, JPG_SIG)
  }

  parse (buffer: ArrayBuffer) : parser.Region[] {
    parser.Helper.ensureContent(buffer, 0, JPG_SIG)
    const p = new parser.Helper(buffer)
    p.endian = parser.Endian.BE
    const arr:parser.Region[] = []
    arr.push(p.createRegion('G', 0, JPG_SIG.length, 'Start Of Image'))
    const bytes = new Uint8Array(p.buffer)
    while (p.position < buffer.byteLength) {
      const m = p.createRegion('G', -1, 2, 'Marker')
      const m1 = bytes[m.startPos]
      const m2 = bytes[m.startPos + 1]
      if (m1 !== 0xFF) {
        console.log(`Parse Error at location ${p.position}`)
        break
      }

      if (m2 === 0xD9) {
        m.strValue = 'End Of Image'
        arr.push(m)
      } else if (m2 >= 0xD0 && m2 < 0xD7) {
        m.strValue = 'Restart'
        arr.push(m)
      } else {
        const l = p.createRegion('N', -1, 2, 'Length')
        const d = p.createRegion('G', -1, p.num.Length - 2, 'Data')
        const s = p.createCompoundRegion(m.startPos, d.endPos - m.startPos, 'Segment', '', [m, l, d])

        if (m2 === 0xDA) {
          let x = p.position
          while (x < p.buffer.byteLength - 1) {
            if (bytes[x] === 0xFF && bytes[x + 1] !== 0x00 && (bytes[x + 1] < 0xD0 || bytes[x + 1] > 0xD7)) break
            x++
          }
          const scanData = p.createRegion('G', -1, x - p.position, 'Scan Data')
          s.subRegions?.push(scanData)
          s.endPos = scanData.endPos
        }

        s.strValue = m1.toString(16) + m2.toString(16) + ` (${s.endPos - s.startPos})`

        arr.push(s)
      }
    }
    return arr
  }
}
