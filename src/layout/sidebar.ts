import { navigate, current } from "../router"

const pages: [string, string, string][] = [
  ["dashboard", "Dashboard", "📊"],
  ["stock", "Stock", "📦"],
  ["goodsIn", "Goods In", "📥"],
  ["shipping", "Shipping", "🚚"],
  ["rejects", "Rejects", "❌"],
  ["adjustments", "Adjustments", "⚖️"],
  ["importSchedule", "Import Schedule", "📅"],
  ["staff", "Staff", "👥"],
  ["factoryDisplay", "Factory Display", "🏭"],
  ["history", "History", "📋"],
]

export function Sidebar(): HTMLElement {
  const el = document.createElement("aside")
  el.className = "sidebar"

  // Logo (clickable to CIC Database login)
  const logo = document.createElement("div")
  logo.className = "sidebar-logo"
  logo.style.cursor = "pointer"
  logo.title = "Open CIC Database"
  logo.innerHTML = `
    <img src="/New logo.webp" alt="CIC Core Stock Manager" class="sidebar-logo-img" style="width:100%;height:auto;max-height:150px;object-fit:contain;display:block;" />
  `
  logo.onclick = () => {
    window.open("https://capitalic.herokuapp.com/sign_in", "_blank", "noopener,noreferrer")
  }
  el.appendChild(logo)

  // Section label
  const label = document.createElement("div")
  label.className = "sidebar-section-label"
  label.textContent = "Navigation"
  el.appendChild(label)

  // Page buttons
  const currentPage = current()

  pages.forEach(([page, label, icon]) => {
    const btn = document.createElement("button")
    btn.className = "sidebar-btn"
    if (currentPage === page) btn.classList.add("active")

    btn.innerHTML = `<span class="sidebar-btn-icon">${icon}</span> ${label}`
    btn.onclick = () => navigate(page as any)
    el.appendChild(btn)
  })

  // Footer
  const footer = document.createElement("div")
  footer.className = "sidebar-footer"
  footer.innerHTML = `
    <small>CIC Core Stock v1.1</small>
    <small class="sidebar-footer-credit" id="cicCredit" role="button" tabindex="0">The Brainchild of Darryl Chambers</small>
  `
  el.appendChild(footer)

  // Displacement logo popup
  const credit = footer.querySelector("#cicCredit") as HTMLElement
  const openDisplacementModal = () => {
    // Avoid duplicate modals
    if (document.getElementById("displacement-modal")) return

    const overlay = document.createElement("div")
    overlay.id = "displacement-modal"
    overlay.className = "displacement-modal"

    const img = document.createElement("img")
    img.src = "/displacement-logo.png"
    img.alt = "Displacement"
    img.className = "displacement-modal-img"
    img.onerror = () => {
      // Fallback to the supplied webp placeholder if the png is missing
      img.src = "/displacement logo.jpg.webp"
    }

    overlay.appendChild(img)

    const closeModal = () => {
      overlay.remove()
      document.removeEventListener("keydown", onKey)
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal()
    }

    // Close when clicking outside the image
    overlay.addEventListener("click", e => {
      if (e.target === overlay) closeModal()
    })

    document.addEventListener("keydown", onKey)
    document.body.appendChild(overlay)
  }

  credit.addEventListener("click", openDisplacementModal)
  credit.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      openDisplacementModal()
    }
  })

  return el
}