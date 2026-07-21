/**
 * Factory Status Service
 * ----------------------
 * Calculates overall factory status (Green/Amber/Red) based on live data.
 * Manages status history and optional sound alerts.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FactoryStatus = "green" | "amber" | "red"

export interface StatusResult {
  status: FactoryStatus
  label: string
  reasons: string[]
}

export interface StatusHistoryEntry {
  date: string
  time: string
  previousStatus: FactoryStatus
  newStatus: FactoryStatus
  reason: string
}

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

const STATUS_HISTORY_KEY = "cicFactoryStatusHistory"
const SOUND_ENABLED_KEY = "cicFactorySoundAlerts"
const LAST_STATUS_KEY = "cicFactoryLastStatus"

function readLocal<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key)
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeLocal<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value))
}

// ---------------------------------------------------------------------------
// Sound Alert
// ---------------------------------------------------------------------------

export function isSoundEnabled(): boolean {
  return readLocal<boolean>(SOUND_ENABLED_KEY, false)
}

export function setSoundEnabled(enabled: boolean) {
  writeLocal(SOUND_ENABLED_KEY, enabled)
}

let audioContext: AudioContext | null = null

function playAlertSound() {
  if (!isSoundEnabled()) return

  try {
    if (!audioContext) {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    }

    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)

    oscillator.frequency.value = 800
    oscillator.type = "sine"

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5)

    oscillator.start(audioContext.currentTime)
    oscillator.stop(audioContext.currentTime + 0.5)
  } catch (err) {
    console.warn("Could not play alert sound:", err)
  }
}

// ---------------------------------------------------------------------------
// Status History
// ---------------------------------------------------------------------------

export function getStatusHistory(): StatusHistoryEntry[] {
  return readLocal<StatusHistoryEntry[]>(STATUS_HISTORY_KEY, [])
}

export function addStatusHistory(entry: StatusHistoryEntry) {
  const history = getStatusHistory()
  history.unshift(entry)

  // Keep only last 50 entries
  const trimmed = history.slice(0, 50)
  writeLocal(STATUS_HISTORY_KEY, trimmed)
}

export function clearStatusHistory() {
  writeLocal(STATUS_HISTORY_KEY, [])
}

// ---------------------------------------------------------------------------
// Status Calculation
// ---------------------------------------------------------------------------

import {
  loadStaff,
  getDailyAttendance,
  isDailyAttendanceComplete,
  loadManualNotifications,
  loadFactoryShutdowns,
} from "./staffService"
import { loadSchedule } from "./scheduleService"
import { state } from "./state"

export function calculateFactoryStatus(): StatusResult {
  const today = new Date()
  const todayStr = today.toISOString().split("T")[0]

  // Load all required data
  const staff = loadStaff()
  const scheduleItems = loadSchedule()
  const manualNotifs = loadManualNotifications()
  const shutdowns = loadFactoryShutdowns()

  // Attendance
  let dailyRecords: any = {}
  let attendanceComplete = true
  let late = 0
  let attendanceOutstanding = 0
  
  try {
    dailyRecords = getDailyAttendance(todayStr)
    attendanceComplete = isDailyAttendanceComplete(todayStr)
    late = staff.filter((m: any) => dailyRecords[m.id]?.status === "Late").length
    attendanceOutstanding = staff.filter((m: any) => !dailyRecords[m.id]).length
  } catch (err) {
    console.error("Error loading attendance data:", err)
  }

  // Low stock
  const lowStock = state.stock.filter((s: any) => s.quantity <= 5)
  const criticalLowStock = state.stock.filter((s: any) => s.quantity === 0)

  // Schedule
  let totalScheduled = 0
  let totalShipped = 0
  let schedulePct = 100
  
  try {
    totalScheduled = scheduleItems.reduce((t: number, s: any) => t + (s.scheduled_qty || 0), 0)
    totalShipped = scheduleItems.reduce((t: number, s: any) => t + (s.shipped_qty || 0), 0)
    schedulePct = totalScheduled > 0 ? Math.min(100, (totalShipped / totalScheduled) * 100) : 100
  } catch (err) {
    console.error("Error loading schedule data:", err)
  }

  // Reviews due (within 7 days)
  let reviewsDue: any[] = []
  try {
    reviewsDue = staff.filter((m: any) => {
      if (!m.startDate) return false
      const startDate = new Date(m.startDate + "T00:00:00")
      const reviewDate = new Date(startDate)
      reviewDate.setMonth(reviewDate.getMonth() + 3)
      reviewDate.setHours(0, 0, 0, 0)
      const diffDays = Math.round((reviewDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      return diffDays >= 0 && diffDays <= 7
    })
  } catch (err) {
    console.error("Error loading reviews data:", err)
  }

  // Shutdown within 7 days
  let upcomingShutdown: any = null
  try {
    upcomingShutdown = shutdowns.find((s: any) => {
      const shutdownDate = new Date(s.date + "T00:00:00")
      shutdownDate.setHours(0, 0, 0, 0)
      const diffDays = Math.round((shutdownDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      return diffDays >= 0 && diffDays <= 7
    })
  } catch (err) {
    console.error("Error loading shutdown data:", err)
  }

  // Critical notifications (priority 1-2)
  let criticalNotifs = 0
  try {
    criticalNotifs = manualNotifs.filter((n: any) => n.priority <= 2).length
  } catch (err) {
    console.error("Error loading notifications:", err)
  }

  // -------------------------------------------------------------------------
  // Determine status
  // -------------------------------------------------------------------------

  const reasons: string[] = []

  // RED conditions (critical)
  const hasCriticalLowStock = criticalLowStock.length > 0
  const hasScheduleSeriouslyBehind = schedulePct < 25 && totalScheduled > 0
  const hasShutdownWithin7Days = !!upcomingShutdown
  const hasMultipleCriticalNotifs = criticalNotifs >= 2
  const hasAttendanceNotSubmitted = !attendanceComplete && staff.length > 0

  if (hasCriticalLowStock) {
    reasons.push(`Critical Low Stock (${criticalLowStock.length} item${criticalLowStock.length > 1 ? "s" : ""})`)
  }
  if (hasScheduleSeriouslyBehind) {
    reasons.push("Schedule Seriously Behind")
  }
  if (hasShutdownWithin7Days) {
    const days = Math.max(0, Math.round((new Date(upcomingShutdown.date + "T00:00:00").getTime() - today.getTime()) / (1000 * 60 * 60 * 24)))
    reasons.push(`Factory Shutdown in ${days} day${days !== 1 ? "s" : ""}`)
  }
  if (hasMultipleCriticalNotifs) {
    reasons.push(`${criticalNotifs} Critical Notification${criticalNotifs > 1 ? "s" : ""}`)
  }
  if (hasAttendanceNotSubmitted) {
    reasons.push("Attendance Not Submitted")
  }

  if (reasons.length > 0) {
    return { status: "red", label: "ACTION REQUIRED", reasons }
  }

  // AMBER conditions (warning)
  const amberReasons: string[] = []

  if (attendanceOutstanding > 0) {
    amberReasons.push(`Attendance Outstanding (${attendanceOutstanding})`)
  }
  if (late > 0) {
    amberReasons.push(`${late} Staff Late Today`)
  }
  if (lowStock.length > 0 && !hasCriticalLowStock) {
    amberReasons.push(`Low Stock Items (${lowStock.length})`)
  }
  if (reviewsDue.length > 0) {
    amberReasons.push(`Employment Reviews Due (${reviewsDue.length})`)
  }
  if (schedulePct < 50 && totalScheduled > 0 && !hasScheduleSeriouslyBehind) {
    amberReasons.push("Schedule Slightly Behind")
  }

  if (amberReasons.length > 0) {
    return { status: "amber", label: "ATTENTION REQUIRED", reasons: amberReasons }
  }

  // GREEN (all clear)
  return { status: "green", label: "FACTORY RUNNING NORMALLY", reasons: ["All production on schedule"] }
}

// ---------------------------------------------------------------------------
// Status Change Detection
// ---------------------------------------------------------------------------

export function checkStatusChange(newStatus: StatusResult): StatusResult | null {
  const lastStatus = readLocal<FactoryStatus>(LAST_STATUS_KEY, "green")

  if (lastStatus !== newStatus.status) {
    // Record in history
    const now = new Date()
    const timeStr = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    const dateStr = now.toISOString().split("T")[0]

    const primaryReason = newStatus.reasons[0] || "Status changed"

    addStatusHistory({
      date: dateStr,
      time: timeStr,
      previousStatus: lastStatus,
      newStatus: newStatus.status,
      reason: primaryReason,
    })

    // Play sound if status degraded (green -> amber or green -> red)
    if (lastStatus === "green" && (newStatus.status === "amber" || newStatus.status === "red")) {
      playAlertSound()
    }

    // Update last status
    writeLocal(LAST_STATUS_KEY, newStatus.status)

    return newStatus
  }

  return null
}

export function getLastStatus(): FactoryStatus {
  return readLocal<FactoryStatus>(LAST_STATUS_KEY, "green")
}

export function resetStatusTracking() {
  writeLocal(LAST_STATUS_KEY, "green")
  clearStatusHistory()
}