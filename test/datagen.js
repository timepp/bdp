import { strictEqual } from 'assert'
import * as fs from 'fs'
import * as path from 'path'

const fn = process.argv[2]
const name = path.basename(fn)

const buffer = fs.readFileSync(fn)
const str = buffer.toString("base64")
const ll = 1000
const lines = []
for (let i = 0; i < str.length; i += ll) {
    lines.push('    ' + str.slice(i, i + ll))
}
const resp = '`\n' + lines.join('\n') + '\n  `'

const js = `const testData = {
  filename: "${name}",
  base64Data: ${resp}
}`

fs.writeFileSync('dist/testdata.js', js)