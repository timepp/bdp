import { off } from 'node:process'
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
                p.createRegion('P', 0x3C, 4, 'PeHeaderOffset', 'Pointer to PE header')
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

        const numberOfSections = p.getNumber(coff.subRegions, 'NumberOfSections')
        const sections = this.parseSections(p, p.position, numberOfSections)
        result.push(sections)

        return result
    }

    parseSections(p: parser.ParseHelper, offset: number, size: number) {
        const sections = p.createRegion('C', offset, size * 40, 'Sections')
        sections.subRegions = []
        for (let i = 0; i < size; i++) {
            const section = p.createRegion('C', offset + i * 40, 40, 'Section')
            const s = section.startPos
            section.subRegions = [
                p.createRegion('s', s,  8, 'Name', 'An 8-byte, null-padded UTF-8 encoded string. If the string is exactly 8 characters long, there is no terminating null. For longer names, this field contains a slash (/) that is followed by an ASCII representation of a decimal number that is an offset into the string table. Executable images do not use a string table and do not support section names longer than 8 characters. Long names in object files are truncated if they are emitted to an executable file.'),
                p.createRegion('L', -1, 4, 'VirtualSize', 'The total size of the section when loaded into memory. If this value is greater than SizeOfRawData, the section is zero-padded. This field is valid only for executable images and should be set to zero for object files.'),
                p.createRegion('P', -1, 4, 'VirtualAddress', 'For executable images, the address of the first byte of the section relative to the image base when the section is loaded into memory. For object files, this field is the address of the first byte before relocation is applied; for simplicity, compilers should set this to zero. Otherwise, it is an arbitrary value that is subtracted from offsets during relocation.'),
                p.createRegion('L', -1, 4, 'SizeOfRawData', 'The size of the section (for object files) or the size of the initialized data on disk (for image files). For executable images, this must be a multiple of FileAlignment from the optional header. If this is less than VirtualSize, the remainder of the section is zero-filled. Because the SizeOfRawData field is rounded but the VirtualSize field is not, it is possible for SizeOfRawData to be greater than VirtualSize as well. When a section contains only uninitialized data, this field should be zero.'),
                p.createRegion('P', -1, 4, 'PointerToRawData', 'The file pointer to the first page of the section within the COFF file. For executable images, this must be a multiple of FileAlignment from the optional header. For object files, the value should be aligned on a 4 byte boundary for best performance. When a section contains only uninitialized data, this field should be zero.'),
                p.createRegion('P', -1, 4, 'PointerToRelocations', 'The file pointer to the beginning of relocation entries for the section. This is set to zero for executable images or if there are no relocations.'),
                p.createRegion('P', -1, 4, 'PointerToLinenumbers', 'The file pointer to the beginning of line-number entries for the section. This is set to zero if there are no COFF line numbers. This value should be zero for an image because COFF debugging information is deprecated.'),
                p.createRegion('L', -1, 2, 'NumberOfRelocations', 'The number of relocation entries for the section. This is set to zero for executable images.'),
                p.createRegion('L', -1, 2, 'NumberOfLinenumbers', 'The number of line-number entries for the section. This value should be zero for an image because COFF debugging information is deprecated.'),
                p.createRegion('N', -1, 4, 'Characteristics', 'The flags that describe the characteristics of the section. For more information, see section 4.1, “Section Flags.”'),
            ]
            section.strValue = p.regionCache['Name'].strValue
            sections.subRegions.push(section)
        }

        return sections
    }

    parseCOFF(p: parser.ParseHelper, offset: number) {
        const coff = p.createRegion('C', offset, 20, 'COFF')
        coff.subRegions = [
            p.createRegion('N', offset, 2, 'Machine'),
            p.createRegion('L', -1,     2, 'NumberOfSections'),
            p.createRegion('N', -1,     4, 'TimeDateStamp'),
            p.createRegion('P', -1,     4, 'PointerToSymbolTable'),
            p.createRegion('L', -1,     4, 'NumberOfSymbols'),
            p.createRegion('L', -1,     2, 'SizeOfOptionalHeader'),
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
            p.createRegion('L', -1,     4, 'SizeOfCode'),
            p.createRegion('L', -1,     4, 'SizeOfInitializedData'),
            p.createRegion('L', -1,     4, 'SizeOfUninitializedData'),
            p.createRegion('P', -1,     4, 'AddressOfEntryPoint'),
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
            this.parseDataDirectories(p, p.position, p.num.NumberOfRvaAndSizes)
        ]
        return coff
    }

    parseDataDirectories(p:parser.ParseHelper, offset: number, size: number) {
        const dds = p.createRegion('C', offset, size * 8, 'DataDirectories')
        const ddNames = [
            ['ExportTable', 'The export table address and size. For more information see section 6.3, “The .edata Section (Image Only).”'],
            ['ImportTable', 'The import table address and size. For more information, see section 6.4, “The .idata Section.”'],
            ['ResourceTable', 'The resource table address and size. For more information, see section 6.9, “The .rsrc Section.”'],
            ['ExceptionTable', 'The exception table address and size. For more information, see section 6.5, “The .pdata Section.”'],
            ['CertificateTable', 'The attribute certificate table address and size. For more information, see section 5.7, “The attribute certificate table (Image Only).”'],
            ['BaseRelocationTable', 'The base relocation table address and size. For more information, see section 6.6, “The .reloc Section (Image Only).”'],
            ['Debug', 'The debug data starting address and size. For more information, see section 6.1, “The .debug Section.”'],
            ['Architecture', 'Reserved, must be 0'],
            ['GlobalPtr', 'The RVA of the value to be stored in the global pointer register. The size member of this structure must be set to zero. '],
            ['TLSTable', 'The thread local storage (TLS) table address and size. For more information, see section 6.7, “The .tls Section.”'],
            ['LoadConfig Table', 'The load configuration table address and size. For more information, see section 6.8, “The Load Configuration Structure (Image Only).”'],
            ['BoundImport', 'The bound import table address and size. '],
            ['IAT', 'The import address table address and size. For more information, see section 6.4.4, “Import Address Table.”'],
            ['DelayImportDescriptor', 'The delay import descriptor address and size. For more information, see section 5.8, “Delay-Load Import Tables (Image Only).”'],
            ['CLR Runtime Header', 'The CLR runtime header address and size. For more information, see section 6.10, “The .cormeta Section (Object Only).”'],
            ['Reserved', '']
        ]
        dds.subRegions = []
        for (let i = 0; i < size; i++) {
            const dd = p.createRegion('C', offset + i * 8, 8, ddNames[i][0], ddNames[i][1])
            dd.subRegions = [
                p.createRegion('N', offset + i * 8,     4, 'address'),
                p.createRegion('N', offset + i * 8 + 4, 4, 'size')
            ]
            dds.subRegions.push(dd)
        }

        return dds
    }
}
