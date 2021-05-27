import * as dom from './parser/dom.js'
import * as util from './parser/util.js'

type Highlight = {
    color: [number, number, number],
    start: number,
    end: number
}

export class Visualizer {
    container: Element
    dom: dom.FileDOM
    tdOffset: HTMLTableCellElement[]
    tdData: HTMLTableCellElement[][]
    tdText: HTMLTableCellElement[]
    desc: HTMLElement
    columns: number
    rows: number
    offset: number
    highlights: Highlight[]
    highlightLI?: HTMLElement
    

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
        this.desc = document.createElement('div')
    }

    visualize () {
        this.container.innerHTML = ''
        const tbl = document.createElement('table')
        const tr = document.createElement('tr')
        const tdTree = document.createElement('td')
        tdTree.classList.add('tree')
        const divTree = document.createElement('div')
        divTree.classList.add('tree')
        tdTree.appendChild(divTree)
        const tdView = document.createElement('td')
        tdView.classList.add('view')
        tr.appendChild(tdTree)
        tr.appendChild(tdView)
        tbl.appendChild(tr)
        this.container.appendChild(tbl)

        this.desc.classList.add('description')
        this.container.appendChild(this.desc)

        this.createNavigateButtons(tdView)

        this.createTree(divTree, this.dom.regions)
        this.createDataView(tdView, this.columns, this.rows)
        this.refreshDataView(0)

        divTree.style.height = tdView.offsetHeight + 'px'
    }

    createNavigateButtons(parent: Element) {
        let btn
        const self = this
        const pageSize = this.columns * this.rows
        const maxPage = Math.ceil(this.dom.buffer.byteLength / pageSize) - 1

        btn = document.createElement('button')
        btn.textContent = "首页"
        btn.onclick = function() {
            self.offset = 0
            self.refreshDataView(self.offset)
        }
        parent.appendChild(btn)

        btn = document.createElement('button')
        btn.textContent = "上一页"
        btn.onclick = function() {
            self.offset = Math.max(self.offset - pageSize, 0)
            self.refreshDataView(self.offset)
        }
        parent.appendChild(btn)

        btn = document.createElement('button')
        btn.textContent = "下一页"
        btn.onclick = function() {
            self.offset = Math.min(self.offset + pageSize, maxPage * pageSize)
            self.refreshDataView(self.offset)
        }
        parent.appendChild(btn)

        btn = document.createElement('button')
        btn.textContent = "尾页"
        btn.onclick = function() {
            self.offset = maxPage * pageSize
            self.refreshDataView(self.offset)
        }
        parent.appendChild(btn)

        parent.appendChild(document.createTextNode('   '))

        btn = document.createElement('button')
        btn.textContent = "转到页"
        btn.onclick = function() {
            let v = prompt("转到哪一页?")
            if (v === null) return
            let n = parseInt(v)
            if (n < 0) n = 0
            if (n > maxPage) n = maxPage
            self.offset = n * pageSize
            self.refreshDataView(self.offset)
        }
        parent.appendChild(btn)

        btn = document.createElement('button')
        btn.textContent = "转到位置"
        btn.onclick = function() {
            const v = prompt("输入位置, 16进制位置用0x前缀")
            if (v === null) return
            const x = parseInt(v)
            let n = Math.ceil(x / pageSize) - 1
            if (n < 0) n = 0
            if (n > maxPage) n = maxPage
            self.offset = n * pageSize
            self.refreshDataView(self.offset)
        }
        parent.appendChild(btn)
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
        parent.appendChild(li)
        li.s = r.startPos
        li.e = r.endPos
        li.region = r

        let text = r.ID
        if (r.numValue !== undefined) {
            text += ' ' + r.numValue
        } else if (r.strValue !== undefined) {
            text += ' ' + r.strValue
        }
        const span = document.createElement('span')
        span.textContent = text
        li.appendChild(document.createTextNode(text))

        if (r.subRegions !== undefined) {
            li.classList.add('caret')
            const ul = document.createElement('ul')
            li.appendChild(ul)
            ul.classList.add('nested')
            li.ul = ul
            li.constructed = false
        }
    
        const that = this
        li.addEventListener("click", function(e) {
            if (e.target !== e.currentTarget) return

            const l = e.target as HTMLElement
            if (that.highlightLI) {
                that.highlightLI.classList.remove('highlight')
            }
            that.highlightLI = l
            that.highlightLI.classList.add('highlight')

            const r = l.region as dom.Region
            that.highlights = []
            if (r.subRegions) {
                for (const subR of r.subRegions) {
                    if (subR !== undefined)
                        that.highlights.push({color: that.getColorForDataType(subR.type), start: subR.startPos, end: subR.endPos})
                }
            }
            that.highlights.push({color: that.getColorForDataType(r.type), start: r.startPos, end: r.endPos})
            that.refresh(that.getPage(l.s))
            that.desc.textContent = l.region.description

            if (l.ul) {
                l.ul.classList.toggle("active");
                l.classList.toggle("caret-down");
                if (!l.constructed) {
                    
                    // if there are less than 100 sub regions, we construct them directly
                    // otherwise we use pseudo elements to wrap them
                    if (l.region.subRegions.length < 100) {
                        for (let i = 0; i < l.region.subRegions.length; i++) {
                            let subRegion = l.region.subRegions[i]
                            if (subRegion === undefined) {
                                // which means it's lazy init
                                subRegion = l.region.subRegionFetcher(i)
                            }
                            that.insertRegion(l.ul, subRegion)
                        }
                    } else {
                        for (let i = 0; i < l.region.subRegions.length; i += 100) {
                            const li = document.createElement('li')
                            l.ul.appendChild(li)
                            const endIndex = Math.min(l.region.subRegions.length, i + 100)
                            li.textContent = `[${i}..${endIndex-1}]`
                            li.classList.add('caret')
                            li.startIndex = i
                            li.endIndex = endIndex
                            li.region = l.region
                            const ul = document.createElement('ul')
                            li.appendChild(ul)
                            ul.classList.add('nested')
                            li.ul = ul
                            li.constructed = false
                            li.addEventListener("click", function (e) {
                                if (e.target !== e.currentTarget) return
                                const ll = e.target as HTMLElement
                                ll.ul.classList.toggle("active")
                                ll.classList.toggle("caret-down")
                                if (!ll.constructed) {
                                    for (let i = ll.startIndex; i < ll.endIndex; i++) {
                                        let subRegion = ll.region.subRegions[i]
                                        if (subRegion === undefined) {
                                            subRegion = ll.region.subRegionFetcher(i)
                                        }
                                        that.insertRegion(ll.ul, subRegion)
                                    }
                                    ll.constructed = true
                                }
                            })
                        }
                    }

                    l.constructed = true
                }
            }
        })
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
            let dimmColor = false
            let lastRangeIndex = -1
            for (let j = 0; j < this.columns; j++) {
                const index = i * this.columns + j
                const td = this.tdData[i][j]
                if (index < d.byteLength) {
                    const c = d[index]
                    text += (c >= 0x20 && c < 0x80)? String.fromCharCode(c) : '·'
                    this.tdData[i][j].textContent = c.toString(16).padStart(2, '0')
                    const rangeIndex = this.highlights.findIndex(v => offset + index >= v.start && offset + index < v.end)
                    if (rangeIndex >= 0) {
                        if (lastRangeIndex !== -1 && lastRangeIndex != rangeIndex) {
                            if (this.isSameColor(this.highlights[lastRangeIndex].color, this.highlights[rangeIndex].color)) {
                                dimmColor = !dimmColor
                                console.log('dim color: ', dimmColor)
                            } else {
                                dimmColor = false
                            }
                        }
                        lastRangeIndex = rangeIndex

                        let color = this.highlights[rangeIndex].color
                        if (dimmColor) {
                            let [h, s, l] = util.rgbToHsl(...color)
                            l += (1-l) / 2
                            color = util.hslToRgb(h, s, l)
                        }

                        const [r, g, b] = color
                        td.style.backgroundColor = `rgb(${r}, ${g}, ${b})`
                    }
                    else {
                        td.style.backgroundColor = '#FFFFFF'
                    }
                } else {
                    text += ' '
                    td.textContent = ''
                    td.style.backgroundColor = '#FFFFFF'
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

    isSameColor(c1: [number, number, number], c2: [number, number, number]) {
        return c1[0] === c2[0] && c1[1] === c2[1] && c1[2] === c2[2]
    }

    getColorForDataType(type: dom.RegionType): [number, number, number] {
        // TODO: theme support
        const theme : {[id:string]: [number, number, number]} = {
            N: [0xFF, 0x88, 0xDC],
            n: [0xFF, 0x88, 0xDC],
            S: [0x30, 0xFB, 0x80],
            s: [0x30, 0xFB, 0x80],
            P: [0xE0, 0xE0, 0x80],
            L: [0x00, 0xBF, 0xFF],
            C: [0xFF, 0xA0, 0x80],
            G: [0xC0, 0xC0, 0xC0]
        }
        return theme[type]
    }
}
