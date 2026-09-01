import Link from "next/link"

import { AiSettings } from "@/components/admin/ai-settings"
import { ConfidenceBadge } from "@/components/complaint-badges"
import { EmptyState, PageBody, PageHeader, StatCard, StatGrid } from "@/components/page-shell"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requireAdmin } from "@/lib/auth-session"
import { listAiDecisions, loadAiStats } from "@/lib/grievance/analytics"
import { EMBEDDING_MODEL } from "@/lib/grievance/embedding-config"
import { readSettings } from "@/lib/grievance/settings"

const KIND_LABEL: Record<string, string> = {
  classification: "Department",
  prioritization: "Priority",
  duplicate: "Duplicate",
}

export default async function AiConfigPage() {
  await requireAdmin()

  const [settings, stats, decisions] = await Promise.all([
    readSettings(),
    loadAiStats(),
    listAiDecisions(60),
  ])

  return (
    <>
      <PageHeader
        title="AI configuration"
        description="Classification, prioritisation and duplicate detection"
      />

      <PageBody>
        <StatGrid>
          <StatCard
            label="Decisions logged"
            value={stats.total}
            hint="Across every complaint"
          />
          <StatCard
            label="Average confidence"
            value={
              stats.avgConfidence !== null
                ? `${Math.round(stats.avgConfidence * 100)}%`
                : "--"
            }
            hint="Higher is more decisive, not necessarily more correct"
          />
          <StatCard
            label="Left for review"
            value={stats.lowConfidence}
            hint="Below the confidence threshold"
            accent={stats.lowConfidence > 0 ? "warning" : "default"}
          />
          <StatCard
            label="Overridden"
            value={stats.overridden}
            hint="A human disagreed - the signal to retune"
            accent={stats.overridden > 0 ? "danger" : "success"}
          />
        </StatGrid>

        <AiSettings settings={settings} />

        <Card>
          <CardHeader>
            <CardTitle>Models</CardTitle>
            <CardDescription>
              Read from the environment; the keys never reach the browser.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Classifier</dt>
                <dd className="mt-0.5 font-mono text-xs font-medium">
                  {process.env.OPENAI_MODEL ?? "gpt-5.4-mini"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Embeddings</dt>
                <dd className="mt-0.5 font-mono text-xs font-medium">
                  {EMBEDDING_MODEL}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Similarity</dt>
                <dd className="mt-0.5 font-mono text-xs font-medium">
                  pgvector / cosine
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Decision log</CardTitle>
            <CardDescription>
              Every call the pipeline made, with the reasoning it gave. This is
              the record for auditing a wrong routing.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {decisions.length === 0 ? (
              <EmptyState
                title="No decisions yet"
                description="Once complaints start arriving, every classification, priority and duplicate check is recorded here."
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[110px]">Complaint</TableHead>
                      <TableHead className="w-[110px]">Kind</TableHead>
                      <TableHead className="w-[150px]">Outcome</TableHead>
                      <TableHead className="w-[90px]">Confidence</TableHead>
                      <TableHead className="min-w-[280px]">Reasoning</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {decisions.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-mono text-xs">
                          <Link
                            className="underline-offset-4 hover:underline"
                            href={`/complaints/${entry.complaintId}`}
                          >
                            {entry.reference}
                          </Link>
                        </TableCell>
                        <TableCell className="text-sm">
                          {KIND_LABEL[entry.kind] ?? entry.kind}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1">
                            <span className="text-sm">
                              {entry.outcomeLabel ?? "--"}
                            </span>
                            {entry.overridden ? (
                              <Badge
                                variant="outline"
                                className="font-normal text-muted-foreground"
                              >
                                Overridden
                              </Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <ConfidenceBadge value={entry.confidence} />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {entry.reason}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </PageBody>
    </>
  )
}
