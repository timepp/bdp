
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
export function rgbToHsl (r:number, g:number, b:number) {
  r = r / 255
  g = g / 255
  b = b / 255

  const max = Math.max(r, g, b); const min = Math.min(r, g, b)
  let h = 0; let s; const l = (max + min) / 2

  if (max === min) {
    h = s = 0 // achromatic
  } else {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break
      case g: h = (b - r) / d + 2; break
      case b: h = (r - g) / d + 4; break
    }

    h /= 6
  }

  return [h, s, l]
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
export function hslToRgb (h:number, s:number, l:number): [number, number, number] {
  let r, g, b

  if (s === 0) {
    r = g = b = l // achromatic
  } else {
    function hue2rgb (p:number, q:number, t:number) {
      if (t < 0) t += 1
      if (t > 1) t -= 1
      if (t < 1 / 6) return p + (q - p) * 6 * t
      if (t < 1 / 2) return q
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
      return p
    }

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q

    r = hue2rgb(p, q, h + 1 / 3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1 / 3)
  }

  return [r * 255, g * 255, b * 255]
}

export function colorCode (r:number, g:number, b:number) {
  return `rgb(${r}, ${g}, ${b})`
}

export function createHtmlElement (tag: string, text: string) {
  const e = document.createElement(tag)
  e.textContent = text
  return e
}

export function createElementWithClass (tag: string, c: string) {
  const e = document.createElement(tag)
  e.classList.add(c)
  return e
}

export function insertAfter (e1: Element, e2: Element) {
  e1.parentElement?.insertBefore(e2, e1.nextElementSibling)
}

export function createModel (autoDismiss = true) {
  const layer = document.createElement('div')
  layer.style.position = 'fixed'
  layer.style.zIndex = '1'
  layer.style.left = '0'
  layer.style.top = '0'
  layer.style.width = '100%'
  layer.style.height = '100%'
  layer.style.overflow = 'auto'
  layer.style.backgroundColor = 'rgba(0,0,0,0.4)'
  layer.tabIndex = 0

  if (autoDismiss) {
    layer.onclick = function (e: MouseEvent) {
      const t = e.target
      if (t === layer) {
        layer.remove()
      }
    }
    layer.onkeyup = e => {
      if (e.key === 'Escape') {
        layer.remove()
      }
    }
  }

  const content = document.createElement('div')
  content.style.backgroundColor = '#fefefe'
  content.style.marginLeft = 'auto'
  content.style.marginRight = 'auto'
  content.style.marginTop = '50px'
  content.style.border = '1px solid #888'
  content.style.display = 'table'

  layer.appendChild(content)
  return { layer, content }
}

export function appendButton (e: Element, text: string, handler: ()=>void) {
  const btn = document.createElement('button')
  btn.textContent = text
  btn.onclick = handler
  e.appendChild(btn)
  return btn
}

export function createTable (classes: string, headings: string[]) {
  const table = document.createElement('table')
  table.classList.add(...classes.split(' '))
  const thead = document.createElement('thead')
  const tr = document.createElement('tr')
  headings.forEach(v => tr.appendChild(createHtmlElement('th', v)))
  thead.appendChild(tr)
  const tbody = document.createElement('tbody')
  table.appendChild(thead)
  table.appendChild(tbody)
  return { table, tbody }
}
