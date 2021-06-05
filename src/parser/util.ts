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
/**
 * Converts an RGB color value to HSL. Conversion formula
 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
 * Assumes r, g, and b are contained in the set [0, 255] and
 * returns h, s, and l in the set [0, 1].
 *
 * @param   Number  r       The red color value
 * @param   Number  g       The green color value
 * @param   Number  b       The blue color value
 * @return  Array           The HSL representation
 */
 export function rgbToHsl(r:number, g:number, b:number) {
    r /= 255, g /= 255, b /= 255;
  
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h = 0, s, l = (max + min) / 2;
  
    if (max == min) {
      h = s = 0; // achromatic
    } else {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
  
      h /= 6;
    }
  
    return [ h, s, l ];
  }
  
  /**
   * Converts an HSL color value to RGB. Conversion formula
   * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
   * Assumes h, s, and l are contained in the set [0, 1] and
   * returns r, g, and b in the set [0, 255].
   *
   * @param   Number  h       The hue
   * @param   Number  s       The saturation
   * @param   Number  l       The lightness
   * @return  Array           The RGB representation
   */
export function hslToRgb(h:number, s:number, l:number): [number, number, number] {
    var r, g, b;
  
    if (s == 0) {
      r = g = b = l; // achromatic
    } else {
      function hue2rgb(p:number, q:number, t:number) {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      }
  
      var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      var p = 2 * l - q;
  
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
  
    return [ r * 255, g * 255, b * 255 ];
  }