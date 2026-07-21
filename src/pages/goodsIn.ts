import { Layout } from "../layout/layout"
import { state } from "../services/state"
import { upsertStockItem, addMovement } from "../supabase"
import { showToast } from "../components/toast"
import { refreshData } from "../services/refresh"

export function renderGoodsIn(): HTMLElement {
  const content = document.createElement("div")

  // Build core options from stock (same dropdown pattern as Shipping)
  const coreOptions = state.stock
    .map(s => `<option value="${s.core}">${s.core} (${s.quantity} in stock)</option>`)
    .join("")

  content.innerHTML = `
    <div class="form-section">

      <form class="form" id="goodsInForm">
        <div class="form-header">Receive Stock</div>

        <div class="form-group">
          <label>Core Number</label>
          <select id="core" required>
            <option value="">Select a core...</option>
            ${coreOptions}
          </select>
        </div>

        <div class="form-group">
          <label>Quantity</label>
          <input id="quantity" type="number" min="1" placeholder="0" required>
        </div>

        <button type="submit">Receive Stock</button>
      </form>

      <div class="table-container">
        <table class="table">
          <thead>
            <tr>
              <th>Core</th>
              <th>Qty</th>
              <th>Min</th>
            </tr>
          </thead>
          <tbody>
            ${state.stock.length === 0
              ? `<tr><td colspan="3" style="text-align:center;padding:40px;color:var(--text-muted);">No stock items yet.</td></tr>`
              : state.stock.map(item => `
                <tr>
                  <td><strong>${item.core}</strong></td>
                  <td>${item.quantity}</td>
                  <td>${item.minimum_stock}</td>
                </tr>
              `).join("")
            }
          </tbody>
        </table>
      </div>

    </div>
  `

  const form = content.querySelector("#goodsInForm") as HTMLFormElement

  form.onsubmit = async (e) => {
    e.preventDefault()

    const core = (content.querySelector("#core") as HTMLSelectElement).value.trim()
    const quantity = Number((content.querySelector("#quantity") as HTMLInputElement).value)

    if (!core || quantity < 1) {
      showToast("Please fill in all fields.", "error")
      return
    }

    const submitBtn = form.querySelector("button")!
    submitBtn.disabled = true
    submitBtn.textContent = "Processing..."

    try {
      const existing = state.stock.find(s => s.core === core)

      if (existing) {
        existing.quantity += quantity
        existing.last_updated = new Date().toLocaleString()
        existing.minimum_stock ??= 0
        existing.low_stock_trigger ??= 0
        await upsertStockItem(existing)
      } else {
        const item = {
          core,
          quantity,
          minimum_stock: 0,
          low_stock_trigger: 0,
          last_updated: new Date().toLocaleString(),
        }
        state.stock.push(item)
        await upsertStockItem(item)
      }

      await addMovement({
        type: "IN",
        core,
        quantity,
        date: new Date().toLocaleString(),
      })

      showToast(`Received ${quantity} × ${core} successfully.`, "success")
      form.reset()
      await refreshData()
    } catch (err: any) {
      showToast(err?.message ?? "Failed to receive stock.", "error")
    } finally {
      submitBtn.disabled = false
      submitBtn.textContent = "Receive Stock"
    }
  }

  return Layout("Goods In", content)
}