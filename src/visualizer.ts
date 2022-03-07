import * as util from './uiutil.js'
import { Region, RegionType, FileDOM } from './parser/parser.js'
import { off } from 'process'

type Highlight = {
    color: [number, number, number],
    title: string,
    start: number,
    end: number
}

interface RegionRow extends HTMLTableRowElement {
    region: Region,
    childRows: RegionRow[],
    parentRow?: RegionRow
    expand: boolean,
    depth: number,
    // the following 2 property are for grouping rows
    groupingRow: boolean
    indexStart: number,
    indexEnd: number
}

interface RegionButton extends HTMLImageElement {
  row: RegionRow
}

interface DataSpan extends HTMLSpanElement {
  offset: number
}

export class Visualizer {
  container: Element
  dom: FileDOM
  offsets: HTMLSpanElement[] = []
  byteCells: HTMLSpanElement[][] = []
  texts: HTMLSpanElement[][] = []
  positionElement: HTMLSpanElement
  desc: HTMLElement
  columns: number = 16
  rows: number = 16
  offset: number = 0
  sel: number = -1
  highlights: Highlight[] = []
  currentRow?: RegionRow

  constructor (e: Element, d: FileDOM) {
    this.container = e
    this.dom = d
    this.positionElement = document.createElement('span')
    this.positionElement.className = 'position'
    this.desc = document.createElement('div')
  }

  visualize () {
    this.container.innerHTML = ''
    const ui = document.createElement('div')
    this.container.appendChild(ui)
    ui.className = 'main_ui'

    const divTree = document.createElement('div')
    ui.appendChild(divTree)
    divTree.classList.add('tree')
    const tdView = document.createElement('div')
    ui.appendChild(tdView)
    tdView.classList.add('view')

    this.desc.classList.add('description')

    this.createNavigateButtons(tdView)

    this.createDataView(tdView, this.columns, this.rows)
    tdView.appendChild(this.desc)

    this.gotoOffset(0)

    divTree.style.height = tdView.offsetHeight - 10 + 'px'
    this.createTree(divTree, this.dom.regions)
  }

  createNavigateButtons (parent: Element) {
    let btn
    const self = this
    const pageSize = this.columns * this.rows
    const maxPage = Math.ceil(this.dom.buffer.byteLength / pageSize) - 1
    const dataLen = this.dom.buffer.byteLength

    const contentToolbar = document.createElement('div')
    contentToolbar.id = 'content_toolbar'
    contentToolbar.style.display = 'flex'
    contentToolbar.style.justifyContent = 'space-between'
    parent.appendChild(contentToolbar)

    let group = document.createElement('span')
    group.className = 'btn-group'

    btn = this.createBtn('首页', '', () => self.gotoOffset(0))
    group.appendChild(btn)

    btn = this.createBtn('上一页', '', () => self.gotoOffset(Math.max(self.offset - pageSize, 0)))
    group.appendChild(btn)

    btn = this.createBtn('下一页', '', () => self.gotoOffset(Math.min(self.offset + pageSize, maxPage * pageSize)))
    group.appendChild(btn)

    btn = this.createBtn('尾页', '', () => self.gotoOffset(maxPage * pageSize))
    group.appendChild(btn)

    contentToolbar.appendChild(group)

    contentToolbar.appendChild(this.positionElement)

    group = document.createElement('span')
    group.className = 'btn-group'

    btn = this.createBtn('转到页', 'btn btn-outline-primary', function () {
      const v = prompt('转到哪一页?')
      if (v === null) return
      let n = parseInt(v)
      if (n < 0) n = 0
      if (n > maxPage) n = maxPage
      self.gotoOffset(n * pageSize)
    })
    group.appendChild(btn)

    btn = this.createBtn('转到位置', 'btn btn-outline-primary', function () {
      const v = prompt('输入位置, 例如: 33949, 0x1000, 50%')
      if (v === null) return
      let x = parseInt(v)
      if (v.endsWith('%')) {
        x = dataLen * x / 100
      }

      let n = Math.ceil(x / pageSize) - 1
      if (n < 0) n = 0
      if (n > maxPage) n = maxPage
      self.gotoOffset(n * pageSize)
    })
    group.appendChild(btn)
    contentToolbar.appendChild(group)
  }

  createTree (parent: Element, d: Region[]) {
    const t = document.createElement('table')
    t.className = 'tree'
    const thead = document.createElement('thead')
    const tr = document.createElement('tr')
    tr.append(util.createHtmlElement('th', 'name'))
    tr.append(util.createHtmlElement('th', 'length'))
    tr.append(util.createHtmlElement('th', 'value'))
    thead.appendChild(tr)
    t.appendChild(thead)
    const tb = document.createElement('tbody')
    t.append(tb)
    parent.appendChild(t)

    for (const r of d) {
      tb.append(this.createRegionRow(r, 0))
    }
  }

  createBtn (text: string, c: string, onclick: ()=>void) {
    const btn = document.createElement('button')
    btn.textContent = text
    if (c !== '') {
      btn.classList.add(...c.split(' '))
    }
    btn.onclick = onclick
    return btn
  }

  getRegionDisplayText (r: Region) {
    let text = ''
    if (r.numValue !== undefined) {
      text += `0x${r.numValue.toString(16)} (${r.numValue})`
    }
    if (r.strValue !== undefined) {
      text += r.strValue
    }
    return text
  }

  matchFlag (n: bigint, index: number, value: number | number[]) {
    const v = [value].flat()
    for (let j = 0; j < v.length; j++) {
      if (((n >> BigInt(index - j)) & 1n) !== BigInt(v[j])) return false
    }
    return true
  }

  createRegionDisplay (r: Region) {
    const div = util.createElementWithClass('div', 'region_display')
    const val = util.createElementWithClass('span', 'primary_value')
    const desc = util.createElementWithClass('span', 'secondary_value')
    const getValueDefinition = () => {
      if (r.valueDefinition === undefined) return undefined
      const ind = r.numValue === undefined ? (r.strValue === undefined ? '' : r.strValue) : `${r.numValue}`
      return r.valueDefinition[ind]
    }

    let primaryValue: string | bigint | undefined
    let secondaryValue = ''
    if (r.type === RegionType.Compound || r.type === RegionType.General || r.type === RegionType.String) {
      primaryValue = r.strValue || ''
    } else if (r.type === RegionType.Number) {
      primaryValue = r.numValue
      secondaryValue = getValueDefinition() || `0x${r.numValue?.toString(16)}`
    } else if (r.type === RegionType.Time) {
      primaryValue = r.numValue
      secondaryValue = new Date(Number(r.numValue) * 1000).toLocaleString()
    } else if (r.type === RegionType.Offset) {
      primaryValue = `0x${r.numValue?.toString(16)}`
      secondaryValue = `${r.numValue}`
    } else if (r.type === RegionType.Size) {
      primaryValue = `${r.numValue}`
      secondaryValue = `0x${r.numValue?.toString(16)}`
    } else if (r.type === RegionType.Flag) {
      primaryValue = `0x${r.numValue?.toString(16)}`
      if (r.flagDefinition) {
        const vals = []
        for (const f of r.flagDefinition) {
          const [index, val, id] = f
          if (this.matchFlag(r.numValue || 0n, index, val)) {
            vals.push(id)
          }
        }
        secondaryValue = vals.join(' | ')
      }
    }

    val.textContent = `${primaryValue}`
    desc.textContent = secondaryValue
    div.appendChild(val)
    div.appendChild(desc)
    return div
  }

  updateDesc (r: Region) {
    this.desc.innerHTML = ''
    const d = document.createElement('div')
    d.appendChild(document.createTextNode(r.description))
    this.desc.appendChild(d)
    if (r.valueDefinition) {
      const tbl = util.createTable('value_def', ['value', 'hex', 'meaning'])
      for (const k in r.valueDefinition) {
        const tr = document.createElement('tr')
        tr.appendChild(util.createHtmlElement('td', k))
        tr.appendChild(util.createHtmlElement('td', '0x' + parseInt(k).toString(16)))
        tr.appendChild(util.createHtmlElement('td', r.valueDefinition[k]))
        tbl.tbody.appendChild(tr)
      }
      this.desc.appendChild(tbl.table)
    }
    if (r.flagDefinition) {
      const def = [...r.flagDefinition]
      def.sort((a, b) => a[0] - b[0])
      const tbl = util.createTable('flag_def value_def', ['start bit', 'values', 'name', 'meaning'])
      for (const f of def) {
        const tr = document.createElement('tr')
        tr.appendChild(util.createHtmlElement('td', f[0].toString()))
        tr.appendChild(util.createHtmlElement('td', [f[1]].flat().join(',')))
        tr.appendChild(util.createHtmlElement('td', f[2]))
        tr.appendChild(util.createHtmlElement('td', f[3]))
        tbl.tbody.appendChild(tr)
      }
      this.desc.appendChild(tbl.table)
    }
  }

  onRowSelect (row: RegionRow) {
    if (this.currentRow) {
      this.currentRow.classList.remove('select')
      this.delRegionRowStyle(this.currentRow, 'cover')
    }
    this.currentRow = row
    this.currentRow.classList.add('select')
    this.addRegionRowStyle(this.currentRow, 'cover')

    const r = row.region
    this.highlights = []
    if (r.subRegions) {
      for (const subR of r.subRegions) {
        if (subR !== undefined) {
          this.highlights.push({ color: this.getColorForDataType(subR.type), start: subR.startPos, end: subR.endPos, title: this.getRegionDisplayText(subR) })
        }
      }
    }
    this.highlights.push({ color: this.getColorForDataType(r.type), start: r.startPos, end: r.endPos, title: this.getRegionDisplayText(r) })

    // also highlight parent region if it's a leaf
    if (!r.subRegions && !r.subRegionFetcher) {
      const pr = row.parentRow?.region
      if (pr) {
        this.highlights.push({ color: [240, 240, 240], start: pr.startPos, end: pr.endPos, title: this.getRegionDisplayText(pr) })
      }
    }

    this.gotoPage(this.getPage(r.startPos))
    this.updateDesc(r)
  }

  onTreeBtnClick (btn: RegionButton) {
    const row = btn.row
    let childRows = row.childRows
    const r = row.region
    if (!row.expand) {
      btn.src = 'images/expand.png'
      const depth = row.depth
      if (childRows === undefined && r.subRegions) {
        childRows = []
        // if there are so many rows to create (e.g. when a zip file contain too many entries), it will hurt performance
        // so we create `grouping row` here, to split entries by groups, to make sure <= 100 rows will be created
        const indexStart = row.groupingRow ? row.indexStart : 0
        const indexEnd = row.groupingRow ? row.indexEnd : r.subRegions.length
        const count = indexEnd - indexStart
        const groupSize = count > 1000000 ? 1000000 : (count > 10000 ? 10000 : (count > 100 ? 100 : 1))
        if (groupSize > 1) {
          for (let i = indexStart; i < indexEnd; i += groupSize) {
            childRows.push(this.createRegionRow(r, depth + 1, true, i, Math.min(indexEnd, i + groupSize)))
          }
        } else {
          // no need to group
          for (let i = indexStart; i < indexEnd; i++) {
            let region = r.subRegions[i]
            if (region === undefined && r.subRegionFetcher) {
              region = r.subRegionFetcher(i)
              r.subRegions[i] = region
            }
            childRows.push(this.createRegionRow(region, depth + 1))
          }
        }

        row.childRows = childRows
        childRows.forEach(r => { r.parentRow = row })

        for (const childRow of childRows.reverse()) util.insertAfter(row, childRow)
        if (this.currentRow) {
          this.addRegionRowStyle(this.currentRow, 'cover')
        }
      }
      row.expand = true
      this.showRegionRowsRecursive(row)
    } else {
      btn.src = 'images/collapse.png'
      row.expand = false
      this.hideRegionRowsRecursive(row)
    }
  }

  ensureRegionRowVisible (row: RegionRow) {
    while (true) {
      row.style.display = ''
      if (row.parentRow) {
        row = row.parentRow
      } else {
        break
      }
    }
  }

  showRegionRowsRecursive (row: RegionRow) {
    for (const r of row.childRows) {
      r.style.display = ''
      if (r.expand) this.showRegionRowsRecursive(r)
    }
  }

  hideRegionRowsRecursive (row: RegionRow) {
    for (const r of row.childRows) {
      r.style.display = 'none'
      if (r.expand) this.hideRegionRowsRecursive(r)
    }
  }

  addRegionRowStyle (row: RegionRow, c: string) {
    if (row.childRows) {
      for (const r of row.childRows) {
        r.classList.add(c)
        this.addRegionRowStyle(r, c)
      }
    }
  }

  delRegionRowStyle (row: RegionRow, c: string) {
    if (row.childRows) {
      for (const r of row.childRows) {
        r.classList.remove(c)
        this.delRegionRowStyle(r, c)
      }
    }
  }

  createRegionRow (r: Region, depth: number, groupingRow = false, indexStart = 0, indexEnd = 0) {
    const row = document.createElement('tr') as RegionRow
    const tdID = document.createElement('td')
    tdID.style.paddingLeft = `${depth * 20}px`
    if (r.subRegions !== undefined) {
      const btn = document.createElement('img') as RegionButton
      btn.src = 'images/collapse.png'
      btn.onclick = e => {
        if (e.currentTarget) this.onTreeBtnClick(e.currentTarget as RegionButton)
        e.stopPropagation()
      }
      btn.row = row
      tdID.append(btn)
      tdID.style.display = 'flex'
      tdID.style.alignItems = 'center'
    }

    if (groupingRow) {
      tdID.append(`[${indexStart}..${indexEnd}]`)
      row.append(tdID)
      row.append(util.createHtmlElement('td', ''))
      row.append(util.createHtmlElement('td', ''))
    } else {
      tdID.append(r.ID)
      row.append(tdID)
      row.append(util.createHtmlElement('td', `${r.endPos - r.startPos}`))
      const td = document.createElement('td')
      td.appendChild(this.createRegionDisplay(r))
      row.append(td)
    }

    row.region = r
    row.depth = depth
    row.expand = false
    row.groupingRow = groupingRow
    row.indexStart = indexStart
    row.indexEnd = indexEnd
    row.onclick = e => this.onRowSelect(e.currentTarget as RegionRow)

    return row
  }

  onByteClick (e: DataSpan) {
    console.log(e.offset)
    this.highlightCells(e.offset === this.sel ? -1 : e.offset)
    this.syncTree(this.offset + e.offset)
  }

  highlightCells (offset: number) {
    if (this.sel >= 0) {
      const oldCells = this.getCells(this.sel)
      oldCells[0].classList.remove('sel')
      oldCells[1].classList.remove('sel')
    }

    this.sel = offset
    if (this.sel >= 0) {
      const cells = this.getCells(this.sel)
      cells[0].classList.add('sel')
      cells[1].classList.add('sel')
    }
  }

  getCells (offset: number) {
    const row = Math.floor(offset / this.columns)
    const col = offset % this.columns
    return [this.byteCells[row][col], this.texts[row][col]]
  }

  createDataView (parent: Element, columns: number, rows: number) {
    const v = document.createElement('div')
    v.classList.add('data_view')
    parent.appendChild(v)

    const divO = document.createElement('div')
    divO.classList.add('offset_wrapper')
    for (let i = 0; i < rows; i++) {
      const span = document.createElement('span')
      span.style.display = 'block'
      divO.appendChild(span)
      this.offsets.push(span)
    }

    const divD = document.createElement('div')
    divD.classList.add('hex')
    for (let i = 0; i < rows; i++) {
      const l = document.createElement('div')
      divD.appendChild(l)

      const byteRow: HTMLSpanElement[] = []
      this.byteCells.push(byteRow)
      for (let j = 0; j < columns; j++) {
        const b = document.createElement('span') as DataSpan
        b.offset = i * columns + j
        b.classList.add('byte_hex')
        b.onclick = e => this.onByteClick(e.currentTarget as DataSpan)
        l.appendChild(b)
        byteRow.push(b)
      }
    }

    const divT = document.createElement('div')
    divT.classList.add('text')
    for (let i = 0; i < rows; i++) {
      const l = document.createElement('div')
      divT.appendChild(l)

      const textRow: HTMLSpanElement[] = []
      this.texts.push(textRow)
      for (let j = 0; j < columns; j++) {
        const t = document.createElement('span') as DataSpan
        t.offset = i * columns + j
        t.classList.add('byte_text')
        t.onclick = e => this.onByteClick(e.currentTarget as DataSpan)
        l.appendChild(t)
        textRow.push(t)
      }
    }

    v.append(divO, divD, divT)
  }

  syncTree (offset: number) {
    const row = this.findRegion(offset)
    if (row !== null) {
      this.ensureRegionRowVisible(row)
      this.onRowSelect(row)
    }
  }

  findRegion (offset: number) {
    const tbody = this.container.querySelector('tbody')
    if (tbody === null) {
      return null
    }

    for (const e of tbody.children) {
      const row = e as RegionRow
      if (!row.parentRow) {
        const r = this.findSubRegion(offset, e as RegionRow)
        if (r !== null) {
          return r
        }
      }
    }

    return null
  }

  findSubRegion (offset: number, row: RegionRow): RegionRow | null {
    if (offset < row.region.startPos || offset >= row.region.endPos) return null
    if (row.childRows) {
      for (const subRow of row.childRows) {
        const r = this.findSubRegion(offset, subRow)
        if (r !== null) return r
      }
    }
    return row
  }

  gotoOffset (offset: number) {
    this.offset = offset
    const page = Math.floor(offset / (this.columns * this.rows))
    const totalPage = Math.floor(this.dom.buffer.byteLength / (this.columns * this.rows))
    if (this.positionElement !== undefined) {
      this.positionElement.innerText = `${page + 1} / ${totalPage + 1}`
    }
    const d = new Uint8Array(this.dom.buffer, offset)
    let lastRangeIndex = -1
    let lastCell: HTMLSpanElement | null = null
    for (let i = 0; i < this.rows; i++) {
      const offsetText = this.toHex(offset + i * this.columns)
      this.offsets[i].textContent = offsetText
      for (let j = 0; j < this.columns; j++) {
        const index = i * this.columns + j
        const td = this.byteCells[i][j]
        const sText = this.texts[i][j]
        if (index < d.byteLength) {
          const c = d[index]
          sText.textContent = (c > 0x20 && c < 0x80) ? String.fromCharCode(c) : '·'
          this.byteCells[i][j].textContent = c.toString(16).padStart(2, '0')
          const rangeIndex = this.highlights.findIndex(v => offset + index >= v.start && offset + index < v.end)
          const splitterColor = 'white'
          if (rangeIndex >= 0) {
            const color = util.colorCode(...this.highlights[rangeIndex].color)
            if (lastRangeIndex !== rangeIndex) {
              if (lastCell) {
                lastCell.style.borderRightColor = splitterColor
              }
              td.style.borderLeftColor = splitterColor
              td.style.borderRightColor = color
            } else {
              td.style.borderLeftColor = color
              td.style.borderRightColor = color
            }

            lastCell = td
            lastRangeIndex = rangeIndex

            td.style.backgroundColor = color
            td.title = this.highlights[rangeIndex].title
          } else {
            td.style.removeProperty('background-color')
            td.style.removeProperty('border-left-color')
            td.style.removeProperty('border-right-color')
          }
        } else {
          sText.textContent = ' '
          td.textContent = ''
          td.style.removeProperty('background-color')
          td.style.removeProperty('border-left-color')
          td.style.removeProperty('border-right-color')
        }
      }
    }
  }

  gotoPage (page: number) {
    this.gotoOffset(page * this.columns * this.rows)
  }

  ensureVisible (offset: number) {
    const wantedOffset = Math.floor(offset / this.columns) * this.columns
    if (wantedOffset !== this.offset) {
      this.gotoOffset(wantedOffset)
    }
  }

  toHex (x: number) {
    return '0X' + x.toString(16).padStart(8, '0')
  }

  getPage (x: number) {
    return Math.floor(x / (this.columns * this.rows))
  }

  createElement (tag: string, classes: string | string[]) {
    const e = document.createElement(tag)
    e.classList.add(...classes)
    return e
  }

  isSameColor (c1: [number, number, number], c2: [number, number, number]) {
    return c1[0] === c2[0] && c1[1] === c2[1] && c1[2] === c2[2]
  }

  getColorForDataType (type: RegionType): [number, number, number] {
    // TODO: theme support
    const theme : {[id: string]: [number, number, number]} = {
      Number: [0xFF, 0x88, 0xDC],
      String: [0xA0, 0xA0, 0xF0],
      Offset: [0x00, 0xBF, 0xFF],
      Size: [0x30, 0xFB, 0x80],
      Compound: [0xF0, 0xF0, 0xE0],
      General: [0xE0, 0xE0, 0xE0],
      Time: [0xFF, 0x80, 0xFF],
      Flag: [0xA0, 0xB0, 0xFF]
    }
    return theme[RegionType[type]]
  }
}
