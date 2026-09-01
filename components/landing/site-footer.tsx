import Link from "next/link"
import { SparklesIcon } from "lucide-react"

const groups = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "#features" },
      { label: "Workflow", href: "#workflow" },
      { label: "Go to dashboard", href: "/new" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "#" },
      { label: "Blog", href: "#" },
      { label: "Careers", href: "#" },
      { label: "Contact", href: "#" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "#" },
      { label: "Terms", href: "#" },
      { label: "Security", href: "#" },
    ],
  },
]

export function SiteFooter() {
  return (
    <footer>
      <div className="mx-auto w-full max-w-6xl px-4 py-12 lg:px-6">
        <div className="grid gap-10 md:grid-cols-[1.5fr_repeat(3,1fr)]">
          <div className="flex flex-col gap-3">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <SparklesIcon className="size-4" />
              </span>
              Jan Samadhan
            </Link>
            <p className="max-w-xs text-sm text-muted-foreground">
              One workspace for drafting, scheduling, and measuring everything
              your team publishes.
            </p>
          </div>

          {groups.map((group) => (
            <div key={group.title} className="flex flex-col gap-3">
              <h3 className="text-sm font-medium">{group.title}</h3>
              <ul className="flex flex-col gap-2">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 border-t pt-6 text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} Jan Samadhan. All rights reserved.
        </div>
      </div>
    </footer>
  )
}
