import * as dom from './parser/common/dom.js'
import * as util from './parser/common/util.js'

type Highlight = {
    color: [number, number, number],
    title: string,
    start: number,
    end: number
}

interface RegionElement extends HTMLLIElement {
    region: dom.Region,
    startIndex: number,
    endIndex: number
}

export class Visualizer {
    container: Element
    dom: dom.FileDOM
    tdOffset: HTMLTableCellElement[]
    tdData: HTMLTableCellElement[][]
    tdText: HTMLTableCellElement[]
    positionElement?: HTMLSpanElement
    desc: HTMLElement
    columns: number
    rows: number
    offset: number
    highlights: Highlight[]
    highlightLI?: RegionElement

    constructor(e: Element, d: dom.FileDOM) {
        this.container = e
        this.dom = d
        this.tdOffset = []
        this.tdData = []
        this.tdText = []
        this.columns = 16
        this.rows = 16
        this.offset = 0
        this.highlights = []
        this.highlightLI = undefined
        this.positionElement = undefined
        this.desc = document.createElement('div')
    }

    visualize () {
        this.container.innerHTML = ''
        const tbl = document.createElement('table')
        this.container.appendChild(tbl)

        const tr = document.createElement('tr')
        tbl.appendChild(tr)

        const tdTree = document.createElement('td')
        tr.appendChild(tdTree)
        tdTree.classList.add('tree')
        const divTree = document.createElement('div')
        tdTree.appendChild(divTree)
        divTree.classList.add('tree')
        const tdView = document.createElement('td')
        tdView.classList.add('view')
        tr.appendChild(tdView)

        this.desc.classList.add('description')

        this.createNavigateButtons(tdView)

        this.createTree(divTree, this.dom.regions)
        this.createDataView(tdView, this.columns, this.rows)
        tdView.appendChild(this.desc)

        this.gotoOffset(0)

        divTree.style.height = tdView.offsetHeight - 10 + 'px'
    }

    createNavigateButtons(parent: Element) {
        let btn
        const self = this
        const pageSize = this.columns * this.rows
        const maxPage = Math.ceil(this.dom.buffer.byteLength / pageSize) - 1
        const dataLen = this.dom.buffer.byteLength

        let group = document.createElement('div')
        group.className = 'btn-group'

        btn = this.createBtn('首页', 'btn btn-outline-primary', () => self.gotoOffset(0))
        group.appendChild(btn)

        btn = this.createBtn('上一页', 'btn btn-outline-primary', () => self.gotoOffset(Math.max(self.offset - pageSize, 0)))
        group.appendChild(btn)
        
        btn = this.createBtn('下一页', 'btn btn-outline-primary', () => self.gotoOffset(Math.min(self.offset + pageSize, maxPage * pageSize)))
        group.appendChild(btn)

        btn = this.createBtn('尾页', 'btn btn-outline-primary', () => self.gotoOffset(maxPage * pageSize))
        group.appendChild(btn)

        parent.appendChild(group)

        this.positionElement = document.createElement('span')
        this.positionElement.className = 'position'
        parent.appendChild(this.positionElement)

        group = document.createElement('div')
        group.className = 'btn-group'

        btn = this.createBtn('转到页', 'btn btn-outline-primary', function() {
            let v = prompt("转到哪一页?")
            if (v === null) return
            let n = parseInt(v)
            if (n < 0) n = 0
            if (n > maxPage) n = maxPage
            self.gotoOffset(n * pageSize)
        })
        group.appendChild(btn)

        btn = this.createBtn('转到位置', 'btn btn-outline-primary', function() {
            const v = prompt("输入位置, 例如: 33949, 0x1000, 50%")
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
        parent.appendChild(group)
    }
    
    createTree (parent: Element, d: dom.Region[]) {
        const ul = document.createElement('ul')
        parent.appendChild(ul)
    
        for (const r of d) {
            this.insertRegion(ul, r)
        }
    }

    createBtn(text: string, c: string, onclick: ()=>void) {
        let btn = document.createElement('button')
        btn.textContent = text
        btn.classList.add(...c.split(' '))
        btn.onclick = onclick
        return btn
    }

    getRegionDisplayText(r: dom.Region) {
        let text = r.ID
        if (r.numValue !== undefined) {
            text += ` 0x${r.numValue.toString(16)} (${r.numValue})`
        }
        if (r.strValue !== undefined) {
            text += ' ' + r.strValue
        }
        return text
    }

    insertRegion (parent: HTMLUListElement, r: dom.Region) {
        const li = document.createElement('li') as RegionElement
        parent.appendChild(li)
        li.region = r

        const span = document.createElement('span')
        span.textContent = this.getRegionDisplayText(r)
        li.appendChild(span)

        if (r.interpretedValue !== undefined) {
            const iSpan = document.createElement('span')
            iSpan.classList.add('interpreted')
            iSpan.textContent = r.interpretedValue
            li.appendChild(iSpan)
        }

        if (r.subRegions !== undefined) {
            li.classList.add('caret')
        }
    
        const that = this
        li.addEventListener("click", function(e) {
            if (that.getParentLI(e.target as HTMLElement) !== e.currentTarget) {
                // do not handle event from child LIs
                return
            }

            const l = e.currentTarget as RegionElement

            if (that.highlightLI) {
                that.highlightLI.classList.remove('highlight')
            }
            that.highlightLI = l
            that.highlightLI.classList.add('highlight')

            const r = l.region
            that.highlights = []
            if (r.subRegions) {
                for (const subR of r.subRegions) {
                    if (subR !== undefined)
                        that.highlights.push({color: that.getColorForDataType(subR.type), start: subR.startPos, end: subR.endPos, title: that.getRegionDisplayText(subR)})
                }
            }
            that.highlights.push({color: that.getColorForDataType(r.type), start: r.startPos, end: r.endPos, title: that.getRegionDisplayText(r)})
            that.gotoPage(that.getPage(r.startPos))
            that.desc.textContent = l.region.description

            if (r.subRegions !== undefined) {
                l.classList.toggle('caret-down')
                let ul = l.getElementsByTagName('UL').item(0) as HTMLUListElement
                if (ul !== null) {
                    ul.classList.toggle('active')
                } else { // not yet constructed
                    ul = document.createElement('ul')
                    ul.classList.add('nested', 'active')
                    l.appendChild(ul)
                    
                    // if there are less than 100 sub regions, we construct them directly
                    // otherwise we use pseudo elements to wrap them
                    if (r.subRegions.length < 100) {
                        for (let i = 0; i < r.subRegions.length; i++) {
                            let subRegion = r.subRegions[i]
                            if (subRegion === undefined && r.subRegionFetcher !== undefined) {
                                // which means it's lazy init
                                subRegion = r.subRegionFetcher(i)
                            }
                            that.insertRegion(ul, subRegion)
                        }
                    } else {
                        for (let i = 0; i < r.subRegions.length; i += 100) {
                            const li = document.createElement('li') as RegionElement
                            ul.appendChild(li)
                            const endIndex = Math.min(r.subRegions.length, i + 100)
                            li.textContent = `[${i}..${endIndex-1}]`
                            li.classList.add('caret')
                            li.startIndex = i
                            li.endIndex = endIndex
                            li.region = r
                            li.addEventListener("click", function (e) {
                                if (e.target !== e.currentTarget) return
                                const ll = e.currentTarget as RegionElement
                                ll.classList.toggle("caret-down")
                                let sul = ll.getElementsByTagName('UL').item(0) as HTMLUListElement
                                if (sul) {
                                    sul.classList.toggle('active')
                                } else if (ll.region.subRegions !== undefined) {
                                    sul = document.createElement('ul')
                                    sul.classList.add('nested', 'active')
                                    ll.appendChild(sul)
                                    for (let i = ll.startIndex; i < ll.endIndex; i++) {
                                        let subRegion = ll.region.subRegions[i]
                                        if (subRegion === undefined && ll.region.subRegionFetcher !== undefined) {
                                            subRegion = ll.region.subRegionFetcher(i)
                                        }
                                        that.insertRegion(sul, subRegion)
                                    }
                                }
                            })
                        }
                    }
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

    gotoOffset (offset: number) {
        this.offset = offset
        const page = Math.floor(offset / (this.columns * this.rows))
        const totalPage = Math.floor(this.dom.buffer.byteLength / (this.columns * this.rows))
        if (this.positionElement !== undefined) {
            this.positionElement.innerText = `${page + 1} / ${totalPage + 1}`
        }
        const d = new Uint8Array(this.dom.buffer, offset)
        let dimColor = false
        let lastRangeIndex = -1
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
                    const rangeIndex = this.highlights.findIndex(v => offset + index >= v.start && offset + index < v.end)
                    if (rangeIndex >= 0) {
                        if (lastRangeIndex !== -1 && lastRangeIndex != rangeIndex) {
                            if (this.isSameColor(this.highlights[lastRangeIndex].color, this.highlights[rangeIndex].color)) {
                                dimColor = !dimColor
                            } else {
                                dimColor = false
                            }
                        }
                        lastRangeIndex = rangeIndex

                        let color = this.highlights[rangeIndex].color
                        if (dimColor) {
                            let [h, s, l] = util.rgbToHsl(...color)
                            l += (1-l) / 2
                            color = util.hslToRgb(h, s, l)
                        }

                        const [r, g, b] = color
                        td.style.backgroundColor = `rgb(${r}, ${g}, ${b})`
                        td.title = this.highlights[rangeIndex].title
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

    getParentLI(x: HTMLElement | null) {
        while (x) {
            if (x.tagName === 'LI') return x
            x = x.parentElement
        }
        return x
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
            S: [0xE0, 0xE0, 0x80],
            s: [0xE0, 0xE0, 0x80],
            P: [0x00, 0xBF, 0xFF],
            L: [0x30, 0xFB, 0x80],
            C: [0xD0, 0xD0, 0xD0],
            G: [0xF0, 0xF0, 0xC0]
        }
        return theme[type]
    }
}
