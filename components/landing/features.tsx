import {
  BarChart3Icon,
  CopyCheckIcon,
  MapPinIcon,
  RouteIcon,
  ScaleIcon,
  ShieldCheckIcon,
} from "lucide-react"

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

const features = [
  {
    icon: RouteIcon,
    title: "Automatic routing",
    description:
      "Every complaint is read and sent to the department that handles that kind of work - no dropdown for citizens to get wrong.",
  },
  {
    icon: ScaleIcon,
    title: "Priority that reflects risk",
    description:
      "Danger to life, how many people are affected and whether it is spreading decide the ranking - not who complained loudest.",
  },
  {
    icon: CopyCheckIcon,
    title: "Duplicate detection",
    description:
      "Reports of the same underlying issue are linked by meaning, not keywords, so one problem does not consume four crews.",
  },
  {
    icon: MapPinIcon,
    title: "Geographic hotspots",
    description:
      "Complaints cluster on a map, turning scattered reports into the evidence that a stretch of road needs rebuilding.",
  },
  {
    icon: BarChart3Icon,
    title: "Accountability by default",
    description:
      "Resolution times, department workload and recurring issues are measured continuously and visible to administrators.",
  },
  {
    icon: ShieldCheckIcon,
    title: "Every decision auditable",
    description:
      "The AI records its confidence and its reasoning for each call, and any official can override it - with that on the record too.",
  },
]

export function Features() {
  return (
    <section id="features" className="border-b">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 md:py-24 lg:px-6">
        <div className="flex max-w-2xl flex-col gap-4">
          <h2 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">
            Everything you need between the idea and the post
          </h2>
          <p className="text-lg text-muted-foreground text-balance">
            Replace the spreadsheet, the scheduler, and the three tabs of
            analytics with one workspace.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <Card key={feature.title} className="h-full">
              <CardHeader>
                <span className="mb-3 flex size-9 items-center justify-center rounded-lg border bg-muted text-foreground">
                  <feature.icon className="size-4.5" />
                </span>
                <CardTitle>{feature.title}</CardTitle>
                <CardDescription>{feature.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
