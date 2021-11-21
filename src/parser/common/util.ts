export function ensureLength(buf: ArrayBuffer, len: number, start: number = 0) {
    if (buf.byteLength < start + len) throw Error('invalid ico file')
}

export function checkContent(buf: ArrayBuffer, start: number, data: number[]) {
    const arr1 = new Uint8Array(data)
    const arr2 = new Uint8Array(buf, start, data.length)
    for (let i = 0; i < data.length; i++) {
        if (arr1[i] !== arr2[i]) {
            return false
        }
    }
    return true
}

export function ensureContent(buf: ArrayBuffer, start: number, data: number[]) {
    if (!checkContent(buf, start, data)) {
        throw Error('fixed content mismatch')
    }
}

export function searchPattern(buf: ArrayBuffer, pattern: number[], forward: boolean): number {
    const arr = new Uint8Array(buf)
    if (forward) {
        for (let i = 0; i <= arr.length - pattern.length; i++) {
            let match = true
            for (let j = 0; j < pattern.length; j++) {
                if (arr[i + j] !== pattern[j]) {
                    match = false
                }
            }
            if (match) return i
        }
    } else {
        for (let i = arr.length - pattern.length; i >= 0; i--) {
            let match = true
            for (let j = 0; j < pattern.length; j++) {
                if (arr[i + j] !== pattern[j]) {
                    match = false
                }
            }
            if (match) return i
        }
    }

    return -1
}

export function parseNullTerminatedString(buf: ArrayBuffer, start: number) {
    const arr = new Uint8Array(buf)
    for (let i = start; ; i++) {
        if (arr[i] === 0) {
            const decoder = new TextDecoder()
            return decoder.decode(buf.slice(start, i))
        }
    }
    return ''
}

export function parseLengthPrefixedString(buf: ArrayBuffer, offset:number, lengthPrefixLength:number, lengthPrefixBigEndian: boolean, encoding: string, byteScale:number) {
    const len = Number(parseValue(buf, offset, offset + lengthPrefixLength, lengthPrefixBigEndian, false))
    return parseFixedLengthString(buf, offset + lengthPrefixLength, len * byteScale, encoding)
}

export function parseFixedLengthString(buf: ArrayBuffer, offset: number, len: number, encoding: string) {
    const decoder = new TextDecoder(encoding)
    return decoder.decode(buf.slice(offset, offset + len))
}

export function trimNull(s:string) {
    let i = s.length - 1
    while (i >= 0) {
        if (s.charCodeAt(i) !== 0) break
        i--
    }
    return s.slice(0, i + 1)
}

export function parseValue(buf: ArrayBuffer, start: number, end: number, isBigEndian: boolean, isSigned: boolean) : bigint {
    const l = end - start
    const s = isBigEndian? start : end - 1
    const e = isBigEndian? end : start - 1
    const d = isBigEndian? 1 : -1
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

