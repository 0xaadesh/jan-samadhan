import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

const faqs = [
  {
    question: "What can I report here?",
    answer:
      "Any civic problem in a public space - water, sewerage, roads, garbage, street lighting, public health hazards, parks and traffic. If you are unsure which department it belongs to, describe it and the platform works that out.",
  },
  {
    question: "How do I know it was not ignored?",
    answer:
      "Every complaint gets a reference number and a timeline. Each status change, remark and reassignment appears there, ending with a note describing what was actually done.",
  },
  {
    question: "Someone already reported my issue. Does mine still count?",
    answer:
      "Yes. Duplicate reports are linked to the original rather than discarded, which raises how urgent the underlying problem looks. You are still notified when it is resolved.",
  },
  {
    question: "Does a computer decide everything?",
    answer:
      "No. The AI proposes a department and priority and records why, but department officials and administrators can override any of it, and low-confidence cases are routed to a human by design.",
  },
]

export function Faq() {
  return (
    <section id="faq" className="border-b bg-muted/40">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 md:py-24 lg:px-6">
        <h2 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">
          Frequently asked questions
        </h2>
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {faqs.map((faq) => (
            <Card key={faq.question}>
              <CardHeader>
                <CardTitle className="text-base">{faq.question}</CardTitle>
                <CardDescription>{faq.answer}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
