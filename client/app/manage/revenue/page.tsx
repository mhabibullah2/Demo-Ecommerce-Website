"use client";

import { Banknote, Download, Percent, Printer, Receipt, ShoppingBag, Wallet } from "lucide-react";
import { useState } from "react";
import { ErrorNote, PageHeader, StatCard, Table, TableSkeleton } from "@/components/manage/ui";
import SalesChart from "@/components/manage/SalesChart";
import { dayKey, daysAgoKey, formatDay, money } from "@/lib/format";
import type { RevenueReport } from "@/lib/types";
import { useData } from "@/lib/use-data";

const PRESETS = [
  { label: "Last 7 days", days: 6 },
  { label: "Last 30 days", days: 29 },
  { label: "Last 90 days", days: 89 },
];

export default function RevenuePage() {
  const [from, setFrom] = useState(() => daysAgoKey(29));
  const [to, setTo] = useState(() => dayKey());
  const { data, error, loading } = useData<RevenueReport>(`/api/manage/revenue?from=${from}&to=${to}`);

  // A spreadsheet-friendly copy of the report, built in the browser
  function download() {
    if (!data) return;
    const t = data.totals;
    const rows = [
      ["ShopDesk revenue report", `${data.from} to ${data.to}`],
      [],
      ["Orders", t.orders],
      ["Items sold", t.units],
      ["Sales at normal prices", t.grossSales],
      ["Discounts given", t.discounts],
      ["Sales after discounts", t.netSales],
      ["Delivery fees", t.deliveryFees],
      ["Total revenue", t.revenue],
      ["Collected (paid)", t.collected],
      ["Still to collect", t.outstanding],
      [],
      ["Date", "Orders", "Revenue"],
      ...data.days.map((day) => [day.day, day.orders, day.sales]),
      [],
      ["Product", "Units", "Revenue"],
      ...data.topProducts.map((product) => [product.name, product.units, product.revenue]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    link.download = `shopdesk-revenue-${data.from}-to-${data.to}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Revenue"
        text="Money from orders that were not cancelled."
        action={data && (
          <div className="no-print flex gap-2">
            <button type="button" className="btn btn-outline btn-sm" onClick={download}><Download className="size-4" /> CSV</button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => window.print()}><Printer className="size-4" /> Print</button>
          </div>
        )}
      />

      <div className="no-print flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium">From</span>
          <input type="date" className="input input-sm" value={from} max={to} onChange={(event) => event.target.value && setFrom(event.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium">To</span>
          <input type="date" className="input input-sm" value={to} min={from} max={dayKey()} onChange={(event) => event.target.value && setTo(event.target.value)} />
        </label>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button key={preset.label} type="button" className="btn btn-outline btn-sm" onClick={() => { setFrom(daysAgoKey(preset.days)); setTo(dayKey()); }}>{preset.label}</button>
          ))}
        </div>
      </div>

      {loading && <TableSkeleton />}
      {error && <ErrorNote message={error} />}
      {data && (
        <>
          <p className="hidden text-sm print:block">{formatDay(data.from)} to {formatDay(data.to)}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            <StatCard label="Total revenue" value={money(data.totals.revenue)} note={`${data.totals.orders} orders, ${data.totals.units} items`} icon={Banknote} />
            <StatCard label="Collected" value={money(data.totals.collected)} note="Orders marked as paid" icon={Wallet} />
            <StatCard label="Still to collect" value={money(data.totals.outstanding)} note="Cash on delivery and unchecked payments" icon={Receipt} tone={data.totals.outstanding ? "warning" : undefined} />
            <StatCard label="Average order" value={money(data.totals.averageOrder)} icon={ShoppingBag} />
          </div>

          <section className="rounded-box border border-base-300 p-4">
            <h2 className="flex items-center gap-2 font-semibold"><Percent className="size-4 text-primary" /> Where the money comes from</h2>
            <dl className="mt-3 max-w-md space-y-2 text-sm">
              <div className="flex justify-between"><dt>Sales at normal prices</dt><dd className="figure">{money(data.totals.grossSales)}</dd></div>
              <div className="flex justify-between text-success"><dt>Discounts given</dt><dd className="figure">-{money(data.totals.discounts)}</dd></div>
              <div className="receipt-rule flex justify-between pt-2"><dt>Sales after discounts</dt><dd className="figure">{money(data.totals.netSales)}</dd></div>
              <div className="flex justify-between"><dt>Delivery fees</dt><dd className="figure">{money(data.totals.deliveryFees)}</dd></div>
              <div className="receipt-rule flex justify-between pt-2 font-semibold"><dt>Total revenue</dt><dd className="figure">{money(data.totals.revenue)}</dd></div>
            </dl>
          </section>

          <SalesChart days={data.days} title="Revenue per day" />

          <section className="space-y-3">
            <h2 className="font-semibold">Best sellers</h2>
            <Table>
              <thead><tr><th>Product</th><th className="text-right">Sold</th><th className="text-right">Revenue</th></tr></thead>
              <tbody>
                {data.topProducts.map((product) => (
                  <tr key={product.productId}>
                    <td>
                      <div className="flex min-w-48 items-center gap-3">
                        <span className="product-tile size-9 shrink-0 rounded-field p-0.5"><img src={product.image} alt="" className="size-full object-contain" /></span>
                        <span className="font-medium">{product.name}</span>
                      </div>
                    </td>
                    <td className="figure text-right">{product.units}</td>
                    <td className="figure text-right">{money(product.revenue)}</td>
                  </tr>
                ))}
                {data.topProducts.length === 0 && <tr><td colSpan={3} className="py-8 text-center text-base-content/70">No orders in this range.</td></tr>}
              </tbody>
            </Table>
          </section>
        </>
      )}
    </div>
  );
}
