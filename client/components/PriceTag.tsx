import { money } from "@/lib/format";

// The price a customer pays. With a discount it also shows the normal price crossed out and the percentage off.
export default function PriceTag({ price, salePrice, discountPercent, size = "md" }: { price: number; salePrice: number; discountPercent: number; size?: "md" | "lg" }) {
  const big = size === "lg";
  if (!discountPercent) return <p className={`figure font-semibold ${big ? "text-3xl" : "sm:text-lg"}`}>{money(price)}</p>;
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <p className={`figure font-semibold ${big ? "text-3xl" : "sm:text-lg"}`}>{money(salePrice)}</p>
        <p className={`figure text-base-content/55 line-through ${big ? "text-lg" : "text-sm"}`}><span className="sr-only">Normal price </span>{money(price)}</p>
        <span className="badge badge-sm border-0 bg-accent font-semibold text-accent-content">-{discountPercent}%</span>
      </div>
      {big && <p className="mt-1 text-sm font-medium text-success">You save {money(price - salePrice)}</p>}
    </div>
  );
}
