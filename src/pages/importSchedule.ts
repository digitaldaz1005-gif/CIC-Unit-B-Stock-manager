import { Layout } from "../layout/layout"
import {
  parseScheduleSheet,
  getSheetNames,
  loadSchedule,
  saveSchedule,
  loadCarryovers,
  deleteScheduleItems,
  createMissingStockItems,
} from "../services/scheduleService"
import { showToast } from "../components/toast"
import { refreshData } from "../services/refresh"

export function renderImportSchedule(): HTMLElement {
  const content = document.createElement("div")
  let scheduleItems = loadSchedule()
  let carryovers = loadCarryovers()

  const renderTables = () => {
    scheduleItems = loadSchedule()
    carryovers = loadCarryovers()

    // Schedule table
    const scheduleBody = content.querySelector("#scheduleTbody")
    if (scheduleBody) {
      const hasItems = scheduleItems.length > 0
      if (!hasItems) {
        scheduleBody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted);">No schedule imported yet. Upload an Excel file to begin.</td></tr>`
      } else {
        scheduleBody.innerHTML = scheduleItems.map(item => {
          const pct = item.scheduled_qty > 0 ? Math.min(100, Math.round((item.shipped_qty / item.scheduled_qty) * 100)) : 0
          let barColor = "var(--success)"
          if (pct > 0 && pct < 50) barColor = "var(--warning)"
          else if (pct === 0) barColor = "var(--text-muted)"
          return `
          <tr>
            <td><input type="checkbox" class="schedule-row-check" data-core="${item.core}" style="cursor:pointer;" /></td>
            <td><strong>${item.core}</strong></td>
            <td>${item.scheduled_qty}</td>
            <td>${item.shipped_qty}</td>
            <td>${item.remaining}</td>
            <td>${item.carryover > 0 ? `+${item.carryover}` : "-"}</td>
            <td>
              <div class="schedule-progress-bar">
                <div class="schedule-progress-fill" style="width:${pct}%;background:${barColor};"></div>
              </div>
              <span class="schedule-progress-label">${pct}%</span>
            </td>
          </tr>`
        }).join("")
      }
    }

    // Carryover table
    const carryBody = content.querySelector("#carryoverTbody")
    if (carryBody) {
      const hasCarry = carryovers.length > 0
      if (!hasCarry) {
        carryBody.innerHTML = `<tr><td colspan="3" style="text-align:center;padding:20px;color:var(--text-muted);">No pending carryovers.</td></tr>`
      } else {
        carryBody.innerHTML = carryovers.map(c => `
          <tr>
            <td><strong>${c.core}</strong></td>
            <td class="qty-low">+${c.carryover}</td>
            <td>${c.lastUpdated}</td>
          </tr>
        `).join("")
      }
    }
  }

  content.innerHTML = `
    <div class="form-section">

      <form class="form" id="importForm">
        <div class="form-header">Import Schedule</div>

        <div class="form-group">
          <label>Upload Excel File</label>
          <input id="excelFile" type="file" accept=".xls,.xlsx,.xlsm" required>
          <p style="color:var(--text-muted);font-size:12px;margin-top:4px;">
            Supports .xls, .xlsx and .xlsm. Expects spreadsheet format: Cell C2 = Schedule Date/Week, Row 20+: Col D=Core, Col F=Scheduled Qty
          </p>
        </div>

        <div class="form-group" style="flex-direction:row;gap:12px;">
          <button type="submit" style="flex:1;">Import Schedule</button>
          <button type="button" id="clearScheduleBtn" class="secondary" style="flex:0 0 auto;width:auto;padding:12px 20px;background:var(--bg);border:1px solid var(--border-light);color:var(--text);border-radius:var(--radius-sm);font-size:14px;font-weight:600;cursor:pointer;">Clear All</button>
        </div>
      </form>

      <div>
        <!-- Current Schedule -->
        <div class="table-container" style="margin-bottom:20px;">
          <div style="padding:12px 16px;border-bottom:1px solid var(--border);font-weight:600;color:var(--text-secondary);font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">
            Current Schedule
          </div>
          <table class="table">
            <thead>
              <tr>
                <th style="width:40px;"><input type="checkbox" id="selectAllSchedule" title="Select all" style="cursor:pointer;" /></th>
                <th>Core</th>
                <th>Scheduled</th>
                <th>Shipped</th>
                <th>Remaining</th>
                <th>Carryover</th>
                <th>Progress</th>
              </tr>
            </thead>
            <tbody id="scheduleTbody"></tbody>
          </table>
          <div style="padding:12px 16px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;">
            <button type="button" id="deleteSelectedBtn" style="background:#e53935;color:#fff;border:none;border-radius:var(--radius-sm);padding:8px 16px;cursor:pointer;font-size:13px;font-weight:600;">Delete Selected</button>
          </div>
        </div>

        <!-- Carryovers -->
        <div class="table-container">
          <div style="padding:12px 16px;border-bottom:1px solid var(--border);font-weight:600;color:var(--text-secondary);font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">
            Pending Carryovers (over-delivery)
          </div>
          <table class="table">
            <thead>
              <tr>
                <th>Core</th>
                <th>Carryover</th>
                <th>Last Updated</th>
              </tr>
            </thead>
            <tbody id="carryoverTbody"></tbody>
          </table>
        </div>
      </div>

    </div>
  `

  // Render initial tables
  renderTables()

  // Select all checkbox
  const selectAll = content.querySelector("#selectAllSchedule") as HTMLInputElement
  selectAll.onchange = () => {
    const checked = selectAll.checked
    content.querySelectorAll(".schedule-row-check").forEach((cb: Element) => {
      ;(cb as HTMLInputElement).checked = checked
    })
  }

  // Delete selected button
  const deleteSelectedBtn = content.querySelector("#deleteSelectedBtn") as HTMLButtonElement
  deleteSelectedBtn.onclick = () => {
    const checked: string[] = []
    content.querySelectorAll(".schedule-row-check").forEach((cb: Element) => {
      const input = cb as HTMLInputElement
      if (input.checked) {
        const core = input.getAttribute("data-core")
        if (core) checked.push(core)
      }
    })
    if (checked.length === 0) {
      showToast("No rows selected.", "error")
      return
    }
    if (!confirm(`Delete ${checked.length} selected schedule row(s)?`)) return
    const deleted = deleteScheduleItems(checked)
    renderTables()
    selectAll.checked = false
    showToast(`Deleted ${deleted} schedule row(s).`, "info")
  }

  // Clear button
  const clearBtn = content.querySelector("#clearScheduleBtn") as HTMLButtonElement
  clearBtn.onclick = () => {
    saveSchedule([])
    scheduleItems = []
    carryovers = []
    ;(content.querySelector("#excelFile") as HTMLInputElement).value = ""
    renderTables()
    selectAll.checked = false
    showToast("Schedule cleared.", "info")
  }

  // Form submit — auto-import immediately on file selection
  const form = content.querySelector("#importForm") as HTMLFormElement
  const fileInput = content.querySelector("#excelFile") as HTMLInputElement

  const importFile = async (file: File) => {
    const submitBtn = form.querySelector("button[type=submit]")!

    submitBtn.setAttribute("disabled", "true")
    submitBtn.textContent = "Importing..."

    try {
      const data = await file.arrayBuffer()
      const sheetNames = getSheetNames(data)
      const sheetName = sheetNames.length > 0 ? sheetNames[0] : ""

      const result = parseScheduleSheet(data, sheetName)
      if (result.items.length === 0) {
        showToast("No valid items found in the file.", "error")
        submitBtn.removeAttribute("disabled")
        submitBtn.textContent = "Import Schedule"
        return
      }

      const createdCores = await createMissingStockItems(result.items)
      renderTables()
      if (createdCores > 0) await refreshData()
      if (createdCores > 0) {
        showToast(`Imported ${result.items.length} schedule item(s). Week: ${result.scheduleDate || "N/A"}. Created ${createdCores} new core(s) in stock.`, "success")
      } else {
        showToast(`Imported ${result.items.length} schedule item(s). Week: ${result.scheduleDate || "N/A"}. No new cores created.`, "success")
      }
      ;(content.querySelector("#excelFile") as HTMLInputElement).value = ""
    } catch (err: any) {
      showToast(err?.message ?? "Failed to import schedule.", "error")
    } finally {
      submitBtn.removeAttribute("disabled")
      submitBtn.textContent = "Import Schedule"
    }
  }

  // Auto-import immediately when file is selected
  fileInput.onchange = async () => {
    if (!fileInput.files || fileInput.files.length === 0) return
    const file = fileInput.files[0]
    await importFile(file)
  }

  // Allow form submit to also trigger import (for accessibility)
  form.onsubmit = async (e) => {
    e.preventDefault()
    if (!fileInput.files || fileInput.files.length === 0) {
      showToast("Please choose an Excel file.", "error")
      return
    }
    await importFile(fileInput.files[0])
  }

  return Layout("Import Schedule", content)
}