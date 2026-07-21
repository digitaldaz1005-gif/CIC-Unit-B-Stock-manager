/**
 * Backup Service
 * --------------
 * Creates complete application backups and restores from backup files.
 * Exports/imports all localStorage data for full application portability.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BackupData {
  version: string
  exportDate: string
  exportTimestamp: number
  application: {
    name: string
    version: string
  }
  data: {
    stock: any[]
    history: any[]
    shipments: any[]
    rejects: any[]
    adjustments: any[]
    schedule: any[]
    carryovers: any[]
    scheduleMovements: any[]
    staff: any[]
    manualNotifications: any[]
    factoryShutdowns: any[]
    dismissedNotifications: Record<string, any>
    factoryStatusHistory: any[]
    settings: {
      soundAlertsEnabled: boolean
      lastFactoryStatus: string
    }
  }
}

// ---------------------------------------------------------------------------
// localStorage Keys
// ---------------------------------------------------------------------------

const STORAGE_KEYS = {
  stock: 'cicStock',
  history: 'cicHistory',
  shipments: 'cicShipments',
  rejects: 'cicRejects',
  adjustments: 'cicAdjustments',
  schedule: 'cicSchedule',
  carryovers: 'cicCarryovers',
  scheduleMovements: 'cicScheduleMovements',
  staff: 'cicStaff',
  manualNotifications: 'cicManualNotifications',
  factoryShutdowns: 'cicFactoryShutdowns',
  dismissedNotifications: 'cicDismissedNotifications',
  factoryStatusHistory: 'cicFactoryStatusHistory',
  soundAlertsEnabled: 'cicFactorySoundAlerts',
  lastFactoryStatus: 'cicFactoryLastStatus',
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export function exportBackup(): BackupData {
  const backup: BackupData = {
    version: '1.0',
    exportDate: new Date().toISOString(),
    exportTimestamp: Date.now(),
    application: {
      name: 'CIC Unit B Core Stock Management',
      version: '1.1'
    },
    data: {
      stock: readLocal(STORAGE_KEYS.stock, []),
      history: readLocal(STORAGE_KEYS.history, []),
      shipments: readLocal(STORAGE_KEYS.shipments, []),
      rejects: readLocal(STORAGE_KEYS.rejects, []),
      adjustments: readLocal(STORAGE_KEYS.adjustments, []),
      schedule: readLocal(STORAGE_KEYS.schedule, []),
      carryovers: readLocal(STORAGE_KEYS.carryovers, []),
      scheduleMovements: readLocal(STORAGE_KEYS.scheduleMovements, []),
      staff: readLocal(STORAGE_KEYS.staff, []),
      manualNotifications: readLocal(STORAGE_KEYS.manualNotifications, []),
      factoryShutdowns: readLocal(STORAGE_KEYS.factoryShutdowns, []),
      dismissedNotifications: readLocal(STORAGE_KEYS.dismissedNotifications, {}),
      factoryStatusHistory: readLocal(STORAGE_KEYS.factoryStatusHistory, []),
      settings: {
        soundAlertsEnabled: readLocal(STORAGE_KEYS.soundAlertsEnabled, false),
        lastFactoryStatus: readLocal(STORAGE_KEYS.lastFactoryStatus, 'green')
      }
    }
  }

  return backup
}

export function downloadBackup(): void {
  try {
    const backup = exportBackup()
    const json = JSON.stringify(backup, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    
    const dateStr = new Date().toISOString().split('T')[0]
    const timeStr = new Date().toTimeString().split(' ')[0].replace(/:/g, '-')
    const filename = `CIC_Backup_${dateStr}_${timeStr}.json`
    
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch (err: any) {
    console.error('Failed to export backup:', err)
    throw new Error(err?.message ?? 'Failed to export backup')
  }
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export function validateBackup(data: any): boolean {
  if (!data || typeof data !== 'object') {
    return false
  }

  // Check required fields
  if (!data.version || !data.exportDate || !data.application) {
    return false
  }

  if (!data.data || typeof data.data !== 'object') {
    return false
  }

  // Check that data object has expected structure
  const requiredKeys = [
    'stock', 'history', 'shipments', 'rejects', 'adjustments',
    'schedule', 'carryovers', 'scheduleMovements', 'staff',
    'manualNotifications', 'factoryShutdowns', 'settings'
  ]

  for (const key of requiredKeys) {
    if (!(key in data.data)) {
      return false
    }
  }

  return true
}

export function importBackup(jsonString: string): boolean {
  try {
    const backup = JSON.parse(jsonString)
    
    if (!validateBackup(backup)) {
      throw new Error('Invalid backup file format')
    }

    // Clear all existing data
    clearAllData()

    // Restore all data
    const data = backup.data

    writeLocal(STORAGE_KEYS.stock, data.stock || [])
    writeLocal(STORAGE_KEYS.history, data.history || [])
    writeLocal(STORAGE_KEYS.shipments, data.shipments || [])
    writeLocal(STORAGE_KEYS.rejects, data.rejects || [])
    writeLocal(STORAGE_KEYS.adjustments, data.adjustments || [])
    writeLocal(STORAGE_KEYS.schedule, data.schedule || [])
    writeLocal(STORAGE_KEYS.carryovers, data.carryovers || [])
    writeLocal(STORAGE_KEYS.scheduleMovements, data.scheduleMovements || [])
    writeLocal(STORAGE_KEYS.staff, data.staff || [])
    writeLocal(STORAGE_KEYS.manualNotifications, data.manualNotifications || [])
    writeLocal(STORAGE_KEYS.factoryShutdowns, data.factoryShutdowns || [])
    writeLocal(STORAGE_KEYS.dismissedNotifications, data.dismissedNotifications || {})
    writeLocal(STORAGE_KEYS.factoryStatusHistory, data.factoryStatusHistory || [])
    
    if (data.settings) {
      writeLocal(STORAGE_KEYS.soundAlertsEnabled, data.settings.soundAlertsEnabled || false)
      writeLocal(STORAGE_KEYS.lastFactoryStatus, data.settings.lastFactoryStatus || 'green')
    }

    return true
  } catch (err: any) {
    console.error('Failed to import backup:', err)
    throw new Error(err?.message ?? 'Failed to import backup')
  }
}

export function readBackupFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    
    reader.onload = (e) => {
      const content = e.target?.result as string
      if (content) {
        resolve(content)
      } else {
        reject(new Error('Failed to read file'))
      }
    }
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'))
    }
    
    reader.readAsText(file)
  })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeLocal<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value))
}

function clearAllData(): void {
  // Clear all application data from localStorage
  Object.values(STORAGE_KEYS).forEach(key => {
    localStorage.removeItem(key)
  })
}

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

export function getBackupInfo(jsonString: string): { date: string; version: string; valid: boolean } | null {
  try {
    const backup = JSON.parse(jsonString)
    if (!validateBackup(backup)) {
      return null
    }
    return {
      date: new Date(backup.exportTimestamp).toLocaleString('en-GB'),
      version: backup.version,
      valid: true
    }
  } catch {
    return null
  }
}