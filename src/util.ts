export function setValue<K> (value: K, obj: any, ...keys: string[]) {
  if (obj) {
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i]
      if (i === keys.length - 1) {
        obj[k] = value
        return
      }

      if (!(k in obj)) {
        obj[k] = {}
      }
      obj = obj[k]
    }
  }
}
