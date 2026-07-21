import { Layout } from "../layout/layout"
import { state } from "../services/state"
import { saveAdjustment, addMovement, upsertStockItem } from "../supabase"
import { showToast } from "../components/toast"
import { refreshData } from "../services/refresh"

const ADJUSTMENT_REASONS = [
  "Stock Count Correction",
  "Damaged",
  "Found Stock",
  "Used for Job",
  "Other",
]

export function renderAdjustments(): HTMLElement {
  const content = document.createElement("div")

  const hasAdjustments = state.adjustments.length > 0

  const rows = hasAdjustments
    ? state.adjustments
        .map(
          a => `
      <tr>
        <td>${a.date}</td>
        <td><strong>${a.core}</strong></td>
        <td><span class="badge ${a.adjustment_type === "ADD" ? "badge-success" : "badge-danger"}">${a.adjustment_type}</span></td>
        <td>${a.quantity}</td>
        <td>${a.reason}</td>
        <td>${a.operator}</td>
      </tr>`
        )
        .join("")
    : ""

  const coreOptions = state.stock
    .map(s => `<option value="${s.core}">${s.core} (${s.quantity} in stock)</option>`)
    .join("")

  content.innerHTML = `
    <div class="form-section">
      <form class="form" id="adjustmentForm">
        <div class="form-header">Record Adjustment</div>

        <div class="form-group">
          <label>Core Number</label>
          <select id="core" required>
            <option value="">Select a core...</option>
            ${coreOptions}
          </select>
        </div>

        <div class="form-group">
          <label>Adjustment Type</label>
          <select id="adjType" required>
            <option value="ADD">Add Stock</option>
            <option value="REMOVE">Remove Stock</option>
          </select>
        </div>

        <div class="form-group">
          <label>Quantity</label>
          <input id="quantity" type="number" min="1" placeholder="0" required>
        </div>

        <div class="form-group">
          <label>Reason</label>
          <select id="reason" required>
            ${ADJUSTMENT_REASONS.map(r => `<option value="${r}">${r}</option>`).join("")}
          </select>
        </div>

        <div class="form-group">
          <label>Operator</label>
          <input id="operator" placeholder="Operator name" required>
        </div>

        <button type="submit">Record Adjustment</button>
      </form>

      <div class="table-container">
        <table class="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Core</th>
              <th>Type</th>
              <th>Qty</th>
              <th>Reason</th>
              <th>Operator</th>
            </tr>
          </thead>
          <tbody>
            ${hasAdjustments
              ? rows
              : `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted);">No adjustments recorded yet.</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </div>
  `

  const form = content.querySelector("#adjustmentForm") as HTMLFormElement

  form.onsubmit = async (e: Event) => {
    e.preventDefault()

    const core = (content.querySelector("#core") as HTMLSelectElement).value.trim()
    const adjType = (content.querySelector("#adjType") as HTMLSelectElement).value as "ADD" | "REMOVE"
    const quantity = Number((content.querySelector("#quantity") as HTMLInputElement).value)
    const reason = (content.querySelector("#reason") as HTMLSelectElement).value
    const operator = (content.querySelector("#operator") as HTMLInputElement).value.trim()

    if (!core || !quantity || quantity < 1 || !reason || !operator) {
      showToast("Please fill in all fields.", "error")
      return
    }

    const stock = state.stock.find(s => s.core === core)
    if (!stock) {
      showToast(`Core "${core}" not found in stock.`, "error")
      return
    }

    if (adjType === "REMOVE" && stock.quantity < quantity) {
      showToast(`Not enough stock. Available: ${stock.quantity}`, "error")
      return
    }

    const submitBtn = form.querySelector("button")!
    submitBtn.disabled = true
    submitBtn.textContent = "Processing..."

    try {
      if (adjType === "ADD") {
        stock.quantity += quantity
      } else {
        stock.quantity -= quantity
      }
      stock.last_updated = new Date().toLocaleString()
      await upsertStockItem(stock)

      const adjustment = {
        core,
        adjustment_type: adjType,
        quantity,
        reason,
        operator,
        date: new Date().toLocaleString(),
      }

      state.adjustments.unshift(adjustment)
      await saveAdjustment(adjustment)

      await addMovement({
        type: "ADJUSTMENT",
        core,
        quantity: adjType === "ADD" ? quantity : -quantity,
        reason,
        user: operator,
        date: new Date().toLocaleString(),
      })

      showToast(`Adjustment recorded: ${adjType} ${quantity} × ${core}.`, "success")
      form.reset()
      await refreshData()
    } catch (err: any) {
      showToast(err?.message ?? "Failed to record adjustment.", "error")
    } finally {
      submitBtn.disabled = false
      submitBtn.textContent = "Record Adjustment"
    }
  }

  return Layout("Adjustments", content)
}