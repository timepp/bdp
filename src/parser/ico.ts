import * as dom from './common/dom.js'
import * as parser from './common/parser.js'

export class IcoParser implements parser.Parser {
    isSupportedFile(filename: string, ext: string) {
        return ext === 'ico'
    }

    parse(buffer: ArrayBuffer) : dom.Region[] {
        let p = new parser.ParseHelper(buffer)
        p.setEndian(dom.Endian.LE)
    
        const signature = p.createRegion('G', 0, 4, 'signature', 'ICO file signature (00 00 01 00)', p.CV([0, 0, 1, 0]))
        const imageSize = p.createRegion('N', 4, 2, 'imageSize', 'number of images the ico contains')
        const iconDirectories = p.createRegion('C', 6, 16 * p.num.imageSize, 'iconDirectories')
        iconDirectories.subRegions = []
        const images = p.createRegion('C', 0, 0, 'images')
        images.subRegions = []
        for (let i = 0; i < p.num.imageSize; i++) {
            const pos = 6 + 16 * i
            const dir = p.createRegion('C', pos, 16, 'iconDirectory')
            const whInterpreter = function (r: dom.Region) { if (r.numValue === 0n) r.numValue = 256n }
            dir.subRegions = [
                p.createRegion('N', pos, 1, 'width',         'image width in pixels', whInterpreter),
                p.createRegion('N', -1,  1, 'height',        'image height in pixels', whInterpreter),
                p.createRegion('N', -1,  1, 'paletteNumber', 'number of colors in the color palette'),
                p.createRegion('N', -1,  1, 'reserved',      'should be 0'),
                p.createRegion('N', -1,  2, 'planes',        'color planes'),
                p.createRegion('N', -1,  2, 'bits',          'bits per pixel'),
                p.createRegion('N', -1,  4, 'size',          'image size in bytes'),
                p.createRegion('N', -1,  4, 'offset',        'offset of the image data')
            ]

            dir.description =  `${p.num['width']}x${p.num['height']} ${p.num['bits']} bits`
            iconDirectories.subRegions.push(dir)
            images.subRegions.push(p.createRegion('G', p.num.offset, p.num.size, 'images'))
        }
        
        return [
            signature,
            imageSize,
            iconDirectories,
            images
        ]
    }
}