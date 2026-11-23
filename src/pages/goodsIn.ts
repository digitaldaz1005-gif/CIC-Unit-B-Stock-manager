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

      <div style="display:flex;flex-direction:column;gap:20px;">
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

      <form class="form" id="addCoreForm">
        <div class="form-header">Add New Core</div>

        <div class="form-group">
          <label>Core Number</label>
          <input id="newCore" type="text" placeholder="e.g. TR12345" autocomplete="off" required>
        </div>

        <div class="form-group">
          <label>Starting Quantity</label>
          <input id="newCoreQty" type="number" min="0" value="0">
        </div>

        <div class="form-group">
          <label>Low Stock Trigger</label>
          <input id="newCoreTrigger" type="number" min="0" value="0">
        </div>

        <button type="submit">Add Core</button>
      </form>
      </div>

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

  const addCoreForm = content.querySelector("#addCoreForm") as HTMLFormElement

  addCoreForm.onsubmit = async (e) => {
    e.preventDefault()

    const core = (content.querySelector("#newCore") as HTMLInputElement).value.trim()
    const quantity = Math.max(0, Math.floor(Number((content.querySelector("#newCoreQty") as HTMLInputElement).value) || 0))
    const trigger = Math.max(0, Math.floor(Number((content.querySelector("#newCoreTrigger") as HTMLInputElement).value) || 0))

    if (!core) {
      showToast("Please enter a core number.", "error")
      return
    }

    if (state.stock.some(s => s.core.trim().toUpperCase() === core.toUpperCase())) {
      showToast(`Core "${core}" already exists in stock.`, "error")
      return
    }

    const submitBtn = addCoreForm.querySelector("button")!
    submitBtn.disabled = true
    submitBtn.textContent = "Adding..."

    try {
      const now = new Date().toLocaleString()
      await upsertStockItem({
        core,
        quantity,
        minimum_stock: 0,
        low_stock_trigger: trigger,
        last_updated: now,
      })

      if (quantity > 0) {
        await addMovement({
          type: "IN",
          core,
          quantity,
          reason: "New core added",
          date: now,
        })
      }

      showToast(`Core ${core} added to stock.`, "success")
      addCoreForm.reset()
      await refreshData()
    } catch (err: any) {
      showToast(err?.message ?? "Failed to add core.", "error")
    } finally {
      submitBtn.disabled = false
      submitBtn.textContent = "Add Core"
    }
  }

  return Layout("Goods In", content)
}