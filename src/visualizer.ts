import * as dom from './parser/dom.js'

type Highlight = {
    color: string,
    start: number,
    end: number
}

export class Visualizer {
    container: Element
    dom: dom.FileDOM
    tdOffset: HTMLTableCellElement[]
    tdData: HTMLTableCellElement[][]
    tdText: HTMLTableCellElement[]
    columns: number
    rows: number
    offset: number
    highlights: Highlight[]
    highlightLI?: HTMLLIElement

    constructor(e: Element, d: dom.FileDOM) {
        this.container = e
        this.dom = d
        this.tdOffset = []
        this.tdData = []
        this.tdText = []
        this.columns = 16
        this.rows = 32
        this.offset = 0
        this.highlights = []
        this.highlightLI = undefined
    }

    visualize () {
        this.container.innerHTML = ''
        const tbl = document.createElement('table')
        const tr = document.createElement('tr')
        const tdTree = document.createElement('td')
        tdTree.classList.add('tree')
        const tdView = document.createElement('td')
        tdView.classList.add('view')
        tr.appendChild(tdTree)
        tr.appendChild(tdView)
        tbl.appendChild(tr)
        this.container.appendChild(tbl)
        const btnPrev = document.createElement('button')
        btnPrev.textContent = "上一页"
        const btnNext = document.createElement('button')
        btnNext.textContent = "下一页"
        const self = this
        btnNext.onclick = function() {
            self.offset += self.columns * self.rows
            self.refreshDataView(self.offset)
        }
        btnPrev.onclick = function() {
            self.offset -= self.columns * self.rows
            self.refreshDataView(self.offset)
        }
        tdView.appendChild(btnPrev)
        tdView.appendChild(btnNext)
    
        this.createTree(tdTree, this.dom.regions)
        this.createDataView(tdView, this.columns, this.rows)
        this.refreshDataView(0)
    }
    
    createTree (parent: Element, d: dom.Region[]) {
        const ul = document.createElement('ul')
        parent.appendChild(ul)
    
        for (const r of d) {
            this.insertRegion(ul, r)
        }
    }

    insertRegion (parent: HTMLUListElement, r: dom.Region) {
        const li = document.createElement('li')
        li.textContent = `${r.ID}`
    
        if (r.subRegions !== undefined) {
            const ul = document.createElement('ul')
            for (const subRegion of r.subRegions) {
                this.insertRegion(ul, subRegion)
            }
            li.appendChild(ul)
        }
    
        if (r.numValue !== undefined) {
            li.textContent += ` ${r.numValue}`
        }
    
        parent.appendChild(li)
        li.s = r.startPos
        li.e = r.endPos

        const that = this
        li.onclick = function(e) {
            const l = e.target
            if (that.highlightLI) {
                that.highlightLI.classList.remove('highlight')
            }
            that.highlightLI = l as HTMLLIElement
            that.highlightLI.classList.add('highlight')
            that.highlights = [{
                    color: '', // no use
                    start: l.s,
                    end: l.e
                }]
            that.refresh(that.getPage(l.s))
        }
    }

    createDataView (parent: Element, columns: number, rows: number) {
        const tbl = document.createElement('table')
        tbl.classList.add('data_view')
        parent.appendChild(tbl)
        for (let i = 0; i < rows; i++) {
            const tr = document.createElement('tr')
            tbl.appendChild(tr)

            const tdOffset = document.createElement('td')
            tdOffset.classList.add('offset')
            tr.appendChild(tdOffset)
            this.tdOffset.push(tdOffset)

            const dataRow:HTMLTableCellElement[] = []
            this.tdData.push(dataRow)
            for (let j = 0; j < columns; j++) {
                const td = document.createElement('td')
                tr.appendChild(td)
                td.classList.add('data')
                dataRow.push(td)
            }

            const tdText = document.createElement('td')
            tdText.classList.add('text')
            tr.appendChild(tdText)
            this.tdText.push(tdText)
        }
    }

    refreshDataView (offset: number) {
        this.offset = offset
        const d = new Uint8Array(this.dom.buffer, offset)
        for (let i = 0; i < this.rows; i++) {
            const offsetText = this.toHex(offset + i * this.columns)
            this.tdOffset[i].textContent = offsetText

            let text = ''
            for (let j = 0; j < this.columns; j++) {
                const index = i * this.columns + j
                const td = this.tdData[i][j]
                if (index < d.byteLength) {
                    const c = d[index]
                    text += (c >= 0x20 && c < 0x80)? String.fromCharCode(c) : '·'
                    this.tdData[i][j].textContent = c.toString(16).padStart(2, '0')
                    for (const h of this.highlights) {
                        if (offset + index >= h.start && offset + index < h.end) {
                            td.classList.add('highlight')
                        } else {
                            td.classList.remove('highlight')
                        }
                    }
                } else {
                    text += ' '
                    td.textContent = ''
                    td.classList.remove('highlight')
                }
            }

            this.tdText[i].textContent = text
        }
    }

    refresh (page: number) {
        this.refreshDataView(page * this.columns * this.rows)
    }

    ensureVisible (offset: number) {
        const wantedOffset = Math.floor(offset / this.columns) * this.columns
        if (wantedOffset !== this.offset) {
            this.refreshDataView(wantedOffset)
        }
    }

    toHex (x: number) {
        return '0X' + x.toString(16).padStart(8, '0')
    }

    getPage (x: number) {
        return Math.floor(x / (this.columns * this.rows))
    }

    createElement(tag: string, classes: string | string[]) {
        const e = document.createElement(tag)
        e.classList.add(...classes)
        return e
    }
}
