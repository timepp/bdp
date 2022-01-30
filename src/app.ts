import { BinaryDataParser, ParsingOptions } from './bdp.js'
import * as visualizer from './visualizer.js'
import * as ui from './uiutil.js'
import * as util from './util.js'

type InlineFileData = {
    filename: string,
    base64Data: string
}

const bdp = new BinaryDataParser()
const options: {[id:string]:ParsingOptions} = {}

export function run (document: Document, testData: InlineFileData) {
  document.body.onload = function () {
    main(document, testData)
  }
}

function main (document: Document, testData: InlineFileData) {
  const toolbar = document.createElement('div')
  const input = document.createElement('input')
  input.type = 'file'
  const settingButton = document.createElement('button')
  settingButton.textContent = 'Settings'
  settingButton.onclick = () => {
    showSettingPage()
  }
  toolbar.id = 'toolbar'
  toolbar.append(input, settingButton)
  document.body.append(toolbar)

  const mainUI = document.createElement('div')
  mainUI.style.paddingTop = '10px'
  mainUI.id = 'mainUI'
  document.body.appendChild(mainUI)

  input.onchange = async function (e: Event) {
    if (input.files === null || input.files.length === 0) return
    const f = input.files[0]
    console.log(f)
    const buffer = await f.arrayBuffer()
    applyBuffer(buffer, f.name, mainUI)
  }

  try {
    const b64 = testData.base64Data.replace(/\s/g, '')
    const url = 'data:application/octet-stream;base64,' + b64
    fetch(url)
      .then(res => res.arrayBuffer())
      .then(buffer => applyBuffer(buffer, testData.filename, mainUI))
  } catch (e) {
    console.log(e)
  }
}

function applyBuffer (buffer: ArrayBuffer, name: string, uiElement: Element) {
  const result = bdp.parse(buffer, name)
  console.log(result)
  const vis = new visualizer.Visualizer(uiElement, result)
  vis.visualize()
}

function showSettingPage () {
  class OptionInput extends HTMLInputElement {
    parser = ''
    key = ''
  }

  const sp = ui.createModel()
  document.body.appendChild(sp.layer)
  sp.layer.focus()

  const header = document.createElement('div')
  header.style.backgroundColor = '#F1C9D9'
  header.style.paddingLeft = '5px'
  sp.content.appendChild(header)

  const prop = document.createElement('div')
  prop.style.padding = '10px'
  sp.content.appendChild(prop)

  const optionDef = bdp.getParsingOptionDef()

  const tbl = ui.createTable('settings', ['Parser', 'Setting name', 'Default Value', 'Current Value', 'Actions'])
  for (const k of Object.keys(optionDef)) {
    const option = optionDef[k]
    for (const o of option) {
      const tr = document.createElement('tr')
      tr.appendChild(ui.createHtmlElement('td', k))
      tr.appendChild(ui.createHtmlElement('td', o.name))
      // tr.appendChild(ui.createHtmlElement('td', o.description))
      tr.appendChild(ui.createHtmlElement('td', o.defaultValue))
      const td = document.createElement('td')
      const input = document.createElement('input') as OptionInput
      input.type = 'text'
      input.style.width = '200px'
      input.parser = k
      input.key = o.id
      input.value = o.defaultValue
      if (k in options) {
        const po = options[k]
        if (o.id in po) {
          input.value = po[o.id]
        }
      }

      td.appendChild(input)
      tr.appendChild(td)
      tbl.tbody.appendChild(tr)
    }
  }
  prop.appendChild(tbl.table)

  const footer = document.createElement('div')
  sp.content.appendChild(footer)
  footer.style.backgroundColor = '#F1C9D9'
  footer.style.textAlign = 'center'
  const btn = ui.appendButton(footer, 'APPLY', () => {
    sp.layer.remove()
    const l = tbl.tbody.querySelectorAll('input')
    for (let i = 0; i < l.length; i++) {
      const input = l.item(i) as OptionInput
      util.setValue(input.value, options, input.parser, input.key)
      bdp.setParsingOptions(options)
    }
  })
  btn.style.margin = '10px 0px'
}
