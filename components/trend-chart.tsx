"use client"

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

/**
 * Submitted against resolved, over time.
 *
 * Two stacked-looking areas but *not* stacked: the point is whether resolution
 * keeps pace with intake, which reading requires both series on a shared
 * baseline. Stacking would make "resolved" look like a surplus on top.
 */
const config = {
  submitted: {
    label: "Submitted",
    color: "var(--chart-1)",
  },
  resolved: {
    label: "Resolved",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig

export function TrendChart({
  data,
}: {
  data: { date: string; submitted: number; resolved: number }[]
}) {
  return (
    <ChartContainer config={config} className="aspect-auto h-[240px] w-full">
      <AreaChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
        <defs>
          <linearGradient id="fill-submitted" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-submitted)" stopOpacity={0.7} />
            <stop offset="95%" stopColor="var(--color-submitted)" stopOpacity={0.05} />
          </linearGradient>
          <linearGradient id="fill-resolved" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-resolved)" stopOpacity={0.7} />
            <stop offset="95%" stopColor="var(--color-resolved)" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={28}
          tickFormatter={(value: string) =>
            new Date(value).toLocaleDateString("en-IN", {
              month: "short",
              day: "numeric",
            })
          }
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={28}
          allowDecimals={false}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(value) =>
                new Date(value as string).toLocaleDateString("en-IN", {
                  month: "long",
                  day: "numeric",
                })
              }
            />
          }
        />
        <Area
          dataKey="submitted"
          type="monotone"
          fill="url(#fill-submitted)"
          stroke="var(--color-submitted)"
        />
        <Area
          dataKey="resolved"
          type="monotone"
          fill="url(#fill-resolved)"
          stroke="var(--color-resolved)"
        />
      </AreaChart>
    </ChartContainer>
  )
}
