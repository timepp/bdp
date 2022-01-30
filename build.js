import * as fs from 'fs'
import webpack from 'webpack'

const compiler = webpack({
  mode: 'none',
  entry: './app/app.js',
  experiments: {
    outputModule: true
  },
  output: {
    libraryTarget: 'module',
    filename: 'app.js'
  }
})

compiler.run((e, s) => {
  console.log(s.toString({
    chunks: false, // Makes the build much quieter
    colors: true // Shows colors in the console
  }))
  // console.log(s)
})

fs.copyFileSync('app/bdp.html', 'dist/bdp.html')
fs.copyFileSync('app/styles.css', 'dist/styles.css')
fs.copyFileSync('app/testdata.js', 'dist/testdata.js')
