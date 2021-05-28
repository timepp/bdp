// A "binary file parse result" is a list of regions (can be overlap), each has the format like below

export type RegionType = 
      'N'  // general unsigned number
    | 'n'  // general signed number
    | 'P'  // unsigned number represents pointer/offset
    | 'L'  // unsigned number represents length/size
    | 'S'  // general string
    | 's'  // (possibly) null-terminated string
    | 'G'  // general non-typed data
    | 'C'  // compound

export enum Endian { BE, LE }

export type Region = {
    // general properties
    ID: string,
    type: RegionType,
    description: string,
    startPos: number,
    endPos: number,

    // values
    endian?: Endian,
    numValue?: bigint,
    strValue?: string,
    interpretedValue?: string,

    // for compound region, this may be sparse to save memory, in such case the followed function object can be used to fetch value
    subRegions?: Region[]
    subRegionFetcher?: (index: number) => Region
}

export type FileDOM = {
    buffer: ArrayBuffer,
    regions: Region[]
}
