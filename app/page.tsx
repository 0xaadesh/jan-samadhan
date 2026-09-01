import { SiteNav } from "@/components/landing/site-nav"
import { Hero } from "@/components/landing/hero"
import { Features } from "@/components/landing/features"
import { Workflow } from "@/components/landing/workflow"
import { Faq } from "@/components/landing/faq"
import { Cta } from "@/components/landing/cta"
import { SiteFooter } from "@/components/landing/site-footer"

export default function Home() {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <SiteNav />
      <main className="flex-1">
        <Hero />
        <Features />
        <Workflow />
        <Faq />
        <Cta />
      </main>
      <SiteFooter />
    </div>
  )
}
