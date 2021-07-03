import * as dom from './dom.js'
import * as parser from './parser.js'
import * as util from './util.js'

export class PeParser implements parser.Parser {
    pe32Plus = false // whether PE32+
    sections: {name:string, rva:number, size:number, offset:number}[] = []
    dataDirectories : {name:string, rva:number, size:number}[] = []

    machineMap: {[id:number]:string} = {
        0:      "applicable to any machine type",
        0x1d3:  "Matsushita AM33",
        0x8664: "x64",
        0x1c0:  "ARM little endian",
        0xebc:  "EFI byte code",
        0x14c:  "x86 (i386)",
        0x200:  "Intel Itanium processor family",
        0x9041: "Mitsubishi M32R little endian",
        0x266:  "MIPS16",
        0x366:  "MIPS with FPU",
        0x466:  "MIPS16 with FPU",
        0x1f0:  "Power PC little endian",
        0x1f1:  "Power PC with floating point support",
        0x166:  "MIPS little endian",
        0x1a2:  "Hitachi SH3",
        0x1a3:  "Hitachi SH3 DSP",
        0x1a6:  "Hitachi SH4",
        0x1a8:  "Hitachi SH5",
        0x1c2:  "Thumb",
        0x169:  "MIPS little-endian WCE v2"
    }

    isSupportedFile(filename: string, ext: string) {
        return ['exe', 'dll', 'scr', 'sys', 'ocx', 'mui', 'efi', 'drv', 'cpl', 'acm', 'ax', 'tsp', 'pyd'].indexOf(ext) >= 0
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

        const coff = this.parseCOFFHeader(p, coffOffset)
        result.push(coff)

        if (p.num.SizeOfOptionalHeader > 0) {
            const optHeader = this.parseOptionalHeader(p, p.position, p.num.SizeOfOptionalHeader)
            result.push(optHeader)
        }

        const numberOfSections = p.getNumber(coff.subRegions, 'NumberOfSections')
        const [sectionTable, sections] = this.parseSections(p, p.position, numberOfSections)
        result.push(sectionTable, sections)

        // now we can parse other data (import table, etc) based on RVA of sections and RVA of data directory entries
        result.push(...this.parseOtherContent(p))

        return result
    }

    parseSections(p: parser.ParseHelper, offset: number, size: number) {
        const sectionTable = p.createRegion('C', offset, size * 40, 'SectionTable')
        sectionTable.subRegions = []
        const sections = p.createRegion('C', 0, 0, 'Sections')
        sections.subRegions = []
        for (let i = 0; i < size; i++) {
            const sectionInfo = p.createRegion('C', offset + i * 40, 40, 'SectionInfo')
            const s = sectionInfo.startPos
            sectionInfo.subRegions = [
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
            sectionInfo.strValue = p.regionCache['Name'].strValue
            sectionTable.subRegions.push(sectionInfo)
            this.sections.push({name: (sectionInfo.strValue || ''), rva: p.num.VirtualAddress, size:p.num.VirtualSize, offset:p.num.PointerToRawData})

            if (p.num.PointerToRawData > 0) {
                const section = p.createRegion('G', p.num.PointerToRawData, p.num.SizeOfRawData, 'Section')
                section.strValue = sectionInfo.strValue
                sections.subRegions.push(section)
            }
        }

        return [sectionTable, sections]
    }

    parseOtherContent(p:parser.ParseHelper) {
        const parsers : {[id:string]: (p:parser.ParseHelper, offset:number, length:number, rva:number) => dom.Region} = {
            'ImportTable': this.parseImportTable,
            'ExportTable': this.parseExportTable,
            'TLSTable': this.parseTLSTable,
            'ResourceTable': this.parseResourceTable,
        }
        const content: dom.Region[] = []
        for (const dd of this.dataDirectories) {
            // find which section is the data in
            for (const s of this.sections) {
                if (dd.rva >= s.rva && dd.rva < s.rva + s.size) {
                    const offset = dd.rva - s.rva + s.offset
                    const size = dd.size
                    if (dd.name in parsers) {
                        const region = parsers[dd.name].call(this, p, offset, size, dd.rva)
                        content.push(region)
                    } else {
                        content.push(p.createRegion('G', offset, size, dd.name))
                    }
                    break
                }
            }
        }
        return content
    }

    parseExportTable(p:parser.ParseHelper, offset:number, length:number, rva:number) {
        const tbl = p.createRegion('C', offset, length, 'ExportTable')
        tbl.subRegions = []

        const edt = p.createRegion('C', offset, 40, 'ExportDirectoryTable')
        edt.subRegions = [
            p.createRegion('N', offset, 4, 'ExportFlags',  'Reserved, must be 0.'),
            p.createRegion('N', -1,     4, 'TimeDateStamp',  'The time and date that the export data was created.'),
            p.createRegion('N', -1,     2, 'MajorVersion',  'The major version number. The major and minor version numbers can be set by the user.'),
            p.createRegion('N', -1,     2, 'MinorVersion',  'The minor version number.'),
            p.createRegion('P', -1,     4, 'NameRVA',  'The address of the ASCII string that contains the name of the DLL. This address is relative to the image base.'),
            p.createRegion('N', -1,     4, 'OrdinalBase',  'The starting ordinal number for exports in this image. This field specifies the starting ordinal number for the export address table. It is usually set to 1.'),
            p.createRegion('L', -1,     4, 'AddressTableEntries',  'The number of entries in the export address table.'),
            p.createRegion('L', -1,     4, 'NumberOfNamePointers',  'The number of entries in the name pointer table. This is also the number of entries in the ordinal table.'),
            p.createRegion('P', -1,     4, 'ExportAddressTableRVA',  'The address of the export address table, relative to the image base.'),
            p.createRegion('P', -1,     4, 'NamePointerRVA',  'The address of the export name pointer table, relative to the image base. The table size is given by the Number of Name Pointers field.'),
            p.createRegion('P', -1,     4, 'OrdinalTableRVA',  'The address of the ordinal table, relative to the image base.'),
        ]
        p.regionCache.NameRVA.interpretedValue = util.parseNullTerminatedString(p.buffer, p.num.NameRVA - rva + offset)

        const eatAddr = p.num.ExportAddressTableRVA - rva + offset
        const eat = p.createRegion('C', eatAddr, p.num.AddressTableEntries * 4, 'ExportAddressTable')
        eat.subRegions = []
        for (let i = 0; i < p.num.AddressTableEntries; i++) {
            eat.subRegions.push(p.createRegion('P', eat.startPos + i * 4, 4, 'ExportRVA'))
        }

        const enptAddr = p.num.NamePointerRVA - rva + offset
        const enpt = p.createRegion('C', enptAddr, p.num.NumberOfNamePointers * 4, 'ExportNamePointerTable')
        enpt.subRegions = []
        for (let i = 0; i < p.num.NumberOfNamePointers; i++) {
            const np = p.createRegion('P', enpt.startPos + i * 4, 4, 'NamePointer')
            np.interpretedValue = util.parseNullTerminatedString(p.buffer, p.num.NamePointer - rva + offset)
            enpt.subRegions.push(np)
        }

        const ordinalAddr = p.num.OrdinalTableRVA - rva + offset
        const eot = p.createRegion('C', ordinalAddr, p.num.NumberOfNamePointers * 2, 'ExportOrdinalTable')
        eot.subRegions = []
        for (let i = 0; i < p.num.NumberOfNamePointers; i++) {
            const o = p.createRegion('N', eot.startPos + i * 2, 2, 'index')
            eot.subRegions.push(o)
        }

        const nt = p.createRegion('G', eot.endPos, tbl.endPos - eot.endPos, 'ExportNameTable')

        tbl.subRegions.push(edt, eat, enpt, eot, nt)
        return tbl
    }

    parseImportTable(p:parser.ParseHelper, offset:number, length:number, rva:number) {
        const section = p.createRegion('C', offset, length, 'ImportTable')
        section.subRegions = []
        section.description = "The import table is located at the rva specified in data directories in optional header. It is typically occupy the `.idata` section, but it's not always true."

        const idt = p.createRegion('C', offset, 0, 'ImportDirectoryTable')
        idt.subRegions = []
        const lookupTables = p.createRegion('C', idt.endPos, 0, 'ImportLookupTables')
        lookupTables.subRegions = []
        for (let i = 0; ; i++) {
            if (util.checkContent(p.buffer, offset + i * 20, new Array(20).fill(0))) {
                idt.endPos = offset + i * 20 + 20
                break
            }
            const idtEntry = p.createRegion('C', offset + i * 20, 20, 'ImportDirectoryEntry')
            idtEntry.subRegions = [
                p.createRegion('N', offset + i * 20, 4, 'ImportLookupTableRVA'),
                p.createRegion('N', -1, 4, 'TimeStamp'),
                p.createRegion('N', -1, 4, 'ForwarderChain'),
                p.createRegion('N', -1, 4, 'NameRVA'),
                p.createRegion('N', -1, 4, 'ImportAddressTableRVA')
            ]
            idtEntry.strValue = util.parseNullTerminatedString(p.buffer, p.num.NameRVA - rva + offset)
            idt.subRegions.push(idtEntry)

            const L = this.pe32Plus ? 8 : 4
            const lookupTableOffset = p.num.ImportAddressTableRVA - rva + offset
            const lookupTable = p.createRegion('C', lookupTableOffset, 0, 'ImportLookupTable')
            lookupTable.subRegions = []
            lookupTable.strValue = idtEntry.strValue
            let pos = lookupTableOffset
            for (let j = 0; ; j++) {
                if (util.checkContent(p.buffer, pos + j * L, new Array(L).fill(0))) {
                    lookupTable.endPos = pos + j * L + L
                    break
                }
                const lookupEntry = p.createRegion('N', pos + j * L, L, 'ImportLookupEntry')
                const entryRva = Number(lookupEntry.numValue) & 0x7fffffff
                lookupEntry.strValue = util.parseNullTerminatedString(p.buffer, entryRva - rva + offset + 2)
                lookupTable.subRegions.push(lookupEntry)
            }
            lookupTables.subRegions.push(lookupTable)
            lookupTables.endPos = lookupTable.endPos
        }

        const hintNameTable = p.createRegion('G', lookupTables.endPos, length - (lookupTables.endPos - offset), 'HintNameTable')

        section.subRegions.push(idt, lookupTables, hintNameTable)
        return section
    }

    parseTLSTable(p:parser.ParseHelper, offset:number, length: number, rva: number) {
        const tls = p.createRegion('C', offset, length, 'TLSTable')
        const L = this.pe32Plus? 8 : 4
        tls.subRegions = [
            p.createRegion('P', offset, L, 'RawDataStartVA', 'The starting address of the TLS template. The template is a block of data that is used to initialize TLS data. The system copies all of this data each time a thread is created, so it must not be corrupted. Note that this address is not an RVA; it is an address for which there should be a base relocation in the .reloc section.'),
            p.createRegion('P', -1,     L, 'RawDataEndVA', 'The address of the last byte of the TLS, except for the zero fill. As with the Raw Data Start VA field, this is a VA, not an RVA.'),
            p.createRegion('P', -1,     L, 'AddressOfIndex', 'The location to receive the TLS index, which the loader assigns. This location is in an ordinary data section, so it can be given a symbolic name that is accessible to the program.'),
            p.createRegion('P', -1,     L, 'AddressOfCallbacks', 'The pointer to an array of TLS callback functions. The array is null-terminated, so if no callback function is supported, this field points to 4 bytes set to zero. For information about the prototype for these functions, see section 6.7.2, “TLS Callback Functions.”'),
            p.createRegion('L', -1,     4, 'SizeOfZeroFill', 'The size in bytes of the template, beyond the initialized data delimited by the Raw Data Start VA and Raw Data End VA fields. The total template size should be the same as the total size of TLS data in the image file. The zero fill is the amount of data that comes after the initialized nonzero data.'),
            p.createRegion('N', -1,     4, 'Characteristics', 'The four bits [23:20] describe alignment info.  Possible values are those defined as IMAGE_SCN_ALIGN_*, which are also used to describe alignment of section in object files.  The other 28 bits are reserved for future use.            '),
        ]
        return tls
    }

    parseResourceTable(p:parser.ParseHelper, offset:number, length:number, rva:number) {
        const globalOffset = offset
        const globalRva = rva
        function parseResourceDirectory(offset:number, rva: number, level: number) {
            const ret: dom.Region[] = []
            const rd = p.createRegion('C', offset, 0, 'ResourceDirectory')
            rd.subRegions = [
                p.createRegion('N', -1, 4, 'Characteristics', 'Resource flags. This field is reserved for future use. It is currently set to zero.'),
                p.createRegion('N', -1, 4, 'TimeStamp', 'The time that the resource data was created by the resource compiler.'),
                p.createRegion('N', -1, 2, 'MajorVersion', 'The major version number, set by the user.'),
                p.createRegion('N', -1, 2, 'MinorVersion', 'The minor version number, set by the user.'),
                p.createRegion('L', -1, 2, 'NumberOfNameEntries', 'The number of directory entries immediately following the table that use strings to identify Type, Name, or Language entries (depending on the level of the table).'),
                p.createRegion('L', -1, 2, 'NumberOfIDEntries', 'The number of directory entries immediately following the Name entries that use numeric IDs for Type, Name, or Language entries.'),
            ]
            rd.endPos = p.position
            ret.push(rd)

            const nn = p.num.NumberOfNameEntries
            const ni = p.num.NumberOfIDEntries
            const entries = p.createRegion('C', rd.endPos, rd.endPos + (nn + ni) * 8, 'Entries')
            entries.subRegions = []
            ret.push(entries)
            for (let i = 0; i < nn + ni; i++) {
                const entry = p.createRegion('C', rd.endPos + i * 8, 8, 'Entry')
                entries.subRegions.push(entry)
                entry.subRegions = []

                if (i < nn) {
                    const nameRVA = p.createRegion('P', entry.startPos, 4, 'NameRVA', 'The address of a string that gives the Type, Name, or Language ID entry, depending on level of table.')
                    nameRVA.interpretedValue = util.parseLengthPrefixedString(p.buffer, (p.num.NameRVA & 0x7FFFFFFF) - rva + offset, 2, false, 'utf-16le', 2)
                    entry.subRegions.push(nameRVA)
                } else {
                    const idRVA = p.createRegion('N', entry.startPos, 4, 'IntegerID', 'A 32-bit integer that identifies the Type, Name, or Language ID entry.')
                    if (level === 1) {
                        // https://docs.microsoft.com/en-us/windows/win32/menurc/resource-types
                        const resourceIdMap: {[id:number]:string} = {
                            1: 'Cursor',        2: 'Bitmap',       3: 'Icon',      4: 'Menu',          5: 'Dialog',
                            6: 'String',        7: 'FontDir',      8: 'Font',      9:  'Accelerator', 10: 'RCData',
                            11:'MessageTable', 12: 'GroupCursor', 14: 'GroupIcon', 16: 'Version',     17: 'DlgInclude',
                            19:'PlugPlay',     20: 'VxD',         21: 'AniCursor', 22: 'AniIcon',     23: 'HTML',        24: 'Manifest',
                        }
                        idRVA.interpretedValue = resourceIdMap[Number(idRVA.numValue)]
                        idRVA.description += '\nFor `Type` ID: ' + JSON.stringify(resourceIdMap, null, 2)
                    }
                    entry.subRegions.push(idRVA)
                }
                const entryRVA = p.createRegion('P', entry.startPos + 4, 4, '', 'High bit 0. Address of a Resource Data entry (a leaf). High bit 1. The lower 31 bits are the address of another resource directory table (the next level down).')
                const rvaNumber = Number(entryRVA.numValue) & 0x7FFFFFFF
                const leaf = (Number(entryRVA.numValue) & 0x80000000) == 0
                entryRVA.ID = leaf? 'DataEntryRVA' : 'SubdirectoryRVA'
                entry.subRegions.push(entryRVA)

                if (level === 1) {
                    entry.interpretedValue = 'type = ' + entry.subRegions[0].interpretedValue
                } else if (level === 2) {
                    entry.interpretedValue = 'ID = ' + entry.subRegions[0].numValue
                } else if (level === 3) {
                    entry.interpretedValue = 'language = ' + entry.subRegions[0].numValue
                }

                if (leaf) {
                    const deOffset = rvaNumber - rva + offset
                    const rde = p.createRegion('C', deOffset, 16, 'ResourceDataEntry')
                    rde.subRegions = [
                        p.createRegion('P', deOffset, 4, 'DataRVA', 'The address of a unit of resource data in the Resource Data area.'),
                        p.createRegion('L', -1,       4, 'Size', 'The size, in bytes, of the resource data that is pointed to by the Data RVA field.'),
                        p.createRegion('N', -1,       4, 'Codepage', 'The code page that is used to decode code point values within the resource data. Typically, the code page would be the Unicode code page.'),
                        p.createRegion('N', -1,       4, 'Reserved', 'must be 0.'),
                    ]
                    const content = p.createRegion('G', p.num.DataRVA - globalRva + globalOffset, p.num.Size, 'ResourceData')
                    rde.subRegions.push(content)
                    entry.subRegions.push(rde)
                } else {
                    const subRDs = parseResourceDirectory(rvaNumber - rva + offset, rvaNumber, level + 1)
                    entry.subRegions.push(...subRDs)
                }
            }

            return ret
        }

        const rt = p.createRegion('C', offset, length, 'ResourceTable')
        rt.subRegions = [...parseResourceDirectory(offset, 0, 1)]
        return rt
    }

    parseCOFFHeader(p: parser.ParseHelper, offset: number) {
        const coff = p.createRegion('C', offset, 20, 'COFFHeader')
        coff.subRegions = [
            p.createRegion('N', offset, 2, 'Machine', 'The number that identifies the type of target machine. '),
            p.createRegion('L', -1,     2, 'NumberOfSections'),
            p.createRegion('N', -1,     4, 'TimeDateStamp', 'The low 32 bits of the number of seconds since 00:00 January 1, 1970 (a C run-time time_t value), that indicates when the file was created.'),
            p.createRegion('P', -1,     4, 'PointerToSymbolTable', 'The file offset of the COFF symbol table, or zero if no COFF symbol table is present. This value should be zero for an image because COFF debugging information is deprecated.'),
            p.createRegion('L', -1,     4, 'NumberOfSymbols', 'The number of entries in the symbol table. This data can be used to locate the string table, which immediately follows the symbol table. This value should be zero for an image because COFF debugging information is deprecated.'),
            p.createRegion('L', -1,     2, 'SizeOfOptionalHeader', 'The size of the optional header, which is required for executable files but not for object files. This value should be zero for an object file. For a description of the header format, see section 3.4, “Optional Header (Image Only).”'),
            p.createRegion('N', -1,     2, 'Characteristics', 'The flags that indicate the attributes of the file. For specific flag values, see section 3.3.2, “Characteristics.”'),
        ]
        coff.subRegions[0].interpretedValue = this.machineMap[Number(coff.subRegions[0].numValue)]
        coff.subRegions[0].description += JSON.stringify(this.machineMap, null, 2)
        return coff
    }

    parseOptionalHeader(p: parser.ParseHelper, offset: number, length: number) {
        const coff = p.createRegion('C', offset, length, 'OptionalHeader')
        const magic = Number(util.parseValue(p.buffer, offset, offset + 2, false, false))
        this.pe32Plus = magic === 0x20b

        // for some fields their length varies between PE32 and PE32+, we use L to ref it
        // (PE32+ has the same EXE file size limit 4GB, these 8 bytes numbers are actually refer to values when the image is loaded into memory)
        const L = this.pe32Plus? 8 : 4 
        coff.subRegions = [
            p.createRegion('N', offset, 2, 'Magic'),
            p.createRegion('N', -1,     1, 'MajorLinkerVersion'),
            p.createRegion('N', -1,     1, 'MinorLinkerVersion'),
            p.createRegion('L', -1,     4, 'SizeOfCode'),
            p.createRegion('L', -1,     4, 'SizeOfInitializedData'),
            p.createRegion('L', -1,     4, 'SizeOfUninitializedData'),
            p.createRegion('P', -1,     4, 'AddressOfEntryPoint'),
            p.createRegion('N', -1,     4, 'BaseOfCode'),
            p.createRegion('N', -1,     this.pe32Plus? 0: 4, 'BaseOfData'),

            p.createRegion('N', -1,     L, 'ImageBase', 'The preferred address of the first byte of image when loaded into memory; must be a multiple of 64 K. The default for DLLs is 0x10000000. The default for Windows CE EXEs is 0x00010000. The default for Windows NT, Windows 2000, Windows XP, Windows 95, Windows 98, and Windows Me is 0x00400000.'),
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
            p.createRegion('N', -1,     L, 'SizeOfStackReserve', 'The size of the stack to reserve. Only SizeOfStackCommit is committed; the rest is made available one page at a time until the reserve size is reached.'),
            p.createRegion('N', -1,     L, 'SizeOfStackCommit', 'The size of the stack to commit.'),
            p.createRegion('N', -1,     L, 'SizeOfHeapReserve', 'The size of the local heap space to reserve. Only SizeOfHeapCommit is committed; the rest is made available one page at a time until the reserve size is reached.'),
            p.createRegion('N', -1,     L, 'SizeOfHeapCommit', 'The size of the local heap space to commit.'),
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
            if (p.num.size !== 0) {
                this.dataDirectories.push({name: ddNames[i][0], rva: p.num.address, size:p.num.size})
            }
        }

        return dds
    }
}
