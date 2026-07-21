import { Layout } from "../layout/layout"
import { showToast } from "../components/toast"
import {
  loadStaff,
  addStaffMember,
  updateStaffMember,
  deleteStaffMember,
  addAttendance,
  updateAttendance,
  deleteAttendance,
  getAttendanceStats,
  setDailyAttendance,
  getDailyAttendance,
  bookHoliday,
  loadManualNotifications,
  addManualNotification,
  deleteManualNotification,
  loadFactoryShutdowns,
  addFactoryShutdown,
  deleteFactoryShutdown,
  type StaffMember,
  type AttendanceEntry,
  type FactoryShutdown,
} from "../services/staffService"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  const targetMonth = d.getMonth() + months
  const targetYear = d.getFullYear() + Math.floor(targetMonth / 12)
  const finalMonth = ((targetMonth % 12) + 12) % 12
  d.setFullYear(targetYear, finalMonth, d.getDate())
  return d
}

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
  return addMonths(d, 3)
}

function getDaysEmployed(startDate: string): number {
  const start = new Date(startDate + "T00:00:00")
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  start.setHours(0, 0, 0, 0)
  return Math.round((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
}

function getNextBirthdayDate(birthday: string): Date {
  const bday = new Date(birthday + "T00:00:00")
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const thisYear = new Date(today.getFullYear(), bday.getMonth(), bday.getDate())
  thisYear.setHours(0, 0, 0, 0)

  if (thisYear < today) {
    return new Date(today.getFullYear() + 1, bday.getMonth(), bday.getDate())
  }
  return thisYear
}

function getReviewStatus(startDate: string): { label: string; color: string } {
  const reviewDate = getReviewDate(startDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  reviewDate.setHours(0, 0, 0, 0)

  const diffDays = Math.round(
    (reviewDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  )

  if (diffDays > 7) {
    return { label: "", color: "" }
  } else if (diffDays >= 0) {
    return {
      label: `🟠 Review Due in ${diffDays} Day${diffDays !== 1 ? "s" : ""}`,
      color: "qty-low",
    }
  } else if (diffDays >= -7) {
    const overdueDays = Math.abs(diffDays)
    return {
      label: `🔴 Review Overdue by ${overdueDays} Day${overdueDays !== 1 ? "s" : ""}`,
      color: "qty-zero",
    }
  } else {
    return { label: "🟢 Review Completed", color: "qty-ok" }
  }
}

function escapeHtml(str: string): string {
  const entity = (name: string) => "&" + name + ";"
  return str
    .replace(/&/g, entity("amp"))
    .replace(/</g, entity("lt"))
    .replace(/>/g, entity("gt"))
    .replace(/"/g, entity("quot"))
    .replace(/'/g, entity("#039"))
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let selectedStaffId: string | null = null
let showDailyAttendance = false
let showCalendar = false

// ---------------------------------------------------------------------------
// Main render
// ---------------------------------------------------------------------------

export function renderStaff(): HTMLElement {
  const content = document.createElement("div")
  const staff = loadStaff()

  // If a staff member is selected, show their profile
  if (selectedStaffId) {
    const member = staff.find(s => s.id === selectedStaffId)
    if (member) {
      return Layout("Staff Profile", renderProfile(member))
    }
    selectedStaffId = null
  }

  // If calendar view is active
  if (showCalendar) {
    return Layout("Staff Calendar", renderCalendar())
  }

  // If daily attendance view is active
  if (showDailyAttendance) {
    return Layout("Daily Attendance", renderDailyAttendance())
  }

  content.innerHTML = `
    <div class="staff-layout">
      ${renderStaffList(staff)}
      ${renderNotificationPanel()}
    </div>

    <div style="margin-top:20px;display:flex;gap:12px;flex-wrap:wrap;">
      <button class="action-btn" id="dailyAttendanceBtn" style="width:auto;min-width:auto;padding:14px 24px;background:linear-gradient(135deg, var(--blue), var(--blue-dark));color:#fff;border:none;">
        <span class="action-icon">📋</span>
        <span>Daily Attendance</span>
      </button>
      <button class="action-btn" id="calendarBtn" style="width:auto;min-width:auto;padding:14px 24px;background:linear-gradient(135deg, var(--info), var(--blue-dark));color:#fff;border:none;">
        <span class="action-icon">📅</span>
        <span>Staff Calendar</span>
      </button>
    </div>
  `

  attachStaffListHandlers(content)
  attachNotificationHandlers(content)

  // Daily Attendance button
  content.querySelector("#dailyAttendanceBtn")?.addEventListener("click", () => {
    showDailyAttendance = true
    refreshPage()
  })

  // Calendar button
  content.querySelector("#calendarBtn")?.addEventListener("click", () => {
    showCalendar = true
    refreshPage()
  })

  return Layout("Staff", content)
}

// ---------------------------------------------------------------------------
// Staff list
// ---------------------------------------------------------------------------

function renderStaffList(staff: StaffMember[]): string {
  const rows = staff.length > 0
    ? staff.map(s => {
        const { lateDays, sickDays } = getAttendanceStats(s)
        const reviewDate = getReviewDate(s.startDate)
        const reviewStr = formatDate(reviewDate.toISOString().split("T")[0])
        return `
        <tr class="staff-row" data-id="${s.id}" style="cursor:pointer;">
          <td><strong>${escapeHtml(s.name)}</strong></td>
          <td>${escapeHtml(s.department)}</td>
          <td>${formatDate(s.startDate)}</td>
          <td>${formatDate(s.birthday)}</td>
          <td><span class="badge badge-warning">${lateDays}</span></td>
          <td><span class="badge badge-danger">${sickDays}</span></td>
          <td>${reviewStr}</td>
        </tr>`
      }).join("")
    : `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted);">No staff members yet. Add one below.</td></tr>`

  return `
    <div class="staff-list-section">
      <div class="form-section">
        <form class="form" id="addStaffForm">
          <div class="form-header">Add Staff Member</div>

          <div class="form-group">
            <label>Name</label>
            <input id="staffName" placeholder="Full name" required>
          </div>

          <div class="form-group">
            <label>Department</label>
            <input id="staffDept" placeholder="Department" required>
          </div>

          <div class="form-group">
            <label>Start Date</label>
            <input id="staffStart" type="date" required>
          </div>

          <div class="form-group">
            <label>Birthday</label>
            <input id="staffBirthday" type="date" required>
          </div>

          <div class="form-group">
            <label>Holiday Entitlement (days)</label>
            <input id="staffHolidayEnt" type="number" min="0" value="25" required>
          </div>

          <div class="form-group">
            <label>Holiday Taken (days)</label>
            <input id="staffHolidayTaken" type="number" min="0" value="0" required>
          </div>

          <button type="submit">Add Staff</button>
        </form>

        <div class="table-container">
          <table class="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Department</th>
                <th>Start Date</th>
                <th>Birthday</th>
                <th>Late</th>
                <th>Sick</th>
                <th>3-Month Review</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `
}

function attachStaffListHandlers(content: HTMLElement) {
  // Add staff form
  const form = content.querySelector("#addStaffForm") as HTMLFormElement | null
  if (form) {
    form.onsubmit = (e: Event) => {
      e.preventDefault()
      const name = (content.querySelector("#staffName") as HTMLInputElement).value.trim()
      const department = (content.querySelector("#staffDept") as HTMLInputElement).value.trim()
      const startDate = (content.querySelector("#staffStart") as HTMLInputElement).value
      const birthday = (content.querySelector("#staffBirthday") as HTMLInputElement).value
      const holidayEntitlement = Number((content.querySelector("#staffHolidayEnt") as HTMLInputElement).value)
      const holidayTaken = Number((content.querySelector("#staffHolidayTaken") as HTMLInputElement).value)

      if (!name || !department || !startDate || !birthday) {
        showToast("Please fill in all fields.", "error")
        return
      }

      addStaffMember({
        name,
        department,
        startDate,
        birthday,
        holidayEntitlement,
        holidayTaken,
      })

      showToast(`Staff member "${name}" added.`, "success")
      form.reset()
      ;(content.querySelector("#staffHolidayEnt") as HTMLInputElement).value = "25"
      ;(content.querySelector("#staffHolidayTaken") as HTMLInputElement).value = "0"
      refreshPage()
    }
  }

  // Row click -> open profile
  content.querySelectorAll(".staff-row").forEach(row => {
    row.addEventListener("click", () => {
      selectedStaffId = row.getAttribute("data-id")
      refreshPage()
    })
  })
}

// ---------------------------------------------------------------------------
// Staff profile
// ---------------------------------------------------------------------------

function renderProfile(member: StaffMember): HTMLElement {
  const content = document.createElement("div")
  const { lateDays, sickDays } = getAttendanceStats(member)
  const holidayRemaining = member.holidayEntitlement - member.holidayTaken
  const reviewDate = getReviewDate(member.startDate)
  const daysEmployed = getDaysEmployed(member.startDate)
  const nextBday = getNextBirthdayDate(member.birthday)
  const reviewStatus = getReviewStatus(member.startDate)

  // Sort attendance by date descending
  const attendance = [...member.attendance].sort((a, b) =>
    b.date.localeCompare(a.date)
  )

  content.innerHTML = `
    <button class="action-btn" id="backBtn" style="margin-bottom:20px;width:auto;min-width:auto;padding:10px 16px;">
      <span class="action-icon">←</span>
      <span>Back to Staff</span>
    </button>

    <!-- Employee Dashboard Card -->
    <div class="employee-dashboard-card">
      <div class="emp-card-header">
        <div class="emp-card-avatar">${escapeHtml(member.name.charAt(0).toUpperCase())}</div>
        <div class="emp-card-name-section">
          <h2 class="emp-card-name">${escapeHtml(member.name)}</h2>
          <span class="emp-card-dept">${escapeHtml(member.department)}</span>
        </div>
      </div>
      <div class="emp-card-stats">
        <div class="emp-stat">
          <span class="emp-stat-label">Start Date</span>
          <span class="emp-stat-value">${formatDate(member.startDate)}</span>
        </div>
        <div class="emp-stat">
          <span class="emp-stat-label">Days Employed</span>
          <span class="emp-stat-value">${daysEmployed}</span>
        </div>
        <div class="emp-stat">
          <span class="emp-stat-label">Holiday Remaining</span>
          <span class="emp-stat-value ${holidayRemaining < 0 ? "qty-low" : "qty-ok"}">${holidayRemaining} days</span>
        </div>
        <div class="emp-stat">
          <span class="emp-stat-label">Total Late Days</span>
          <span class="emp-stat-value qty-low">${lateDays}</span>
        </div>
        <div class="emp-stat">
          <span class="emp-stat-label">Total Sick Days</span>
          <span class="emp-stat-value qty-zero">${sickDays}</span>
        </div>
        <div class="emp-stat">
          <span class="emp-stat-label">Next Birthday</span>
          <span class="emp-stat-value">${formatDate(nextBday.toISOString().split("T")[0])}</span>
        </div>
        <div class="emp-stat emp-stat-wide">
          <span class="emp-stat-label">Three-Month Review</span>
          <span class="emp-stat-value">${formatDate(reviewDate.toISOString().split("T")[0])}</span>
          ${reviewStatus.label ? `<span class="emp-stat-review ${reviewStatus.color}">${reviewStatus.label}</span>` : ""}
        </div>
      </div>
    </div>

    <div class="profile-grid">
      <!-- Summary panel -->
      <div class="profile-summary">
        <h3 class="section-title">Profile Summary</h3>
        <div class="summary-grid">
          <div class="summary-item">
            <span class="summary-label">Department</span>
            <span class="summary-value">${escapeHtml(member.department)}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Start Date</span>
            <span class="summary-value">${formatDate(member.startDate)}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Birthday</span>
            <span class="summary-value">${formatDate(member.birthday)}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Holiday Entitlement</span>
            <span class="summary-value">${member.holidayEntitlement} days</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Holiday Taken</span>
            <span class="summary-value">${member.holidayTaken} days</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Holiday Remaining</span>
            <span class="summary-value ${holidayRemaining < 0 ? "qty-low" : "qty-ok"}">${holidayRemaining} days</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Total Late Days</span>
            <span class="summary-value qty-low">${lateDays}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Total Sick Days</span>
            <span class="summary-value qty-zero">${sickDays}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">3-Month Review</span>
            <span class="summary-value">${formatDate(reviewDate.toISOString().split("T")[0])}</span>
          </div>
        </div>

        <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap;">
          <button class="action-btn" id="editStaffBtn" style="width:auto;min-width:auto;padding:8px 14px;font-size:13px;">
            <span class="action-icon">✏️</span><span>Edit</span>
          </button>
          <button class="action-btn" id="deleteStaffBtn" style="width:auto;min-width:auto;padding:8px 14px;font-size:13px;border-color:var(--danger);color:var(--danger);">
            <span class="action-icon">🗑️</span><span>Delete</span>
          </button>
        </div>
      </div>

      <!-- Holiday booking section -->
      <div class="profile-holidays">
        <h3 class="section-title">Holiday Booking</h3>
        
        <form id="holidayForm" class="form" style="margin-bottom:20px;">
          <div class="form-group">
            <label>Start Date</label>
            <input id="holidayStart" type="date" required>
          </div>
          <div class="form-group">
            <label>End Date</label>
            <input id="holidayEnd" type="date" required>
          </div>
          <div class="form-group">
            <label>Notes (optional)</label>
            <input id="holidayNotes" placeholder="Optional notes">
          </div>
          <button type="submit">Book Holiday</button>
        </form>

        <div class="holiday-summary">
          <div class="holiday-stat">
            <span class="holiday-stat-label">Entitlement</span>
            <span class="holiday-stat-value">${member.holidayEntitlement} days</span>
          </div>
          <div class="holiday-stat">
            <span class="holiday-stat-label">Taken</span>
            <span class="holiday-stat-value">${member.holidayTaken} days</span>
          </div>
          <div class="holiday-stat">
            <span class="holiday-stat-label">Remaining</span>
            <span class="holiday-stat-value ${holidayRemaining < 0 ? "qty-low" : "qty-ok"}">${holidayRemaining} days</span>
          </div>
        </div>
      </div>

      <!-- Attendance section -->
      <div class="profile-attendance">
        <h3 class="section-title">Attendance</h3>

        <div class="attendance-actions">
          <button class="action-btn" id="markLateBtn" style="width:auto;min-width:auto;padding:10px 18px;border-color:var(--warning);color:var(--warning);">
            <span class="action-icon">⏰</span><span>Mark Late Today</span>
          </button>
          <button class="action-btn" id="markSickBtn" style="width:auto;min-width:auto;padding:10px 18px;border-color:var(--danger);color:var(--danger);">
            <span class="action-icon">🤒</span><span>Mark Sick Today</span>
          </button>
        </div>

        <div class="table-container" style="margin-top:16px;">
          <table class="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Status</th>
                <th>Notes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="attendanceBody">
              ${attendance.length > 0
                ? attendance.map(a => `
                  <tr data-entry-id="${a.id}">
                    <td>${formatDate(a.date)}</td>
                    <td><span class="badge ${a.status === "Late" ? "badge-warning" : "badge-danger"}">${a.status}</span></td>
                    <td>${escapeHtml(a.notes || "-")}</td>
                    <td>
                      <button class="att-edit-btn" data-staff-id="${member.id}" data-entry-id="${a.id}" style="width:auto;min-width:auto;padding:4px 10px;font-size:12px;border:1px solid var(--border-light);background:var(--bg);color:var(--text);border-radius:var(--radius-sm);cursor:pointer;">Edit</button>
                      <button class="att-delete-btn" data-staff-id="${member.id}" data-entry-id="${a.id}" style="width:auto;min-width:auto;padding:4px 10px;font-size:12px;border:1px solid var(--danger);background:var(--bg);color:var(--danger);border-radius:var(--radius-sm);cursor:pointer;">Delete</button>
                    </td>
                  </tr>
                `).join("")
                : `<tr><td colspan="4" style="text-align:center;padding:30px;color:var(--text-muted);">No attendance entries yet.</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `

  // Back button
  content.querySelector("#backBtn")?.addEventListener("click", () => {
    selectedStaffId = null
    refreshPage()
  })

  // Holiday booking form
  const holidayForm = content.querySelector("#holidayForm") as HTMLFormElement | null
  if (holidayForm) {
    holidayForm.onsubmit = (e: Event) => {
      e.preventDefault()
      const startDate = (content.querySelector("#holidayStart") as HTMLInputElement).value
      const endDate = (content.querySelector("#holidayEnd") as HTMLInputElement).value

      if (!startDate || !endDate) {
        showToast("Please select start and end dates.", "error")
        return
      }

      if (bookHoliday(member.id, startDate, endDate)) {
        showToast("Holiday booked successfully.", "success")
        holidayForm.reset()
        refreshPage()
      } else {
        showToast("Failed to book holiday.", "error")
      }
    }
  }

  // Mark Late / Sick
  content.querySelector("#markLateBtn")?.addEventListener("click", () => {
    const notes = prompt("Optional notes for being late:", "") || ""
    if (addAttendance(member.id, "Late", notes)) {
      showToast("Marked Late for today.", "success")
      refreshPage()
    } else {
      showToast("Failed to mark late.", "error")
    }
  })

  content.querySelector("#markSickBtn")?.addEventListener("click", () => {
    const notes = prompt("Optional notes for being sick:", "") || ""
    if (addAttendance(member.id, "Sick", notes)) {
      showToast("Marked Sick for today.", "success")
      refreshPage()
    } else {
      showToast("Failed to mark sick.", "error")
    }
  })

  // Edit / Delete staff
  content.querySelector("#editStaffBtn")?.addEventListener("click", () => {
    openEditModal(member)
  })

  content.querySelector("#deleteStaffBtn")?.addEventListener("click", () => {
    if (confirm(`Delete staff member "${member.name}"? This cannot be undone.`)) {
      deleteStaffMember(member.id)
      selectedStaffId = null
      showToast("Staff member deleted.", "success")
      refreshPage()
    }
  })

  // Attendance edit / delete
  content.querySelectorAll(".att-edit-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const staffId = btn.getAttribute("data-staff-id")!
      const entryId = btn.getAttribute("data-entry-id")!
      openAttendanceEditModal(staffId, entryId)
    })
  })

  content.querySelectorAll(".att-delete-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const staffId = btn.getAttribute("data-staff-id")!
      const entryId = btn.getAttribute("data-entry-id")!
      if (confirm("Delete this attendance entry?")) {
        if (deleteAttendance(staffId, entryId)) {
          showToast("Attendance entry deleted.", "success")
          refreshPage()
        } else {
          showToast("Failed to delete entry.", "error")
        }
      }
    })
  })

  return content
}

// ---------------------------------------------------------------------------
// Edit staff modal
// ---------------------------------------------------------------------------

function openEditModal(member: StaffMember) {
  const overlay = document.createElement("div")
  overlay.className = "modal-overlay"

  overlay.innerHTML = `
    <div class="modal-card">
      <div class="modal-header">Edit Staff Member</div>
      <form id="editStaffForm" class="modal-form">
        <div class="form-group">
          <label>Name</label>
          <input id="editName" value="${escapeHtml(member.name)}" required>
        </div>
        <div class="form-group">
          <label>Department</label>
          <input id="editDept" value="${escapeHtml(member.department)}" required>
        </div>
        <div class="form-group">
          <label>Start Date</label>
          <input id="editStart" type="date" value="${member.startDate}" required>
        </div>
        <div class="form-group">
          <label>Birthday</label>
          <input id="editBirthday" type="date" value="${member.birthday}" required>
        </div>
        <div class="form-group">
          <label>Holiday Entitlement (days)</label>
          <input id="editHolidayEnt" type="number" min="0" value="${member.holidayEntitlement}" required>
        </div>
        <div class="form-group">
          <label>Holiday Taken (days)</label>
          <input id="editHolidayTaken" type="number" min="0" value="${member.holidayTaken}" required>
        </div>
        <div class="modal-actions">
          <button type="button" class="action-btn modal-cancel" style="width:auto;min-width:auto;padding:10px 18px;"><span>Cancel</span></button>
          <button type="submit" class="action-btn" style="width:auto;min-width:auto;padding:10px 18px;background:linear-gradient(135deg, var(--red), var(--red-dark));color:#fff;border:none;"><span>Save Changes</span></button>
        </div>
      </form>
    </div>
  `

  document.body.appendChild(overlay)

  const close = () => overlay.remove()
  overlay.addEventListener("click", e => {
    if (e.target === overlay) close()
  })
  overlay.querySelector(".modal-cancel")?.addEventListener("click", close)

  const form = overlay.querySelector("#editStaffForm") as HTMLFormElement
  form.onsubmit = (e: Event) => {
    e.preventDefault()
    const name = (overlay.querySelector("#editName") as HTMLInputElement).value.trim()
    const department = (overlay.querySelector("#editDept") as HTMLInputElement).value.trim()
    const startDate = (overlay.querySelector("#editStart") as HTMLInputElement).value
    const birthday = (overlay.querySelector("#editBirthday") as HTMLInputElement).value
    const holidayEntitlement = Number((overlay.querySelector("#editHolidayEnt") as HTMLInputElement).value)
    const holidayTaken = Number((overlay.querySelector("#editHolidayTaken") as HTMLInputElement).value)

    if (!name || !department || !startDate || !birthday) {
      showToast("Please fill in all fields.", "error")
      return
    }

    updateStaffMember(member.id, {
      name,
      department,
      startDate,
      birthday,
      holidayEntitlement,
      holidayTaken,
    })

    showToast("Staff member updated.", "success")
    close()
    refreshPage()
  }
}

// ---------------------------------------------------------------------------
// Attendance edit modal
// ---------------------------------------------------------------------------

function openAttendanceEditModal(staffId: string, entryId: string) {
  const member = loadStaff().find(s => s.id === staffId)
  if (!member) return
  const entry = member.attendance.find(a => a.id === entryId)
  if (!entry) return

  const overlay = document.createElement("div")
  overlay.className = "modal-overlay"

  overlay.innerHTML = `
    <div class="modal-card">
      <div class="modal-header">Edit Attendance Entry</div>
      <form id="editAttForm" class="modal-form">
        <div class="form-group">
          <label>Date</label>
          <input id="attDate" type="date" value="${entry.date}" required>
        </div>
        <div class="form-group">
          <label>Status</label>
          <select id="attStatus">
            <option value="Late" ${entry.status === "Late" ? "selected" : ""}>Late</option>
            <option value="Sick" ${entry.status === "Sick" ? "selected" : ""}>Sick</option>
          </select>
        </div>
        <div class="form-group">
          <label>Notes</label>
          <input id="attNotes" value="${escapeHtml(entry.notes || "")}" placeholder="Optional notes">
        </div>
        <div class="modal-actions">
          <button type="button" class="action-btn modal-cancel" style="width:auto;min-width:auto;padding:10px 18px;"><span>Cancel</span></button>
          <button type="submit" class="action-btn" style="width:auto;min-width:auto;padding:10px 18px;background:linear-gradient(135deg, var(--red), var(--red-dark));color:#fff;border:none;"><span>Save</span></button>
        </div>
      </form>
    </div>
  `

  document.body.appendChild(overlay)

  const close = () => overlay.remove()
  overlay.addEventListener("click", e => {
    if (e.target === overlay) close()
  })
  overlay.querySelector(".modal-cancel")?.addEventListener("click", close)

  const form = overlay.querySelector("#editAttForm") as HTMLFormElement
  form.onsubmit = (e: Event) => {
    e.preventDefault()
    const date = (overlay.querySelector("#attDate") as HTMLInputElement).value
    const status = (overlay.querySelector("#attStatus") as HTMLSelectElement).value as "Late" | "Sick"
    const notes = (overlay.querySelector("#attNotes") as HTMLInputElement).value.trim()

    if (!date) {
      showToast("Date is required.", "error")
      return
    }

    const updates: Partial<AttendanceEntry> = { date, status, notes: notes || undefined }
    if (updateAttendance(staffId, entryId, updates)) {
      showToast("Attendance entry updated.", "success")
      close()
      refreshPage()
    } else {
      showToast("Failed to update entry.", "error")
    }
  }
}

// ---------------------------------------------------------------------------
// Notification panel (manual + factory shutdowns)
// ---------------------------------------------------------------------------

function renderNotificationPanel(): string {
  const manualNotifs = loadManualNotifications()
  const shutdowns = loadFactoryShutdowns()

  return `
    <div class="notification-panel">
      <h3 class="section-title">Dashboard Notifications</h3>

      <!-- Manual notifications -->
      <div class="notif-subsection">
        <h4 class="notif-subtitle">📢 Manual Notifications</h4>
        <form id="addManualNotifForm" class="notif-form">
          <input id="manualNotifMsg" placeholder="Notification message..." required>
          <button type="submit" class="action-btn" style="width:auto;min-width:auto;padding:10px 18px;">Add</button>
        </form>
        <div class="notif-list">
          ${manualNotifs.length > 0
            ? manualNotifs.map(n => `
              <div class="notif-item">
                <span class="notif-item-text">${escapeHtml(n.message)}</span>
                <button class="notif-delete-btn" data-notif-id="${n.id}" title="Delete">✕</button>
              </div>
            `).join("")
            : `<div style="color:var(--text-muted);font-size:13px;padding:8px 0;">No manual notifications.</div>`
          }
        </div>
      </div>

      <!-- Factory shutdowns -->
      <div class="notif-subsection">
        <h4 class="notif-subtitle">⚠ Factory Shutdowns</h4>
        <form id="addShutdownForm" class="notif-form">
          <input id="shutdownTitle" placeholder="Shutdown title..." required>
          <input id="shutdownDate" type="date" required>
          <button type="submit" class="action-btn" style="width:auto;min-width:auto;padding:10px 18px;">Add</button>
        </form>
        <div class="notif-list">
          ${shutdowns.length > 0
            ? shutdowns.map(s => `
              <div class="notif-item">
                <span class="notif-item-text"><strong>${escapeHtml(s.title)}</strong> — ${formatDate(s.date)}</span>
                <button class="shutdown-delete-btn" data-shutdown-id="${s.id}" title="Delete">✕</button>
              </div>
            `).join("")
            : `<div style="color:var(--text-muted);font-size:13px;padding:8px 0;">No factory shutdowns.</div>`
          }
        </div>
      </div>
    </div>
  `
}

function attachNotificationHandlers(content: HTMLElement) {
  // Add manual notification
  const manualForm = content.querySelector("#addManualNotifForm") as HTMLFormElement | null
  if (manualForm) {
    manualForm.onsubmit = (e: Event) => {
      e.preventDefault()
      const msg = (content.querySelector("#manualNotifMsg") as HTMLInputElement).value.trim()
      if (!msg) {
        showToast("Please enter a message.", "error")
        return
      }
      addManualNotification(msg)
      showToast("Notification added.", "success")
      manualForm.reset()
      refreshPage()
    }
  }

  // Delete manual notification
  content.querySelectorAll(".notif-delete-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-notif-id")!
      if (deleteManualNotification(id)) {
        showToast("Notification deleted.", "success")
        refreshPage()
      }
    })
  })

  // Add factory shutdown
  const shutdownForm = content.querySelector("#addShutdownForm") as HTMLFormElement | null
  if (shutdownForm) {
    shutdownForm.onsubmit = (e: Event) => {
      e.preventDefault()
      const title = (content.querySelector("#shutdownTitle") as HTMLInputElement).value.trim()
      const date = (content.querySelector("#shutdownDate") as HTMLInputElement).value
      if (!title || !date) {
        showToast("Please enter title and date.", "error")
        return
      }
      addFactoryShutdown(title, date)
      showToast("Factory shutdown added.", "success")
      shutdownForm.reset()
      refreshPage()
    }
  }

  // Delete factory shutdown
  content.querySelectorAll(".shutdown-delete-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-shutdown-id")!
      if (deleteFactoryShutdown(id)) {
        showToast("Shutdown deleted.", "success")
        refreshPage()
      }
    })
  })
}

// ---------------------------------------------------------------------------
// Daily Attendance
// ---------------------------------------------------------------------------

function renderDailyAttendance(): HTMLElement {
  const content = document.createElement("div")
  const staff = loadStaff()
  const today = new Date().toISOString().split("T")[0]

  const dailyRecords = getDailyAttendance(today)

  content.innerHTML = `
    <button class="action-btn" id="backToStaffBtn" style="margin-bottom:20px;width:auto;min-width:auto;padding:10px 16px;">
      <span class="action-icon">←</span>
      <span>Back to Staff</span>
    </button>

    <div class="daily-attendance-header">
      <h2 class="daily-attendance-title">Daily Attendance Register</h2>
      <div class="daily-attendance-date">
        <span class="daily-attendance-label">Date:</span>
        <span class="daily-attendance-value">${formatDate(today)}</span>
      </div>
    </div>

    <div class="daily-attendance-list">
      ${staff.length > 0 ? staff.map(member => {
        const record = dailyRecords[member.id]
        const status = record ? record.status : null
        return `
        <div class="daily-attendance-row" data-staff-id="${member.id}">
          <div class="daily-attendance-name">
            <div class="daily-attendance-avatar">${escapeHtml(member.name.charAt(0).toUpperCase())}</div>
            <div>
              <div class="daily-attendance-staff-name">${escapeHtml(member.name)}</div>
              <div class="daily-attendance-staff-dept">${escapeHtml(member.department)}</div>
            </div>
          </div>
          <div class="daily-attendance-buttons">
            <button class="att-btn att-btn-in ${status === "In" ? "active" : ""}" data-staff-id="${member.id}" data-status="In">
              <span class="att-btn-icon">🟢</span>
              <span>In</span>
            </button>
            <button class="att-btn att-btn-late ${status === "Late" ? "active" : ""}" data-staff-id="${member.id}" data-status="Late">
              <span class="att-btn-icon">🟠</span>
              <span>Late</span>
            </button>
            <button class="att-btn att-btn-sick ${status === "Sick" ? "active" : ""}" data-staff-id="${member.id}" data-status="Sick">
              <span class="att-btn-icon">🔴</span>
              <span>Sick / Absent</span>
            </button>
          </div>
        </div>
      `
      }).join("") : `<div style="text-align:center;padding:40px;color:var(--text-muted);">No staff members yet.</div>`}
    </div>

    <div class="daily-attendance-submit">
      <button class="action-btn" id="submitDailyAttendance" style="width:auto;min-width:auto;padding:14px 32px;background:linear-gradient(135deg, var(--red), var(--red-dark));color:#fff;border:none;font-size:16px;">
        <span class="action-icon">✅</span>
        <span>Submit Attendance</span>
      </button>
    </div>
  `

  // Back button
  content.querySelector("#backToStaffBtn")?.addEventListener("click", () => {
    showDailyAttendance = false
    refreshPage()
  })

  // Attendance button handlers
  content.querySelectorAll(".att-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const staffId = btn.getAttribute("data-staff-id")!
      const status = btn.getAttribute("data-status") as "In" | "Late" | "Sick"
      setDailyAttendance(staffId, today, status)
      
      // Update UI
      const row = btn.closest(".daily-attendance-row")
      if (row) {
        row.querySelectorAll(".att-btn").forEach(b => b.classList.remove("active"))
        btn.classList.add("active")
      }
    })
  })

  // Submit handler
  content.querySelector("#submitDailyAttendance")?.addEventListener("click", () => {
    const incomplete = staff.filter(m => !dailyRecords[m.id] && !getDailyAttendance(today)[m.id])
    if (incomplete.length > 0) {
      showToast(`Please mark attendance for all staff. ${incomplete.length} remaining.`, "error")
      return
    }
    
    showToast("Today's Attendance Completed", "success")
    showDailyAttendance = false
    refreshPage()
  })

  return content
}

// ---------------------------------------------------------------------------
// Staff Calendar
// ---------------------------------------------------------------------------

function renderCalendar(): HTMLElement {
  const content = document.createElement("div")
  const staff = loadStaff()
  const shutdowns = loadFactoryShutdowns()
  const today = new Date()
  const currentMonth = today.getMonth()
  const currentYear = today.getFullYear()

  // Get first day of month and total days
  const firstDay = new Date(currentYear, currentMonth, 1)
  const lastDay = new Date(currentYear, currentMonth + 1, 0)
  const daysInMonth = lastDay.getDate()
  const startDayOfWeek = firstDay.getDay() // 0 = Sunday

  // Build calendar grid
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  const monthName = today.toLocaleDateString("en-GB", { month: "long", year: "numeric" })

  let calendarHTML = `
    <button class="action-btn" id="backToStaffBtn2" style="margin-bottom:20px;width:auto;min-width:auto;padding:10px 16px;">
      <span class="action-icon">←</span>
      <span>Back to Staff</span>
    </button>

    <div class="staff-calendar-header">
      <h2 class="staff-calendar-title">Staff Calendar</h2>
      <div class="staff-calendar-month">${monthName}</div>
    </div>

    <div class="staff-calendar-grid">
      ${dayNames.map(d => `<div class="calendar-day-name">${d}</div>`).join("")}
  `

  // Empty cells for days before the first day of month
  for (let i = 0; i < startDayOfWeek; i++) {
    calendarHTML += `<div class="calendar-day empty"></div>`
  }

  // Days of the month
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    const isToday = dateStr === today.toISOString().split("T")[0]

    // Find events for this day
    const events: string[] = []

    // Check birthdays
    for (const member of staff) {
      if (member.birthday) {
        const bday = new Date(member.birthday + "T00:00:00")
        if (bday.getMonth() === currentMonth && bday.getDate() === day) {
          events.push(`🎂 ${member.name.split(" ")[0]}`)
        }
      }
    }

    // Check factory shutdowns
    for (const shutdown of shutdowns) {
      if (shutdown.date === dateStr) {
        events.push(`⚠ ${shutdown.title}`)
      }
    }

    calendarHTML += `
      <div class="calendar-day ${isToday ? "today" : ""}" data-date="${dateStr}">
        <div class="calendar-day-number">${day}</div>
        ${events.length > 0 ? `<div class="calendar-day-events">${events.join("<br>")}</div>` : ""}
      </div>
    `
  }

  calendarHTML += `</div>`

  // Day detail popup
  calendarHTML += `
    <div id="calendarDayDetail" class="calendar-day-detail" style="display:none;">
      <h3 class="calendar-detail-title">Day Details</h3>
      <div id="calendarDetailContent"></div>
      <button class="action-btn" id="closeCalendarDetail" style="margin-top:12px;width:auto;min-width:auto;padding:8px 16px;"><span>Close</span></button>
    </div>
  `

  content.innerHTML = calendarHTML

  // Back button
  content.querySelector("#backToStaffBtn2")?.addEventListener("click", () => {
    showCalendar = false
    refreshPage()
  })

  // Day click handler
  content.querySelectorAll(".calendar-day[data-date]").forEach(dayEl => {
    dayEl.addEventListener("click", () => {
      const dateStr = dayEl.getAttribute("data-date")!
      showDayDetail(dateStr, staff, shutdowns)
    })
  })

  // Close detail
  content.querySelector("#closeCalendarDetail")?.addEventListener("click", () => {
    const detail = content.querySelector("#calendarDayDetail") as HTMLElement
    if (detail) detail.style.display = "none"
  })

  return content
}

function showDayDetail(dateStr: string, staff: StaffMember[], shutdowns: FactoryShutdown[]) {
  const detail = document.querySelector("#calendarDayDetail")
  const detailContent = document.querySelector("#calendarDetailContent")
  if (!detail || !detailContent) return

  const events: string[] = []

  // Check birthdays
  for (const member of staff) {
    if (member.birthday) {
      const bday = new Date(member.birthday + "T00:00:00")
      const [, month, day] = dateStr.split("-").map(Number)
      if (bday.getMonth() === month - 1 && bday.getDate() === day) {
        events.push(`🎂 <strong>${member.name}</strong> - Birthday`)
      }
    }
  }

  // Check shutdowns
  for (const shutdown of shutdowns) {
    if (shutdown.date === dateStr) {
      events.push(`⚠ <strong>${shutdown.title}</strong> - Factory Shutdown`)
    }
  }

  const dateObj = new Date(dateStr + "T00:00:00")
  const formattedDate = dateObj.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })

  if (events.length === 0) {
    detailContent.innerHTML = `<p style="color:var(--text-muted);">No events on ${formattedDate}</p>`
  } else {
    detailContent.innerHTML = `
      <p style="margin-bottom:12px;color:var(--text-secondary);">${formattedDate}</p>
      <ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:8px;">
        ${events.map(e => `<li style="padding:8px 12px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);">${e}</li>`).join("")}
      </ul>
    `
  }

  ;(detail as HTMLElement).style.display = "block"
}

// ---------------------------------------------------------------------------
// Refresh
// ---------------------------------------------------------------------------

function refreshPage() {
  const app = document.querySelector<HTMLDivElement>("#app")!
  app.replaceChildren(renderStaff())
}
