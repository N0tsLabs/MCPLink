#!/usr/bin/env node
/**
 * 跨平台 MCP 环境安装脚本启动器
 * 自动检测操作系统并运行对应的安装脚本
 */

const { spawn } = require('child_process')
const path = require('path')
const os = require('os')

const scriptsDir = __dirname
const isWindows = os.platform() === 'win32'

console.log(`检测到操作系统: ${os.platform()}`)
console.log('')

let command, args

if (isWindows) {
    // Windows: 使用 PowerShell 运行
    const scriptPath = path.join(scriptsDir, 'setup-mcp.ps1')
    command = 'powershell'
    args = ['-ExecutionPolicy', 'Bypass', '-File', scriptPath]
} else {
    // Linux/macOS: 使用 bash 运行
    const scriptPath = path.join(scriptsDir, 'setup-mcp.sh')
    command = 'bash'
    args = [scriptPath]
}

const child = spawn(command, args, {
    stdio: 'inherit',
    shell: false,
})

child.on('error', (err) => {
    console.error('运行安装脚本失败:', err.message)
    process.exit(1)
})

child.on('close', (code) => {
    process.exit(code || 0)
})
