import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"

const steps = [
  {
    step: "01",
    title: "Describe the problem",
    description:
      "Write what is wrong in your own words, add photos, and pin the location. No forms to decode, no department to guess.",
  },
  {
    step: "02",
    title: "It is classified and ranked",
    description:
      "The complaint is read, routed to the department that handles it, and given a priority based on danger, scale and urgency.",
  },
  {
    step: "03",
    title: "Duplicates are merged",
    description:
      "If neighbours already reported the same issue, the reports are linked together instead of sending three separate crews.",
  },
  {
    step: "04",
    title: "Officials act, you follow along",
    description:
      "The department accepts, works and resolves it. Every status change and remark reaches you, ending with what was actually done.",
  },
]

export function Workflow() {
  return (
    <section id="workflow" className="border-b bg-muted/40">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 md:py-24 lg:px-6">
        <div className="flex max-w-2xl flex-col gap-4">
          <Badge variant="secondary" className="w-fit">
            How it works
          </Badge>
          <h2 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">
            From complaint to resolution in four steps
          </h2>
        </div>

        <div className="mt-12 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((item) => (
            <div key={item.step} className="flex flex-col gap-3">
              <span className="font-mono text-sm text-muted-foreground">
                {item.step}
              </span>
              <Separator />
              <h3 className="font-medium">{item.title}</h3>
              <p className="text-sm text-muted-foreground">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
