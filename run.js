import { exec } from "child_process";
import { setTimeout } from "timers";

const start = (process.platform == 'darwin'? 'open': process.platform == 'win32'? 'start': 'xdg-open');

exec('http-server -c-1 -p 8080 .')

setTimeout(()=>{
    exec(start + ' http://localhost:8080/app/bdp.html')
}, 2000)
