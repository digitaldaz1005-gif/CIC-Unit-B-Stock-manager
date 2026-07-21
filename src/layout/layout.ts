import { Header } from "./header"
import { Sidebar } from "./sidebar"
import { current } from "../router"

export function Layout(title: string, content: HTMLElement): HTMLElement {
  const app = document.createElement("div")
  app.className = "app-layout"

  const main = document.createElement("main")
  main.className = "main-content"

  const pageContent = document.createElement("div")
  pageContent.className = "page-content"
  pageContent.appendChild(content)

  // Factory Display is a standalone kiosk view - no sidebar, no header
  if (current() === "factoryDisplay") {
    main.appendChild(pageContent)
    app.appendChild(main)
    return app
  }

  main.appendChild(Header(title))
  main.appendChild(pageContent)

  app.appendChild(Sidebar())
  app.appendChild(main)

  return app
}
