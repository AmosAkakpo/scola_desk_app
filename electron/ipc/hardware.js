const { ipcMain } = require('electron')
const { execSync } = require('child_process')
const crypto = require('crypto')

function getHardwareValue(command) {
  try {
    return execSync(`powershell -NoProfile -Command "${command}"`, { encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

function collectFingerprint() {
  const motherboard = getHardwareValue(
    "(Get-CimInstance Win32_ComputerSystemProduct).UUID"
  )
  const disk = getHardwareValue(
    "(Get-CimInstance Win32_PhysicalMedia | Select-Object -First 1).SerialNumber"
  )
  const machineGuid = getHardwareValue(
    "(Get-ItemProperty 'HKLM:\\\\SOFTWARE\\\\Microsoft\\\\Cryptography').MachineGuid"
  )
  const cpu = getHardwareValue(
    "(Get-CimInstance Win32_Processor | Select-Object -First 1).ProcessorId"
  )

  const parts = [motherboard, disk, machineGuid, cpu].filter(Boolean)

  if (parts.length === 0) {
    throw new Error('Could not collect any hardware identifiers')
  }

  const raw = parts.join('+')
  const hash = crypto.createHash('sha256').update(raw).digest('hex')

  return {
    fingerprint: hash,
    partial: parts.length < 4,
    components: parts.length,
  }
}

function registerHardwareIPC() {
  ipcMain.handle('get-hardware-fingerprint', async () => {
    try {
      return { success: true, ...collectFingerprint() }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })
}

module.exports = { registerHardwareIPC, collectFingerprint }
