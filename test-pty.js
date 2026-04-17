const pty = require('node-pty')

const term = pty.spawn('/bin/bash', [], {
  name: 'xterm-256color',
  cols: 80,
  rows: 24,
  cwd: '/workspace'
})

console.log('PID:', term.pid)

let output = ''
let exitInfo = null

term.onData((data) => {
  output += data
  console.log('onData:', JSON.stringify(data.substring(0, 50)))
  
  if (output.length > 20) {
    console.log('\n✅ SUCCESS! Total output length:', output.length)
    console.log('Output preview:', JSON.stringify(output.substring(0, 200)))
    
    // 保持运行一段时间
    setTimeout(() => {
      console.log('\n✅ Test completed - PTY is stable')
      process.exit(0)
    }, 2000)
  }
})

term.onExit((e) => {
  exitInfo = e
  console.log('\n❌ onExit:', JSON.stringify(e))
  console.log('Total output before exit:', output.length)
  if (output.length > 0) {
    console.log('Output:', JSON.stringify(output.substring(0, 100)))
  }
  process.exit(1)
})

setTimeout(() => {
  console.log('\n⏰ TIMEOUT check')
  console.log('- PID still running:', term.pid)
  console.log('- Output length:', output.length)
  
  if (!exitInfo) {
    if (output.length > 0) {
      console.log('\n✅ PTY is still alive!')
      console.log('Output:', JSON.stringify(output.substring(0, 100)))
      term.kill()
      process.exit(0)
    } else {
      console.log('\n❌ No output received')
      term.kill()
      process.exit(2)
    }
  }
}, 5000)
