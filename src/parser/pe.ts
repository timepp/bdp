import * as dom from './dom.js'
import * as parser from './parser.js'
import * as util from './util.js'

export class PeParser implements parser.Parser {
    isSupportedFile(filename: string, ext: string) {
        return ['exe', 'dll', 'scr', 'sys', 'ocx', 'mui', 'efi', 'drv', 'cpl', 'acm', 'ax', 'tsp'].indexOf(ext) >= 0
    }

    parse(buffer: ArrayBuffer) : dom.Region[] {
        let p = new parser.ParseHelper(buffer)
        p.setEndian(dom.Endian.LE)
        const result : dom.Region[] = []

        let coffOffset = 0
        if (util.checkContent(buffer, 0, [0x4D, 0x5A])) {
            const dosStub = p.createRegion('C', 0, 0, 'DosStub')
            dosStub.subRegions = [
                p.createRegion('N', 0x3C, 4, 'PeHeaderOffset', 'Pointer to PE header')
            ]
            dosStub.endPos = p.num.PeHeaderOffset
            result.push(dosStub)

            const peSignature = p.createRegion('G', p.num.PeHeaderOffset, 4, 'PeSignature', 'PE signature', p.CV([0x50, 0x45, 0, 0]))
            result.push(peSignature)
            coffOffset = p.position
        }

        const coff = this.parseCOFF(p, coffOffset)
        result.push(coff)

        if (p.num.SizeOfOptionalHeader > 0) {
            const optHeader = this.parseOptionalHeader(p, p.position, p.num.SizeOfOptionalHeader)
            result.push(optHeader)
        }

        return result
    }

    parseCOFF(p: parser.ParseHelper, offset: number) {
        const coff = p.createRegion('C', offset, 20, 'COFF')
        coff.subRegions = [
            p.createRegion('N', offset, 2, 'Machine'),
            p.createRegion('N', -1,     2, 'NumberOfSections'),
            p.createRegion('N', -1,     4, 'TimeDateStamp'),
            p.createRegion('N', -1,     4, 'PointerToSymbolTable'),
            p.createRegion('N', -1,     4, 'NumberOfSymbols'),
            p.createRegion('N', -1,     2, 'SizeOfOptionalHeader'),
            p.createRegion('N', -1,     2, 'Characteristics'),
        ]
        return coff
    }

    parseOptionalHeader(p: parser.ParseHelper, offset: number, length: number) {
        const coff = p.createRegion('C', offset, length, 'OptionalHeader')
        coff.subRegions = [
            p.createRegion('N', offset, 2, 'Magic'),
            p.createRegion('N', -1,     1, 'MajorLinkerVersion'),
            p.createRegion('N', -1,     1, 'MinorLinkerVersion'),
            p.createRegion('N', -1,     4, 'SizeOfCode'),
            p.createRegion('N', -1,     4, 'SizeOfInitializedData'),
            p.createRegion('N', -1,     4, 'SizeOfUninitializedData'),
            p.createRegion('N', -1,     4, 'AddressOfEntryPoint'),
            p.createRegion('N', -1,     4, 'BaseOfCode'),
            p.createRegion('N', -1,     4, 'BaseOfData'),

            p.createRegion('N', -1,     4, 'ImageBase', 'The preferred address of the first byte of image when loaded into memory; must be a multiple of 64 K. The default for DLLs is 0x10000000. The default for Windows CE EXEs is 0x00010000. The default for Windows NT, Windows 2000, Windows XP, Windows 95, Windows 98, and Windows Me is 0x00400000.'),
            p.createRegion('N', -1,     4, 'SectionAlignment', 'The alignment (in bytes) of sections when they are loaded into memory. It must be greater than or equal to FileAlignment. The default is the page size for the architecture.'),
            p.createRegion('N', -1,     4, 'FileAlignment', 'The alignment factor (in bytes) that is used to align the raw data of sections in the image file. The value should be a power of 2 between 512 and 64 K, inclusive. The default is 512. If the SectionAlignment is less than the architecture’s page size, then FileAlignment must match SectionAlignment.'),
            p.createRegion('N', -1,     2, 'MajorOperatingSystemVersion', 'The major version number of the required operating system.'),
            p.createRegion('N', -1,     2, 'MinorOperatingSystemVersion', 'The minor version number of the required operating system.'),
            p.createRegion('N', -1,     2, 'MajorImageVersion', 'The major version number of the image.'),
            p.createRegion('N', -1,     2, 'MinorImageVersion', 'The minor version number of the image.'),
            p.createRegion('N', -1,     2, 'MajorSubsystemVersion', 'The major version number of the subsystem.'),
            p.createRegion('N', -1,     2, 'MinorSubsystemVersion', 'The minor version number of the subsystem.'),
            p.createRegion('N', -1,     4, 'Win32VersionValue', 'Reserved, must be zero.'),
            p.createRegion('N', -1,     4, 'SizeOfImage', 'The size (in bytes) of the image, including all headers, as the image is loaded in memory. It must be a multiple of SectionAlignment.'),

            p.createRegion('N', -1,     4, 'SizeOfHeaders', 'The combined size of an MS DOS stub, PE header, and section headers rounded up to a multiple of FileAlignment.'),
            p.createRegion('N', -1,     4, 'CheckSum', 'The image file checksum. The algorithm for computing the checksum is incorporated into IMAGHELP.DLL. The following are checked for validation at load time: all drivers, any DLL loaded at boot time, and any DLL that is loaded into a critical Windows process.'),
            p.createRegion('N', -1,     2, 'Subsystem', 'The subsystem that is required to run this image. For more information, see “Windows Subsystem” later in this specification.'),
            p.createRegion('N', -1,     2, 'DllCharacteristics', 'For more information, see “DLL Characteristics” later in this specification.'),
            p.createRegion('N', -1,     4, 'SizeOfStackReserve', 'The size of the stack to reserve. Only SizeOfStackCommit is committed; the rest is made available one page at a time until the reserve size is reached.'),
            p.createRegion('N', -1,     4, 'SizeOfStackCommit', 'The size of the stack to commit.'),
            p.createRegion('N', -1,     4, 'SizeOfHeapReserve', 'The size of the local heap space to reserve. Only SizeOfHeapCommit is committed; the rest is made available one page at a time until the reserve size is reached.'),
            p.createRegion('N', -1,     4, 'SizeOfHeapCommit', 'The size of the local heap space to commit.'),
            p.createRegion('N', -1,     4, 'LoaderFlags', 'Reserved, must be zero.'),
            p.createRegion('N', -1,     4, 'NumberOfRvaAndSizes', 'The number of data-directory entries in the remainder of the optional header. Each describes a location and size.'),

        ]
        return coff
    }
}
