/**
 * Staff Service
 * -------------
 * Lightweight staff + attendance + notification data layer.
 * Uses localStorage (same pattern as scheduleService / supabase local fallback).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AttendanceEntry = {
  id: string
  date: string        // YYYY-MM-DD
  status: "In" | "Late" | "Sick"
  notes?: string
}

export type StaffMember = {
  id: string
  name: string
  department: string
  startDate: string   // YYYY-MM-DD
  birthday: string    // YYYY-MM-DD
  holidayEntitlement: number
  holidayTaken: number
  attendance: AttendanceEntry[]
}

export type ManualNotification = {
  id: string
  message: string
  createdAt: string
}

export type FactoryShutdown = {
  id: string
  title: string
  date: string        // YYYY-MM-DD
}

export type DashboardNotification = {
  id: string
  type: "shutdown" | "review" | "birthday" | "manual"
  icon: string
  title: string
  message: string
  priority: number     // 1 = highest
  dismissId: string
}

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

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

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9)
}

// ---------------------------------------------------------------------------
// Staff CRUD
// ---------------------------------------------------------------------------

const STAFF_KEY = "cicStaff"

export function loadStaff(): StaffMember[] {
  return readLocal<StaffMember[]>(STAFF_KEY, [])
}

export function saveStaff(staff: StaffMember[]) {
  writeLocal(STAFF_KEY, staff)
}

export function getStaffMember(id: string): StaffMember | undefined {
  return loadStaff().find(s => s.id === id)
}

export function addStaffMember(
  member: Omit<StaffMember, "id" | "attendance">
): StaffMember {
  const staff = loadStaff()
  const newMember: StaffMember = {
    ...member,
    id: generateId(),
    attendance: [],
  }
  staff.push(newMember)
  saveStaff(staff)
  return newMember
}

export function updateStaffMember(
  id: string,
  updates: Partial<StaffMember>
): boolean {
  const staff = loadStaff()
  const idx = staff.findIndex(s => s.id === id)
  if (idx === -1) return false
  staff[idx] = { ...staff[idx], ...updates }
  saveStaff(staff)
  return true
}

export function deleteStaffMember(id: string): boolean {
  const staff = loadStaff()
  const filtered = staff.filter(s => s.id !== id)
  if (filtered.length === staff.length) return false
  saveStaff(filtered)
  return true
}

export function bookHoliday(
  staffId: string,
  startDate: string,
  endDate: string
): boolean {
  const staff = loadStaff()
  const idx = staff.findIndex(s => s.id === staffId)
  if (idx === -1) return false

  // Calculate days
  const start = new Date(startDate + "T00:00:00")
  const end = new Date(endDate + "T00:00:00")
  const days = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
  if (days < 1) return false

  // Add holiday to staff member
  staff[idx].holidayTaken += days
  saveStaff(staff)
  return true
}

export function cancelHoliday(
  staffId: string,
  startDate: string,
  endDate: string
): boolean {
  const staff = loadStaff()
  const idx = staff.findIndex(s => s.id === staffId)
  if (idx === -1) return false

  // Calculate days
  const start = new Date(startDate + "T00:00:00")
  const end = new Date(endDate + "T00:00:00")
  const days = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
  if (days < 1) return false

  // Remove holiday from staff member
  staff[idx].holidayTaken = Math.max(0, staff[idx].holidayTaken - days)
  saveStaff(staff)
  return true
}

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

export function addAttendance(
  staffId: string,
  status: "Late" | "Sick",
  notes?: string
): boolean {
  const staff = loadStaff()
  const idx = staff.findIndex(s => s.id === staffId)
  if (idx === -1) return false
  const entry: AttendanceEntry = {
    id: generateId(),
    date: todayISO(),
    status,
    notes: notes?.trim() || undefined,
  }
  staff[idx].attendance.push(entry)
  saveStaff(staff)
  return true
}

export function updateAttendance(
  staffId: string,
  entryId: string,
  updates: Partial<AttendanceEntry>
): boolean {
  const staff = loadStaff()
  const sIdx = staff.findIndex(s => s.id === staffId)
  if (sIdx === -1) return false
  const aIdx = staff[sIdx].attendance.findIndex(a => a.id === entryId)
  if (aIdx === -1) return false
  staff[sIdx].attendance[aIdx] = {
    ...staff[sIdx].attendance[aIdx],
    ...updates,
  }
  saveStaff(staff)
  return true
}

export function deleteAttendance(
  staffId: string,
  entryId: string
): boolean {
  const staff = loadStaff()
  const sIdx = staff.findIndex(s => s.id === staffId)
  if (sIdx === -1) return false
  const before = staff[sIdx].attendance.length
  staff[sIdx].attendance = staff[sIdx].attendance.filter(a => a.id !== entryId)
  if (staff[sIdx].attendance.length === before) return false
  saveStaff(staff)
  return true
}

export function getAttendanceStats(staff: StaffMember) {
  const lateDays = staff.attendance.filter(a => a.status === "Late").length
  const sickDays = staff.attendance.filter(a => a.status === "Sick").length
  const inDays = staff.attendance.filter(a => a.status === "In").length
  return { lateDays, sickDays, inDays }
}

export function setDailyAttendance(
  staffId: string,
  date: string,
  status: "In" | "Late" | "Sick",
  notes?: string
): boolean {
  const staff = loadStaff()
  const idx = staff.findIndex(s => s.id === staffId)
  if (idx === -1) return false

  // Check if attendance already exists for this date
  const existingIdx = staff[idx].attendance.findIndex(a => a.date === date)
  if (existingIdx >= 0) {
    // Update existing entry
    staff[idx].attendance[existingIdx].status = status
    staff[idx].attendance[existingIdx].notes = notes?.trim() || undefined
  } else {
    // Add new entry
    const entry: AttendanceEntry = {
      id: generateId(),
      date,
      status,
      notes: notes?.trim() || undefined,
    }
    staff[idx].attendance.push(entry)
  }
  saveStaff(staff)
  return true
}

export function getDailyAttendance(date: string): Record<string, AttendanceEntry> {
  const staff = loadStaff()
  const result: Record<string, AttendanceEntry> = {}
  for (const member of staff) {
    const entry = member.attendance.find(a => a.date === date)
    if (entry) {
      result[member.id] = entry
    }
  }
  return result
}

export function isDailyAttendanceComplete(date: string): boolean {
  const staff = loadStaff()
  if (staff.length === 0) return true
  return staff.every(member => 
    member.attendance.some(a => a.date === date)
  )
}

// ---------------------------------------------------------------------------
// Manual notifications
// ---------------------------------------------------------------------------

const MANUAL_NOTIF_KEY = "cicManualNotifications"

export function loadManualNotifications(): ManualNotification[] {
  return readLocal<ManualNotification[]>(MANUAL_NOTIF_KEY, [])
}

export function addManualNotification(message: string): ManualNotification {
  const notifs = loadManualNotifications()
  const newNotif: ManualNotification = {
    id: generateId(),
    message,
    createdAt: new Date().toISOString(),
  }
  notifs.push(newNotif)
  writeLocal(MANUAL_NOTIF_KEY, notifs)
  return newNotif
}

export function deleteManualNotification(id: string): boolean {
  const notifs = loadManualNotifications()
  const filtered = notifs.filter(n => n.id !== id)
  if (filtered.length === notifs.length) return false
  writeLocal(MANUAL_NOTIF_KEY, filtered)
  return true
}

// ---------------------------------------------------------------------------
// Factory shutdowns
// ---------------------------------------------------------------------------

const SHUTDOWN_KEY = "cicFactoryShutdowns"

export function loadFactoryShutdowns(): FactoryShutdown[] {
  return readLocal<FactoryShutdown[]>(SHUTDOWN_KEY, [])
}

export function addFactoryShutdown(title: string, date: string): FactoryShutdown {
  const shutdowns = loadFactoryShutdowns()
  const newShutdown: FactoryShutdown = {
    id: generateId(),
    title,
    date,
  }
  shutdowns.push(newShutdown)
  writeLocal(SHUTDOWN_KEY, shutdowns)
  return newShutdown
}

export function deleteFactoryShutdown(id: string): boolean {
  const shutdowns = loadFactoryShutdowns()
  const filtered = shutdowns.filter(s => s.id !== id)
  if (filtered.length === shutdowns.length) return false
  writeLocal(SHUTDOWN_KEY, filtered)
  return true
}

// ---------------------------------------------------------------------------
// Dismissal tracking
// ---------------------------------------------------------------------------

const DISMISSED_KEY = "cicDismissedNotifications"

function getDismissed(): Record<string, string> {
  return readLocal<Record<string, string>>(DISMISSED_KEY, {})
}

function writeDismissed(dismissed: Record<string, string>) {
  writeLocal(DISMISSED_KEY, dismissed)
}

export function isNotificationDismissed(dismissId: string): boolean {
  const dismissed = getDismissed()
  return !!dismissed[dismissId]
}

export function dismissNotification(dismissId: string) {
  const dismissed = getDismissed()
  dismissed[dismissId] = new Date().toISOString()
  writeDismissed(dismissed)
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function todayISO(): string {
  return new Date().toISOString().split("T")[0]
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  const targetMonth = d.getMonth() + months
  const targetYear = d.getFullYear() + Math.floor(targetMonth / 12)
  const finalMonth = ((targetMonth % 12) + 12) % 12
  d.setFullYear(targetYear, finalMonth, d.getDate())
  return d
}

function getNextBirthday(birthday: string): Date {
  const bday = new Date(birthday)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const thisYear = new Date(today.getFullYear(), bday.getMonth(), bday.getDate())
  thisYear.setHours(0, 0, 0, 0)

  if (thisYear < today) {
    return new Date(today.getFullYear() + 1, bday.getMonth(), bday.getDate())
  }
  return thisYear
}

function daysBetween(target: Date, from: Date): number {
  const diff = target.getTime() - from.getTime()
  return Math.round(diff / (1000 * 60 * 60 * 24))
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

// ---------------------------------------------------------------------------
// Dashboard notification generation
// ---------------------------------------------------------------------------

/**
 * Collect all active notifications from every module, sorted by priority:
 *   1. Factory Shutdowns
 *   2. Employment Reviews
 *   3. Birthdays
 *   4. Manual Notifications
 */
export function getDashboardNotifications(): DashboardNotification[] {
  const notifications: DashboardNotification[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // 1. Factory shutdowns (priority 1)
  const shutdowns = loadFactoryShutdowns()
  for (const shutdown of shutdowns) {
    const shutdownDate = new Date(shutdown.date + "T00:00:00")
    const days = daysBetween(shutdownDate, today)

    // Show from 7 days before up to and including the shutdown day
    if (days >= 0 && days <= 7) {
      const dismissId = `shutdown-${shutdown.id}`
      if (isNotificationDismissed(dismissId)) continue

      let message: string
      if (days === 0) {
        message = `${shutdown.title} is today.`
      } else {
        message = `${shutdown.title} in ${days} day${days > 1 ? "s" : ""}.`
      }

      notifications.push({
        id: `shutdown-${shutdown.id}`,
        type: "shutdown",
        icon: "⚠",
        title: "Factory Shutdown",
        message,
        priority: 1,
        dismissId,
      })
    }
  }

  // 2. Employment reviews (priority 2)
  const staff = loadStaff()
  for (const member of staff) {
    if (!member.startDate) continue
    const startDate = new Date(member.startDate + "T00:00:00")
    const reviewDate = addMonths(startDate, 3)
    reviewDate.setHours(0, 0, 0, 0)

    const days = daysBetween(reviewDate, today)

    // Show 7 days before, remain visible until review date passes
    if (days >= 0 && days <= 7) {
      const dismissId = `review-${member.id}`
      if (isNotificationDismissed(dismissId)) continue

      notifications.push({
        id: `review-${member.id}`,
        type: "review",
        icon: "📋",
        title: "Employment Review Due",
        message: `${member.name} reaches 3-month review on ${formatDate(reviewDate)}.`,
        priority: 2,
        dismissId,
      })
    }
  }

  // 3. Birthdays (priority 3)
  for (const member of staff) {
    if (!member.birthday) continue
    const nextBday = getNextBirthday(member.birthday)
    const days = daysBetween(nextBday, today)

    // Show 7 days before, remain visible until birthday passes
    if (days >= 0 && days <= 7) {
      const year = nextBday.getFullYear()
      const dismissId = `birthday-${member.id}-${year}`
      if (isNotificationDismissed(dismissId)) continue

      let message: string
      if (days === 0) {
        message = `${member.name}'s birthday is today!`
      } else {
        message = `${member.name}'s birthday is in ${days} day${days > 1 ? "s" : ""}.`
      }

      notifications.push({
        id: `birthday-${member.id}-${year}`,
        type: "birthday",
        icon: "🎂",
        title: "Staff Birthday",
        message,
        priority: 3,
        dismissId,
      })
    }
  }

  // 4. Manual notifications (priority 4)
  const manualNotifs = loadManualNotifications()
  for (const notif of manualNotifs) {
    notifications.push({
      id: `manual-${notif.id}`,
      type: "manual",
      icon: "📢",
      title: "Notification",
      message: notif.message,
      priority: 4,
      dismissId: `manual-${notif.id}`,
    })
  }

  // 5. Daily attendance reminder (priority 5 - lowest)
  const todayStr = new Date().toISOString().split("T")[0]
  if (!isDailyAttendanceComplete(todayStr)) {
    const dismissId = `attendance-${todayStr}`
    if (!isNotificationDismissed(dismissId)) {
      notifications.push({
        id: `attendance-${todayStr}`,
        type: "manual",
        icon: "⚠",
        title: "Daily Attendance Not Completed",
        message: "Please complete today's attendance register.",
        priority: 5,
        dismissId,
      })
    }
  }

  // Sort by priority (1 = highest)
  notifications.sort((a, b) => a.priority - b.priority)

  return notifications
}

// ---------------------------------------------------------------------------
// Seed data (for first run)
// ---------------------------------------------------------------------------

export function seedDefaultStaff() {
  const existing = loadStaff()
  if (existing.length > 0) return

  const defaults: StaffMember[] = [
    {
      id: generateId(),
      name: "John Smith",
      department: "Production",
      startDate: "2025-06-15",
      birthday: "1990-08-15",
      holidayEntitlement: 25,
      holidayTaken: 5,
      attendance: [],
    },
    {
      id: generateId(),
      name: "Sarah Jones",
      department: "Quality Control",
      startDate: "2025-05-01",
      birthday: "1988-07-28",
      holidayEntitlement: 25,
      holidayTaken: 8,
      attendance: [],
    },
    {
      id: generateId(),
      name: "Mike Brown",
      department: "Shipping",
      startDate: "2024-01-15",
      birthday: "1992-07-25",
      holidayEntitlement: 25,
      holidayTaken: 12,
      attendance: [],
    },
  ]
  saveStaff(defaults)
}