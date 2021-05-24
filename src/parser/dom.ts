// A binary file parse result to a list of pieces of regions (can be overlap), each has the format like below

export type RegionType = 'N' | 'n' | 'S' | 'G' | 'C'

export enum Endian { BE, LE }

export type Region = {
    // general properties
    ID: string,
    type: RegionType,
    description: string,
    startPos: number,
    endPos: number,

    // for region represents numbers
    endian?: Endian,
    numValue?: bigint,
    strValue?: string,

    // for compound region, this may be sparse to save memory, in such case the followed function object can be used to fetch value
    subRegions?: Region[]
    subRegionFetcher?: (index: number) => Region
}

export type FileDOM = {
    buffer: ArrayBuffer,
    regions: Region[]
}
