"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import ConfirmModal from "@/components/ConfirmModal";
import { ErrorNote, PageHeader, Pager, SearchBox, Table, TableSkeleton } from "@/components/manage/ui";
import StarRating from "@/components/StarRating";
import { api, errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { AdminReview, Paged } from "@/lib/types";
import { useData } from "@/lib/use-data";

export default function ManageReviewsPage() {
  const [search, setSearch] = useState("");
  const [rating, setRating] = useState("");
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState<AdminReview | null>(null);
  const [busy, setBusy] = useState(false);
  const query = new URLSearchParams({ page: String(page), ...(search && { search }), ...(rating && { rating }) });
  const { data, error, loading, reload } = useData<Paged<AdminReview>>(`/api/manage/reviews?${query}`);

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api(`/api/manage/reviews/${deleting._id}`, { method: "DELETE" });
      toast.success("Feedback removed.");
      setDeleting(null);
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Feedback" text={data ? `${data.total} reviews from customers` : "Ratings and comments customers left on products."} />
      <div className="flex flex-wrap items-center gap-3">
        <SearchBox label="Search feedback" onSearch={(value) => { setSearch(value); setPage(1); }} />
        <select aria-label="Filter by rating" value={rating} onChange={(event) => { setRating(event.target.value); setPage(1); }} className="select select-sm w-auto">
          <option value="">All ratings</option>
          {[5, 4, 3, 2, 1].map((star) => <option key={star} value={star}>{star} {star === 1 ? "star" : "stars"}</option>)}
        </select>
      </div>
      {loading && <TableSkeleton />}
      {error && <ErrorNote message={error} />}
      {data && (
        <>
          <Table>
            <thead><tr><th>Product</th><th>Customer</th><th>Rating</th><th>Feedback</th><th>Date</th><th /></tr></thead>
            <tbody>
              {data.items.map((review) => (
                <tr key={review._id}>
                  <td>
                    <div className="flex min-w-44 items-center gap-2">
                      {review.product && <span className="product-tile size-9 shrink-0 rounded-field p-0.5"><img src={review.product.image} alt="" className="size-full object-contain" /></span>}
                      <span className="font-medium">{review.product?.name ?? "Deleted product"}</span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap">{review.userName}<span className="block text-xs text-base-content/60">{review.userEmail}</span></td>
                  <td className="whitespace-nowrap"><StarRating value={review.rating} size="size-3.5" /></td>
                  <td className="min-w-56 max-w-md whitespace-pre-line text-sm">{review.comment || <span className="text-base-content/50">No comment</span>}</td>
                  <td className="whitespace-nowrap">{formatDate(review.createdAt)}</td>
                  <td><button type="button" className="btn btn-ghost btn-xs btn-square text-error" onClick={() => setDeleting(review)} aria-label="Remove feedback"><Trash2 className="size-3.5" /></button></td>
                </tr>
              ))}
              {data.items.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-base-content/70">No feedback yet.</td></tr>}
            </tbody>
          </Table>
          <Pager page={data.page} pages={data.pages} onChange={setPage} />
        </>
      )}
      <ConfirmModal open={Boolean(deleting)} title="Remove this feedback?" confirmLabel="Remove" busy={busy} onClose={() => setDeleting(null)} onConfirm={remove}>
        It disappears from the product page and the product&apos;s average rating is worked out again.
      </ConfirmModal>
    </div>
  );
}
