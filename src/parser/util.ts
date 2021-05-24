export function ensureLength(buf: ArrayBuffer, len: number, start: number = 0) {
    if (buf.byteLength < start + len) throw Error('invalid ico file')
}

export function ensureContent(buf: ArrayBuffer, start: number, data: number[]) {
    const arr1 = new Uint8Array(data)
    const arr2 = new Uint8Array(buf, start, data.length)
    for (let i = 0; i < data.length; i++) {
        if (arr1[i] !== arr2[i]) {
            throw Error('fixed content mismatch')
        }
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
