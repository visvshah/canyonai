import { QuotesTable } from "../_components/quotes-table";

export default function QuotesPage() {
  return (
    <main className="flex min-h-screen flex-col gap-6 p-6">
      <h1 className="text-3xl font-bold">Quotes</h1>
      <QuotesTable />
    </main>
  );
}
