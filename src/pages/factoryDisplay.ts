import { Layout } from "../layout/layout"
import { state } from "../services/state"
import { loadSchedule } from "../services/scheduleService"
import {
  loadStaff,
  getDailyAttendance,
  isDailyAttendanceComplete,
  loadManualNotifications,
  loadFactoryShutdowns,
  type StaffMember,
  type FactoryShutdown,
} from "../services/staffService"
import {
  calculateFactoryStatus,
  checkStatusChange,
  isSoundEnabled,
  setSoundEnabled,
} from "../services/factoryStatusService"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  if (!dateStr) return "-"
  const d = new Date(dateStr + "T00:00:00")
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

function getReviewDate(startDate: string): Date {
  const d = new Date(startDate + "T00:00:00")
  d.setMonth(d.getMonth() + 3)
  return d
}


// ---------------------------------------------------------------------------
// Main render
// ---------------------------------------------------------------------------

export function renderFactoryDisplay(): HTMLElement {
  const content = document.createElement("div")
  const staff = loadStaff()
  const today = new Date()
  const todayStr = today.toISOString().split("T")[0]

  // Calculate factory status
  const statusResult = calculateFactoryStatus()
  checkStatusChange(statusResult)
  const soundEnabled = isSoundEnabled()

  // Schedule data
  const scheduleItems = loadSchedule()
  const totalScheduled = scheduleItems.reduce((t, s) => t + s.scheduled_qty, 0)
  const totalShipped = scheduleItems.reduce((t, s) => t + s.shipped_qty, 0)
  const schedulePct = totalScheduled > 0 ? Math.min(100, Math.round((totalShipped / totalScheduled) * 100)) : 0
  const scheduleInfo = scheduleItems.length > 0 ? scheduleItems[0] : null
  const weekNumber = scheduleInfo?.weekNumber || "N/A"
  const scheduleStatus = schedulePct === 100 ? "Complete" : schedulePct > 0 ? "In Progress" : "Not Started"

  // Attendance data
  const dailyRecords = getDailyAttendance(todayStr)
  const present = staff.filter(m => dailyRecords[m.id]?.status === "In").length
  const late = staff.filter(m => dailyRecords[m.id]?.status === "Late").length
  const sick = staff.filter(m => dailyRecords[m.id]?.status === "Sick").length
  const onHoliday = 0
  const attendanceComplete = isDailyAttendanceComplete(todayStr)

  // Low stock
  const lowStock = state.stock.filter(s => s.quantity <= 5)

  // Birthdays today
  const birthdaysToday = staff.filter(m => {
    if (!m.birthday) return false
    const bday = new Date(m.birthday + "T00:00:00")
    return bday.getMonth() === today.getMonth() && bday.getDate() === today.getDate()
  })

  // Reviews due
  const reviewsDue = staff.filter(m => {
    const reviewDate = getReviewDate(m.startDate)
    reviewDate.setHours(0, 0, 0, 0)
    const diffDays = Math.round((reviewDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    return diffDays >= 0 && diffDays <= 7
  })

  // Shutdowns
  const shutdowns = loadFactoryShutdowns()
  const upcomingShutdown = shutdowns.find(s => {
    const shutdownDate = new Date(s.date + "T00:00:00")
    shutdownDate.setHours(0, 0, 0, 0)
    const diffDays = Math.round((shutdownDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    return diffDays >= 0 && diffDays <= 7
  })

  // Determine traffic light status
  let trafficLight: { status: "green" | "amber" | "red"; label: string; reasons: string[] }
  const reasons: string[] = []

  if (lowStock.length > 0) reasons.push(`${lowStock.length} low stock item${lowStock.length > 1 ? "s" : ""}`)
  if (late > 0) reasons.push(`${late} late staff`)
  if (!attendanceComplete) reasons.push("Attendance incomplete")
  if (schedulePct < 50 && scheduleItems.length > 0) reasons.push("Schedule delayed")
  if (sick > 2) reasons.push(`${sick} staff sick`)

  if (reasons.length === 0) {
    trafficLight = { status: "green", label: "ON TARGET", reasons: ["Everything running normally"] }
  } else if (reasons.length <= 2 && !reasons.some(r => r.includes("critical") || r.includes("delayed"))) {
    trafficLight = { status: "amber", label: "ATTENTION REQUIRED", reasons }
  } else {
    trafficLight = { status: "red", label: "ACTION REQUIRED", reasons }
  }

  content.innerHTML = `
    <div class="factory-display">
      <!-- Live Factory Status Banner (Andon Board) -->
      <div class="factory-status-banner factory-status-banner-${statusResult.status}">
        <div class="factory-status-icon">${statusResult.status === "green" ? "🟢" : statusResult.status === "amber" ? "🟠" : "🔴"}</div>
        <div class="factory-status-content">
          <div class="factory-status-label">${statusResult.label}</div>
          <div class="factory-status-reasons">${statusResult.reasons.join(" • ")}</div>
        </div>
        <div class="factory-status-settings">
          <label for="soundToggle">Enable Shop Floor Alerts</label>
          <input type="checkbox" id="soundToggle" ${soundEnabled ? "checked" : ""} />
        </div>
      </div>

      <!-- Header -->
      <div class="factory-header">
        <div class="factory-logo">
          <div class="factory-logo-icon">CIC</div>
          <div class="factory-logo-text">
            <div class="factory-logo-title">Factory Control Centre</div>
            <div class="factory-logo-subtitle">Core Stock Management</div>
          </div>
        </div>
        <div class="factory-header-info">
          <div class="factory-week">Week ${weekNumber}</div>
          <div class="factory-date">${formatDate(todayStr)}</div>
          <div class="factory-time" id="liveClock">${today.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</div>
          <div class="factory-status" style="color:${schedulePct > 0 ? "var(--success)" : "var(--text-muted)"}">
            ${scheduleStatus}
          </div>
        </div>
      </div>

      <!-- Traffic Light Status -->
      <div class="traffic-light-container">
        <div class="traffic-light traffic-light-${trafficLight.status}">
          <div class="traffic-light-icon">${trafficLight.status === "green" ? "🟢" : trafficLight.status === "amber" ? "🟠" : "🔴"}</div>
          <div class="traffic-light-label">${trafficLight.label}</div>
          <div class="traffic-light-reasons">${trafficLight.reasons.join(" • ")}</div>
        </div>
      </div>

      <!-- Production Cards -->
      <div class="production-cards">
        <div class="prod-card">
          <div class="prod-card-icon">📦</div>
          <div class="prod-card-content">
            <div class="prod-card-label">Jobs Completed</div>
            <div class="prod-card-value">${totalShipped}</div>
          </div>
        </div>
        <div class="prod-card">
          <div class="prod-card-icon">📋</div>
          <div class="prod-card-content">
            <div class="prod-card-label">Jobs Remaining</div>
            <div class="prod-card-value">${Math.max(0, totalScheduled - totalShipped)}</div>
          </div>
        </div>
        <div class="prod-card">
          <div class="prod-card-icon">🚛</div>
          <div class="prod-card-content">
            <div class="prod-card-label">Cores Shipped Today</div>
            <div class="prod-card-value">${totalShipped}</div>
          </div>
        </div>
        <div class="prod-card">
          <div class="prod-card-icon">📊</div>
          <div class="prod-card-content">
            <div class="prod-card-label">Schedule Progress</div>
            <div class="prod-card-value">${schedulePct}%</div>
          </div>
        </div>
      </div>

      <!-- Schedule Progress Bar -->
      <div class="schedule-progress-section">
        <div class="schedule-progress-header">
          <div class="schedule-progress-label">Schedule Progress</div>
          <div class="schedule-progress-stats">
            <span style="color:var(--success)">${schedulePct}% Complete</span>
            <span style="color:var(--warning)">${100 - schedulePct}% Remaining</span>
          </div>
        </div>
        <div class="schedule-progress-bar-large">
          <div class="schedule-progress-fill-large" style="width:${schedulePct}%;background:${schedulePct === 100 ? "var(--success)" : schedulePct > 50 ? "var(--success)" : schedulePct > 25 ? "var(--warning)" : "var(--danger)"}"></div>
        </div>
        <div class="schedule-progress-eta">Estimated Completion: ${schedulePct === 100 ? "Complete" : "In Progress"}</div>
      </div>

      <!-- Main Content Grid -->
      <div class="factory-grid">
        <!-- Low Stock -->
        <div class="factory-panel">
          <div class="factory-panel-header">
            <span class="factory-panel-icon">⚠️</span>
            <span class="factory-panel-title">Low Stock Alert</span>
          </div>
          <div class="factory-panel-content">
            ${lowStock.length > 0 ? lowStock.map(item => {
              const shortage = 10 - item.quantity
              return `
                <div class="low-stock-card">
                  <div class="low-stock-core">${item.core}</div>
                  <div class="low-stock-details">
                    <div class="low-stock-row">
                      <span>Current:</span>
                      <span class="low-stock-value">${item.quantity}</span>
                    </div>
                    <div class="low-stock-row">
                      <span>Minimum:</span>
                      <span class="low-stock-value">10</span>
                    </div>
                    <div class="low-stock-row low-stock-shortage">
                      <span>Need:</span>
                      <span class="low-stock-value">${shortage}</span>
                    </div>
                  </div>
                </div>
              `
            }).join("") : '<div class="factory-empty">No low stock items</div>'}
          </div>
        </div>

        <!-- Today's Staff -->
        <div class="factory-panel">
          <div class="factory-panel-header">
            <span class="factory-panel-icon">👷</span>
            <span class="factory-panel-title">Today's Staff</span>
          </div>
          <div class="factory-panel-content">
            <div class="staff-stats-grid">
              <div class="staff-stat staff-stat-present">
                <div class="staff-stat-icon">🟢</div>
                <div class="staff-stat-value">${present}</div>
                <div class="staff-stat-label">Present</div>
              </div>
              <div class="staff-stat staff-stat-late">
                <div class="staff-stat-icon">🕒</div>
                <div class="staff-stat-value">${late}</div>
                <div class="staff-stat-label">Late</div>
              </div>
              <div class="staff-stat staff-stat-sick">
                <div class="staff-stat-icon">🤒</div>
                <div class="staff-stat-value">${sick}</div>
                <div class="staff-stat-label">Sick</div>
              </div>
              <div class="staff-stat staff-stat-holiday">
                <div class="staff-stat-icon">🏖️</div>
                <div class="staff-stat-value">${onHoliday}</div>
                <div class="staff-stat-label">On Holiday</div>
              </div>
            </div>
            ${!attendanceComplete ? '<div class="factory-alert">⚠️ Attendance not yet complete</div>' : ''}
          </div>
        </div>

        <!-- Birthdays -->
        ${birthdaysToday.length > 0 ? `
        <div class="factory-panel factory-panel-birthday">
          <div class="factory-panel-header">
            <span class="factory-panel-icon">🎂</span>
            <span class="factory-panel-title">Happy Birthday!</span>
          </div>
          <div class="factory-panel-content">
            ${birthdaysToday.map(m => `<div class="birthday-name">${m.name}</div>`).join("")}
          </div>
        </div>
        ` : ''}

        <!-- Factory Shutdown -->
        ${upcomingShutdown ? `
        <div class="factory-panel factory-panel-shutdown">
          <div class="factory-panel-header">
            <span class="factory-panel-icon">🏭</span>
            <span class="factory-panel-title">Factory Shutdown</span>
          </div>
          <div class="factory-panel-content">
            <div class="shutdown-countdown">
              <div class="shutdown-days">${Math.max(0, Math.round((new Date(upcomingShutdown.date + "T00:00:00").getTime() - today.getTime()) / (1000 * 60 * 60 * 24)))}</div>
              <div class="shutdown-label">Days Remaining</div>
            </div>
            <div class="shutdown-title">${upcomingShutdown.title}</div>
          </div>
        </div>
        ` : ''}

        <!-- Employment Reviews -->
        ${reviewsDue.length > 0 ? `
        <div class="factory-panel factory-panel-reviews">
          <div class="factory-panel-header">
            <span class="factory-panel-icon">📋</span>
            <span class="factory-panel-title">Reviews Due</span>
          </div>
          <div class="factory-panel-content">
            ${reviewsDue.map(m => `<div class="review-name">${m.name}</div>`).join("")}
          </div>
        </div>
        ` : ''}
      </div>

      <!-- News Ticker -->
      <div class="news-ticker-container">
        <div class="news-ticker-label">📢</div>
        <div class="news-ticker-wrapper">
          <div class="news-ticker-content" id="newsTicker">
            ${buildTickerContent(lowStock, birthdaysToday, upcomingShutdown, reviewsDue, attendanceComplete)}
          </div>
        </div>
      </div>
    </div>
  `

  // Live clock update
  setInterval(() => {
    const clockEl = content.querySelector("#liveClock")
    if (clockEl) {
      clockEl.textContent = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    }
  }, 1000)

  // Sound toggle handler
  const soundToggle = content.querySelector("#soundToggle") as HTMLInputElement | null
  if (soundToggle) {
    soundToggle.addEventListener("change", (e) => {
      setSoundEnabled((e.target as HTMLInputElement).checked)
    })
  }

  // Auto-refresh every 30 seconds
  setInterval(() => {
    const app = document.querySelector<HTMLDivElement>("#app")!
    if (app.contains(content)) {
      app.replaceChildren(renderFactoryDisplay())
    }
  }, 30000)

  return Layout("", content)
}

function buildTickerContent(
  lowStock: any[],
  birthdaysToday: StaffMember[],
  upcomingShutdown: FactoryShutdown | undefined,
  reviewsDue: StaffMember[],
  attendanceComplete: boolean
): string {
  const items: string[] = []

  // Birthdays
  if (birthdaysToday.length > 0) {
    items.push(`🎂 Happy Birthday to ${birthdaysToday.map(m => m.name).join(" & ")}`)
  }

  // Factory shutdowns
  if (upcomingShutdown) {
    const days = Math.max(0, Math.round((new Date(upcomingShutdown.date + "T00:00:00").getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)))
    items.push(`🏭 Factory Shutdown: ${upcomingShutdown.title} - ${days} day${days !== 1 ? "s" : ""} remaining`)
  }

  // Employment reviews
  if (reviewsDue.length > 0) {
    items.push(`📋 Employment Reviews Due: ${reviewsDue.map(m => m.name).join(", ")}`)
  }

  // Attendance
  if (!attendanceComplete) {
    items.push(`⚠️ Daily Attendance Not Completed - Please complete today's attendance register`)
  } else {
    items.push(`✅ Attendance Complete for Today`)
  }

  // Low stock
  if (lowStock.length > 0) {
    items.push(`⚠️ Low Stock Alert: ${lowStock.length} item${lowStock.length > 1 ? "s" : ""} below minimum - ${lowStock.map(s => s.core).join(", ")}`)
  }

  // Manual notifications
  const manualNotifs = loadManualNotifications()
  for (const notif of manualNotifs) {
    items.push(`📢 ${notif.message}`)
  }

  // General
  if (items.length === 0) {
    items.push("Welcome to CIC Factory Control Centre - All systems operational")
  }

  return items.map(item => `<span class="ticker-item">${item}</span>`).join("")
}