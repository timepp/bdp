import * as fs from 'fs'
import webpack from 'webpack'
/*
const compiler = webpack({
    //entry: './app/app.js'
})

compiler.run((e, s) => {
    console.log(s)
})*/

fs.copyFileSync('app/bdp.html', 'dist/bdp.html')
fs.copyFileSync('app/styles.css', 'dist/styles.css')
