import * as parser from './parser.js'

export class RiffParser implements parser.Parser {
  formType: string = ''

  isSupportedFile (filename: string, ext: string) {
    return ['wav', 'ani'].indexOf(ext) >= 0
  }

  parse (buffer: ArrayBuffer) : parser.Region[] {
    const p = new parser.Helper(buffer)
    p.setEndian(parser.Endian.LE)

    return this.parseChunks(p, 0)
  }

  parseChunks (p:parser.Helper, offset: number) {
    const regions: parser.Region[] = []
    while (offset < p.buffer.byteLength) {
      const chunk = p.createCompoundRegion(offset, 0, 'Trunk', 'RIFF Trunk')
      const tag = p.createStringRegion(offset, 4, 'FourCC', 'RIFF FourCC tag')
      const sizeRegion = p.createSizeRegion(-1, 4, 'Size', 'RIFF chunk size')
      const size = Number(sizeRegion.numValue)
      const content = this.parseContent(p, tag.strValue?.trim(), offset + 8, size)
      chunk.subRegions = [tag, sizeRegion, ...content]
      chunk.strValue = tag.strValue
      chunk.endPos = offset + size + 8
      regions.push(chunk)
      offset += size + 8
    }
    return regions
  }

  parseContent (p:parser.Helper, fourCC: string | undefined, offset: number, size: number) {
    if (fourCC === 'RIFF') {
      const formType = p.createStringRegion(offset, 4, 'FormType')
      this.formType = formType.strValue || ''
      return [
        formType,
        ...this.parseChunks(p, offset + 4)
      ]
    } else if (this.formType === 'WAVE' && fourCC === 'fmt') {
      return [
        p.createNumberRegion(offset, 2, 'formatTag', '', { 1: 'PCM', 3: 'IEEE float', 6: '8-bit ITU-T G.711 A-law', 7: '8-bit ITU-T G.711 µ-law', 65534: 'Determined by SubFormat' }),
        p.createNumberRegion(-1, 2, 'channels'),
        p.createNumberRegion(-1, 4, 'samplesPerSecond'),
        p.createNumberRegion(-1, 4, 'avgBytesPerSecond'),
        p.createNumberRegion(-1, 2, 'blockAlign'),
        p.createNumberRegion(-1, 2, 'bitsPerSample')
      ]
    } else if (this.formType === 'WAVE' && fourCC === 'data') {
      return [
        p.createGeneralRegion(offset, size, 'data')
      ]
    } else if (fourCC === 'LIST') {
      return [
        p.createStringRegion(offset, 4, 'ListName'),
        ...this.parseChunks(p, offset + 4)
      ]
    } else {
      return [
        p.createGeneralRegion(offset, size, 'data')
      ]
    }
  }
}
