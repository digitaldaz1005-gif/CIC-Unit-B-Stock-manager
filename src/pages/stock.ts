import { Layout } from "../layout/layout"
import { state } from "../services/state"
import { upsertStockItem, addMovement, saveAdjustment } from "../supabase"
import { showToast } from "../components/toast"
import { refreshData } from "../services/refresh"
import { getCurrentUser, promptForUser } from "../services/userService"
import { loadSchedule } from "../services/scheduleService"

let searchEl: HTMLInputElement
let lowStockEl: HTMLInputElement
let zeroStockEl: HTMLInputElement
let tbodyEl: HTMLElement
let sortKey: string = "core"
let sortAsc: boolean = true

const ADJUSTMENT_REASONS = [
  "Stock Count Correction",
  "Damaged",
  "Found Stock",
  "Used for Job",
  "Other",
]

function getFilteredRows() {
  const search = state.searchTerm.toLowerCase()

  return state.stock.filter(item => {
    if (search && !item.core.toLowerCase().includes(search)) {
      return false
    }
    if (state.lowStockOnly && item.quantity > (item.low_stock_trigger ?? 0)) return false
    if (state.zeroStockOnly && item.quantity !== 0) return false
    return true
  })
}

function getSortedRows() {
  const filtered = getFilteredRows()
  return filtered.sort((a, b) => {
    let valA: any, valB: any
    switch (sortKey) {
      case "core": valA = a.core.toLowerCase(); valB = b.core.toLowerCase(); break
      case "quantity": valA = a.quantity; valB = b.quantity; break
      case "minimum_stock": valA = a.minimum_stock; valB = b.minimum_stock; break
      case "low_stock_trigger": valA = a.low_stock_trigger ?? 0; valB = b.low_stock_trigger ?? 0; break
      default: valA = a.core.toLowerCase(); valB = b.core.toLowerCase()
    }
    if (valA < valB) return sortAsc ? -1 : 1
    if (valA > valB) return sortAsc ? 1 : -1
    return 0
  })
}

function setSort(key: string) {
  if (sortKey === key) {
    sortAsc = !sortAsc
  } else {
    sortKey = key
    sortAsc = true
  }
  renderTable()
}

function renderTable() {
  if (!tbodyEl) return

  const sorted = getSortedRows()

  if (sorted.length === 0) {
    tbodyEl.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted);">
          ${state.stock.length === 0 ? "No stock items yet." : "No items match your filters."}
        </td>
      </tr>
    `
    return
  }

  tbodyEl.innerHTML = sorted
    .map(item => {
      let qtyClass = "qty-ok"
      const trigger = item.low_stock_trigger ?? 0
      const isLow = item.quantity <= trigger
      if (item.quantity === 0) qtyClass = "qty-zero"
      else if (isLow) qtyClass = "qty-low"

      const rowStyle = isLow ? `style="background:rgba(229,57,53,0.08);"` : ""

      return `
      <tr ${rowStyle}>
        <td><strong>${item.core}</strong>${isLow ? ' <span style="color:var(--danger);font-size:12px;">⚠</span>' : ""}</td>
        <td class="${qtyClass}">${item.quantity}</td>
        <td>${item.minimum_stock}</td>
        <td>
          <input type="number" min="0" value="${trigger}" class="stock-trigger-input" data-core="${item.core}" style="width:70px;height:28px;padding:0 6px;border:1px solid var(--border-light);border-radius:var(--radius-sm);text-align:center;font-size:13px;" />
        </td>
        <td>${item.last_updated ?? "-"}</td>
        <td>
          <div style="display:flex;align-items:center;gap:4px;">
            <button class="stock-adj-btn stock-adj-minus" data-core="${item.core}" title="Remove stock" style="width:28px;height:28px;border:1px solid var(--border-light);background:var(--bg);color:var(--danger);border-radius:var(--radius-sm);cursor:pointer;font-weight:700;font-size:16px;display:flex;align-items:center;justify-content:center;">−</button>
            <input type="number" min="1" value="1" class="stock-adj-input" data-core="${item.core}" style="width:50px;height:28px;padding:0 6px;border:1px solid var(--border-light);border-radius:var(--radius-sm);text-align:center;font-size:13px;" />
            <select class="stock-adj-reason" data-core="${item.core}" style="height:28px;padding:0 6px;border:1px solid var(--border-light);border-radius:var(--radius-sm);font-size:12px;max-width:140px;">
              ${ADJUSTMENT_REASONS.map(r => `<option value="${r}">${r}</option>`).join("")}
            </select>
            <button class="stock-adj-btn stock-adj-plus" data-core="${item.core}" title="Add stock" style="width:28px;height:28px;border:1px solid var(--border-light);background:var(--bg);color:var(--success);border-radius:var(--radius-sm);cursor:pointer;font-weight:700;font-size:16px;display:flex;align-items:center;justify-content:center;">+</button>
          </div>
        </td>
      </tr>`
    })
    .join("")
}

function onFilterChange() {
  state.searchTerm = searchEl?.value ?? ""
  state.lowStockOnly = lowStockEl?.checked ?? false
  state.zeroStockOnly = zeroStockEl?.checked ?? false
  renderTable()
}

async function saveTrigger(core: string, value: number) {
  const stock = state.stock.find(s => s.core === core)
  if (!stock) return
  stock.low_stock_trigger = value
  stock.last_updated = new Date().toLocaleString()
  try {
    await upsertStockItem(stock)
    await refreshData()
    renderTable()
  } catch (err: any) {
    showToast(err?.message ?? "Failed to save trigger.", "error")
  }
}

async function applyAdjustment(core: string, type: "ADD" | "REMOVE", quantity: number, reason: string) {
  if (!quantity || quantity < 1) {
    showToast("Please enter a valid quantity.", "error")
    return
  }
  if (!reason) {
    showToast("Please choose an adjustment reason.", "error")
    return
  }

  const stock = state.stock.find(s => s.core === core)
  if (!stock) {
    showToast(`Core "${core}" not found in stock.`, "error")
    return
  }
  if (type === "REMOVE" && stock.quantity < quantity) {
    showToast(`Not enough stock. Available: ${stock.quantity}`, "error")
    return
  }

  let user = getCurrentUser()
  if (!user) {
    user = promptForUser()
    if (!user) {
      showToast("Operator name is required.", "error")
      return
    }
  }

  try {
    if (type === "ADD") stock.quantity += quantity
    else stock.quantity -= quantity

    stock.last_updated = new Date().toLocaleString()
    await upsertStockItem(stock)

    const adjustment = {
      core,
      adjustment_type: type,
      quantity,
      reason,
      operator: user,
      date: new Date().toLocaleString(),
    }

    state.adjustments.unshift(adjustment)
    await saveAdjustment(adjustment)

    await addMovement({
      type: "ADJUSTMENT",
      core,
      quantity: type === "ADD" ? quantity : -quantity,
      reason,
      user: user,
      date: new Date().toLocaleString(),
    })

    showToast(`Adjustment recorded: ${type} ${quantity} × ${core}.`, "success")
    await refreshData()
    renderTable()
  } catch (err: any) {
    showToast(err?.message ?? "Failed to save adjustment.", "error")
  }
}

function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

function printStockReport() {
  const now = new Date()
  const isoWeek = getISOWeekNumber(now)
  const dateStr = now.toLocaleDateString()
  const timeStr = now.toLocaleTimeString()

  const lowStockItems = state.stock.filter(s => s.quantity <= (s.low_stock_trigger ?? 0))

  const scheduleItems = loadSchedule()
  const thisWeek = String(isoWeek)
  const shippedThisWeek = scheduleItems.filter(s => s.shipped_qty > 0 && (s.weekNumber === thisWeek || s.scheduleDate === thisWeek))

  const printWindow = window.open("", "_blank", "width=900,height=700")
  if (!printWindow) {
    showToast("Please allow popups to print the report.", "error")
    return
  }

  const stockRows = state.stock.map(s => `
    <tr>
      <td style="padding:6px 12px;border:1px solid #ddd;">${s.core}</td>
      <td style="padding:6px 12px;border:1px solid #ddd;text-align:right;">${s.quantity}</td>
    </tr>
  `).join("")

  const lowStockRows = lowStockItems.length > 0
    ? lowStockItems.map(s => {
        const trigger = s.low_stock_trigger ?? 0
        const shortBy = trigger - s.quantity
        return `
        <tr>
          <td style="padding:6px 12px;border:1px solid #ddd;">${s.core}</td>
          <td style="padding:6px 12px;border:1px solid #ddd;text-align:right;">${s.quantity}</td>
          <td style="padding:6px 12px;border:1px solid #ddd;text-align:right;">${trigger}</td>
          <td style="padding:6px 12px;border:1px solid #ddd;text-align:right;color:#c62828;">${shortBy}</td>
        </tr>`
      }).join("")
    : ""

  const shippedRows = shippedThisWeek.length > 0
    ? shippedThisWeek.map(s => {
        const overshipped = s.shipped_qty > s.scheduled_qty ? s.shipped_qty - s.scheduled_qty : 0
        return `
        <tr>
          <td style="padding:6px 12px;border:1px solid #ddd;">${s.core}</td>
          <td style="padding:6px 12px;border:1px solid #ddd;text-align:right;">${s.scheduled_qty}</td>
          <td style="padding:6px 12px;border:1px solid #ddd;text-align:right;">${s.shipped_qty}</td>
          ${overshipped > 0 ? `<td style="padding:6px 12px;border:1px solid #ddd;text-align:right;color:#c62828;">Overshipped: ${overshipped}</td>` : `<td style="padding:6px 12px;border:1px solid #ddd;"></td>`}
        </tr>`
      }).join("")
    : ""

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Stock Report - ${dateStr}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; color: #222; margin: 32px; }
        .report-header { display:flex; align-items:center; justify-content:space-between; border-bottom: 2px solid #333; padding-bottom: 16px; margin-bottom: 24px; }
        .report-header h1 { margin: 0; font-size: 24px; }
        .report-header .meta { text-align: right; font-size: 13px; color: #555; }
        .logo { max-height: 60px; max-width: 200px; object-fit: contain; }
        h2 { font-size: 18px; margin-top: 32px; margin-bottom: 12px; border-bottom: 1px solid #ccc; padding-bottom: 6px; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th { background: #f5f5f5; padding: 8px 12px; border: 1px solid #ddd; text-align: left; font-weight: 600; }
        .section-empty { font-style: italic; color: #666; padding: 12px; }
        @media print {
          body { margin: 16px; }
        }
      </style>
    </head>
    <body>
      <div class="report-header">
        <div>
          <img src="/New logo.webp" alt="Company Logo" class="logo" onerror="this.style.display='none'">
          <h1>Stock Report</h1>
        </div>
        <div class="meta">
          <div><strong>Date:</strong> ${dateStr}</div>
          <div><strong>Time:</strong> ${timeStr}</div>
          <div><strong>ISO Week:</strong> ${isoWeek}</div>
        </div>
      </div>

      <h2>Stock</h2>
      <table>
        <thead>
          <tr>
            <th style="padding:8px 12px;border:1px solid #ddd;">Core Number</th>
            <th style="padding:8px 12px;border:1px solid #ddd;text-align:right;">Current Stock Quantity</th>
          </tr>
        </thead>
        <tbody>
          ${stockRows || `<tr><td colspan="2" class="section-empty">No stock items.</td></tr>`}
        </tbody>
      </table>

      <h2>Low Stock Warnings</h2>
      <table>
        <thead>
          <tr>
            <th style="padding:8px 12px;border:1px solid #ddd;">Core Number</th>
            <th style="padding:8px 12px;border:1px solid #ddd;text-align:right;">Current Stock</th>
            <th style="padding:8px 12px;border:1px solid #ddd;text-align:right;">Trigger Level</th>
            <th style="padding:8px 12px;border:1px solid #ddd;text-align:right;">Short By</th>
          </tr>
        </thead>
        <tbody>
          ${lowStockRows || `<tr><td colspan="4" class="section-empty">No Low Stock Warnings.</td></tr>`}
        </tbody>
      </table>

      <h2>Cores Shipped This Week</h2>
      <table>
        <thead>
          <tr>
            <th style="padding:8px 12px;border:1px solid #ddd;">Core Number</th>
            <th style="padding:8px 12px;border:1px solid #ddd;text-align:right;">Scheduled Quantity</th>
            <th style="padding:8px 12px;border:1px solid #ddd;text-align:right;">Actual Quantity Shipped</th>
            <th style="padding:8px 12px;border:1px solid #ddd;text-align:right;">Overshipped</th>
          </tr>
        </thead>
        <tbody>
          ${shippedRows || `<tr><td colspan="4" class="section-empty">No cores shipped this week.</td></tr>`}
        </tbody>
      </table>

      <script>
        window.onload = function() { window.print(); }
      </script>
    </body>
    </html>
  `)
  printWindow.document.close()
}

export function renderStock(): HTMLElement {
  const content = document.createElement("div")

  content.innerHTML = `
    <div class="toolbar">
      <input type="text" id="search" placeholder="Search core number..." value="${state.searchTerm}">

      <label>
        <input type="checkbox" id="lowStock" ${state.lowStockOnly ? "checked" : ""}>
        Low Stock Only
      </label>

      <label>
        <input type="checkbox" id="zeroStock" ${state.zeroStockOnly ? "checked" : ""}>
        Zero Stock Only
      </label>

      <button type="button" id="printReportBtn" style="margin-left:auto;width:auto;padding:8px 16px;background:var(--primary);color:#fff;border:none;border-radius:var(--radius-sm);font-size:13px;font-weight:600;cursor:pointer;">🖨 Print Stock Report</button>
    </div>

    <div class="table-container">
      <table class="table">
        <thead>
          <tr>
            <th class="sortable" data-sort="core">Core <span class="sort-arrow">${sortKey === "core" ? (sortAsc ? "▲" : "▼") : ""}</span></th>
            <th class="sortable" data-sort="quantity">Qty <span class="sort-arrow">${sortKey === "quantity" ? (sortAsc ? "▲" : "▼") : ""}</span></th>
            <th class="sortable" data-sort="minimum_stock">Min <span class="sort-arrow">${sortKey === "minimum_stock" ? (sortAsc ? "▲" : "▼") : ""}</span></th>
            <th class="sortable" data-sort="low_stock_trigger">Low Stock Trigger <span class="sort-arrow">${sortKey === "low_stock_trigger" ? (sortAsc ? "▲" : "▼") : ""}</span></th>
            <th>Updated</th>
            <th>Adjustment</th>
          </tr>
        </thead>
        <tbody id="stockTbody"></tbody>
      </table>
    </div>
  `

  searchEl = content.querySelector("#search") as HTMLInputElement
  lowStockEl = content.querySelector("#lowStock") as HTMLInputElement
  zeroStockEl = content.querySelector("#zeroStock") as HTMLInputElement
  tbodyEl = content.querySelector("#stockTbody") as HTMLElement

  searchEl.oninput = onFilterChange
  lowStockEl.onchange = onFilterChange
  zeroStockEl.onchange = onFilterChange

  // Print report button
  const printBtn = content.querySelector("#printReportBtn") as HTMLButtonElement
  printBtn.onclick = printStockReport

  // Sort handlers
  content.querySelectorAll(".sortable").forEach(th => {
    th.addEventListener("click", () => {
      const key = (th as HTMLElement).getAttribute("data-sort")!
      setSort(key)
    })
  })

  // Trigger input change (save low stock trigger)
  content.addEventListener("change", async (e: Event) => {
    const target = e.target as HTMLElement
    if (!target.classList.contains("stock-trigger-input")) return
    const core = target.dataset.core
    if (!core) return
    const value = Number((target as HTMLInputElement).value) || 0
    await saveTrigger(core, value)
  })

  // Adjustment handlers (event delegation)
  content.addEventListener("click", async (e: Event) => {
    const target = e.target as HTMLElement
    if (!target.classList.contains("stock-adj-btn")) return
    const core = target.dataset.core
    if (!core) return
    const input = content.querySelector(`.stock-adj-input[data-core="${core}"]`) as HTMLInputElement
    const reasonSelect = content.querySelector(`.stock-adj-reason[data-core="${core}"]`) as HTMLSelectElement
    const qty = Number(input?.value || 1)
    const reason = reasonSelect?.value || ""
    if (target.classList.contains("stock-adj-plus")) {
      await applyAdjustment(core, "ADD", qty, reason)
    } else if (target.classList.contains("stock-adj-minus")) {
      await applyAdjustment(core, "REMOVE", qty, reason)
    }
  })

  renderTable()

  return Layout("Stock", content)
}