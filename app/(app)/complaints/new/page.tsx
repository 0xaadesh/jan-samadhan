import { redirect } from "next/navigation"

import { PageBody, PageHeader } from "@/components/page-shell"
import { SubmitComplaintForm } from "@/components/submit-complaint-form"
import { requireViewer } from "@/lib/auth-session"

export default async function NewComplaintPage() {
  const viewer = await requireViewer()

  // Staff work complaints rather than file them; sending them to the queue is
  // more useful than showing a form their role has no reason to use.
  if (viewer.role !== "citizen") redirect("/complaints")

  return (
    <>
      <PageHeader
        title="Submit a complaint"
        description="Tell us what is wrong and where"
      />
      <PageBody className="max-w-3xl">
        <SubmitComplaintForm />
      </PageBody>
    </>
  )
}
