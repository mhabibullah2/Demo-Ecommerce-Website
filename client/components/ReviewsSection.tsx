"use client";

import { BadgeCheck, Star } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import AuthLink from "@/components/AuthLink";
import StarRating from "@/components/StarRating";
import { api, errorMessage } from "@/lib/api";
import { useSession } from "@/lib/auth-client";
import { formatDate } from "@/lib/format";
import type { ReviewsResponse } from "@/lib/types";
import { useData } from "@/lib/use-data";

// Ratings and feedback on the product page. Anyone can read them; a logged-in customer can write one.
export default function ReviewsSection({ productId, productName }: { productId: string; productName: string }) {
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useData<ReviewsResponse>(`/api/products/${productId}/reviews?page=${page}`);
  const { data: session, isPending } = useSession();
  const isAdmin = session?.user.role === "admin";

  return (
    <section id="reviews" className="mt-12 scroll-mt-20 border-t border-base-300 pt-8">
      <h2 className="text-2xl font-bold">Ratings and feedback</h2>
      {loading && <div className="skeleton mt-5 h-40 w-full" />}
      {error && <p role="alert" className="mt-4 text-sm text-error">{error}</p>}
      {data && (
        <div className="mt-5 grid items-start gap-8 lg:grid-cols-[18rem_1fr]">
          <div className="space-y-6">
            <Summary summary={data.summary} />
            {isPending ? null : !session ? (
              <p className="rounded-field bg-base-200 p-3 text-sm">
                <AuthLink href="/login" className="font-medium text-primary underline">Log in</AuthLink> to rate this product and share your feedback.
              </p>
            ) : isAdmin ? (
              <p className="rounded-field bg-base-200 p-3 text-sm text-base-content/75">Customers can rate this product here. You can remove feedback from the Feedback page in the dashboard.</p>
            ) : (
              <ReviewForm key={data.mine?._id ?? "new"} productId={productId} productName={productName} mine={data.mine} onSaved={() => { setPage(1); reload(); }} />
            )}
          </div>

          <div>
            {data.items.length === 0 ? (
              <p className="rounded-box border border-dashed border-base-300 p-6 text-center text-sm text-base-content/70">No feedback yet. Be the first to rate {productName}.</p>
            ) : (
              <ul className="divide-y divide-base-300 rounded-box border border-base-300">
                {data.items.map((review) => (
                  <li key={review._id} className="p-4">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <StarRating value={review.rating} />
                      <span className="font-medium">{review.userName}</span>
                      {review.verified && <span className="inline-flex items-center gap-1 text-xs text-success"><BadgeCheck className="size-3.5" /> Verified buyer</span>}
                      <span className="text-xs text-base-content/60">{formatDate(review.createdAt)}</span>
                    </div>
                    {review.comment && <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-base-content/85">{review.comment}</p>}
                  </li>
                ))}
              </ul>
            )}
            {data.pages > 1 && (
              <nav className="mt-4 flex items-center justify-end gap-2" aria-label="Feedback pages">
                <button type="button" className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Newer</button>
                <span className="figure text-sm">{page} / {data.pages}</span>
                <button type="button" className="btn btn-outline btn-sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Older</button>
              </nav>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function Summary({ summary }: { summary: ReviewsResponse["summary"] }) {
  if (summary.count === 0) return <p className="text-sm text-base-content/70">No ratings yet.</p>;
  return (
    <div>
      <div className="flex items-center gap-3">
        <p className="figure text-4xl font-bold">{summary.avg.toFixed(1)}</p>
        <div>
          <StarRating value={summary.avg} />
          <p className="mt-0.5 text-sm text-base-content/70">{summary.count} {summary.count === 1 ? "rating" : "ratings"}</p>
        </div>
      </div>
      <ul className="mt-4 space-y-1.5">
        {([5, 4, 3, 2, 1] as const).map((star) => (
          <li key={star} className="flex items-center gap-2 text-xs">
            <span className="figure w-3">{star}</span>
            <Star className="size-3 fill-warning text-warning" />
            <progress className="progress progress-warning h-2 flex-1" value={summary.distribution[star]} max={summary.count} aria-label={`${summary.distribution[star]} ${star}-star ratings`} />
            <span className="figure w-6 text-right text-base-content/65">{summary.distribution[star]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReviewForm({ productId, productName, mine, onSaved }: { productId: string; productName: string; mine: ReviewsResponse["mine"]; onSaved: () => void }) {
  const [rating, setRating] = useState(mine?.rating ?? 0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState(mine?.comment ?? "");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!rating) {
      toast.error("Please choose a star rating first.");
      return;
    }
    setBusy(true);
    try {
      await api(`/api/products/${productId}/reviews`, { method: "PUT", body: { rating, comment } });
      toast.success(mine ? "Your feedback was updated." : "Thank you for your feedback!");
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api(`/api/products/${productId}/reviews/mine`, { method: "DELETE" });
      toast.success("Your feedback was removed.");
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const shown = hover || rating;
  return (
    <form onSubmit={submit} className="space-y-3 rounded-box border border-base-300 p-4">
      <h3 className="font-semibold">{mine ? "Your feedback" : `Rate ${productName}`}</h3>
      <div className="flex items-center gap-1" onPointerLeave={() => setHover(0)} role="radiogroup" aria-label="Your rating">
        {[1, 2, 3, 4, 5].map((star) => (
          <button key={star} type="button" role="radio" aria-checked={rating === star} aria-label={`${star} ${star === 1 ? "star" : "stars"}`} className="rounded p-0.5 focus-visible:outline-2 focus-visible:outline-primary" onPointerEnter={() => setHover(star)} onClick={() => setRating(star)}>
            <Star className={`size-7 ${star <= shown ? "fill-warning text-warning" : "text-base-content/30"}`} />
          </button>
        ))}
      </div>
      <label className="block">
        <span className="sr-only">Your feedback</span>
        <textarea rows={3} maxLength={1000} placeholder="Tell others what you think (optional)" value={comment} onChange={(event) => setComment(event.target.value)} className="textarea w-full" />
      </label>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary btn-sm" disabled={busy}>{busy && <span className="loading loading-spinner loading-xs" />} {mine ? "Update feedback" : "Submit feedback"}</button>
        {mine && <button type="button" className="btn btn-ghost btn-sm text-error" disabled={busy} onClick={remove}>Delete</button>}
      </div>
    </form>
  );
}
