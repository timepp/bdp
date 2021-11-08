import * as bdp from "./bdp.js"
import * as visualizer from './visualizer.js'

type InlineFileData = {
    filename: string,
    base64Data: string
}

export function run(document: HTMLDocument, testData: InlineFileData) {
    document.body.onload = function() {
        main(document, testData)
    }
}

function main(document: HTMLDocument, testData: InlineFileData) {
    bdp.init()

    let ui = document.createElement('div')
    let input = document.createElement('input')
    input.type = 'file'

    document.body.appendChild(input)
    document.body.appendChild(document.createElement('br'))
    document.body.appendChild(ui)

    input.onchange = async function(e: Event) {
        if (input.files === null) return
        const f = input.files[0]
        console.log(f)
        const buffer = await f.arrayBuffer()
        applyBuffer(buffer, f.name, ui)
    }

    try {
        const b64 = testData.base64Data.replace(/\s/g, '')
        const url = 'data:application/octet-stream;base64,' + b64
        fetch(url)
            .then(res => res.arrayBuffer())
            .then(buffer => applyBuffer(buffer, testData.filename, ui))
    } catch (e) {
        console.log(e)
    }
}

function applyBuffer(buffer: ArrayBuffer, name: string, uiElement: Element) {
    const result = bdp.parse(buffer, name)
    console.log(result)
    const vis = new visualizer.Visualizer(uiElement, result)
    vis.visualize()
}
