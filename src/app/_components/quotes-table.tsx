"use client";

import { useState } from "react";
import { api, type RouterOutputs } from "~/trpc/react";

import { format } from "date-fns";

// Helper types
export type Quote = RouterOutputs["quote"]["all"][number];

function getNextApproval(quote: Quote): string {
  const steps = quote.approvalWorkflow?.steps ?? [];
  const pendingStep = steps.find((s) => s.status === "Pending");
  if (!pendingStep) return "—";
  if (pendingStep.approver) {
    return pendingStep.approver.name ?? pendingStep.approver.email ?? "User";
  }
  // Fallback to persona role
  return pendingStep.persona;
}

export function QuotesTable() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Quote | null>(null);

  const {
    data: quotes,
    isLoading,
    refetch,
  } = api.quote.all.useQuery(
    search.trim() ? { search } : {},
    {
      staleTime: 1000 * 60, // 1 minute
    },
  );

  return (
    <div className="flex w-full flex-col gap-4">
      {/* Search */}
      <input
        type="text"
        placeholder="Search quotes..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-md border border-gray-700 bg-gray-800 p-2 text-sm text-white placeholder-gray-400"
      />

      {/* Table */}
      {isLoading ? (
        <p>Loading...</p>
      ) : !quotes || quotes.length === 0 ? (
        <p>No quotes found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-700 text-sm">
            <thead className="bg-gray-800">
              <tr>
                <th className="px-4 py-2 text-left font-semibold">Customer</th>
                <th className="px-4 py-2 text-left font-semibold">Org</th>
                <th className="px-4 py-2 text-left font-semibold">Status</th>
                <th className="px-4 py-2 text-left font-semibold">Next Approval</th>
                <th className="px-4 py-2 text-left font-semibold">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {quotes.map((q) => (
                <tr
                  key={q.id}
                  onClick={() => setSelected(q)}
                  className="cursor-pointer hover:bg-gray-800/60"
                >
                  <td className="px-4 py-2 font-medium">{q.customerName}</td>
                  <td className="px-4 py-2">{q.org.name}</td>
                  <td className="px-4 py-2">{q.status}</td>
                  <td className="px-4 py-2">{getNextApproval(q)}</td>
                  <td className="px-4 py-2">
                    {format(new Date(q.createdAt), "MMM d, yyyy")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-md bg-gray-900 p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-4 text-xl font-semibold">{selected.customerName}</h2>
            <div className="space-y-2 text-sm">
              <p>
                <span className="font-semibold">Status:</span> {selected.status}
              </p>
              <p>
                <span className="font-semibold">Org:</span> {selected.org.name}
              </p>
              <p>
                <span className="font-semibold">Payment Kind:</span> {selected.paymentKind}
              </p>
              {selected.paymentKind === "NET" && (
                <p>
                  <span className="font-semibold">Net Days:</span> {selected.netDays}
                </p>
              )}
              {selected.paymentKind === "PREPAY" && (
                <p>
                  <span className="font-semibold">Prepay %:</span> {selected.prepayPercent?.toString()}
                </p>
              )}
              {selected.paymentKind === "BOTH" && (
                <>
                  <p>
                    <span className="font-semibold">Net Days:</span> {selected.netDays}
                  </p>
                  <p>
                    <span className="font-semibold">Prepay %:</span> {selected.prepayPercent?.toString()}
                  </p>
                </>
              )}
              <p>
                <span className="font-semibold">Subtotal:</span> {selected.subtotal.toString()}
              </p>
              <p>
                <span className="font-semibold">Discount %:</span> {selected.discountPercent.toString()}
              </p>
              <p>
                <span className="font-semibold">Total:</span> {selected.total.toString()}
              </p>
              {/* Packages */}
              <div>
                <span className="font-semibold">Package:</span> {selected.package.name}
              </div>
            </div>

            {/* Approval Steps */}
            <div className="mt-6">
              <h3 className="mb-2 font-semibold">Approval Workflow</h3>
              {selected.approvalWorkflow ? (
                <ol className="space-y-1 text-sm">
                  {selected.approvalWorkflow.steps.map((step) => (
                    <li key={step.id} className="flex items-center gap-2">
                      <span className="w-20 font-medium">Step {step.stepOrder}</span>
                      <span className="flex-1">
                        {step.approver
                          ? step.approver.name ?? step.approver.email
                          : step.persona}
                      </span>
                      <span className="rounded-md bg-gray-800 px-2 py-1 text-xs uppercase">
                        {step.status}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p>No approval workflow.</p>
              )}
            </div>

            <button
              onClick={() => setSelected(null)}
              className="mt-6 rounded-md bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
