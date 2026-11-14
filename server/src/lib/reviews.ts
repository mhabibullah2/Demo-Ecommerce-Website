import type { ObjectId } from "mongodb";
import { collections } from "../config/db.js";

export interface RatingSummary {
  avg: number;
  count: number;
  // How many reviews gave 1, 2, 3, 4 and 5 stars
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

export async function ratingSummary(productId: ObjectId): Promise<RatingSummary> {
  const { reviews } = await collections();
  const rows = await reviews.aggregate<{ _id: number; count: number }>([
    { $match: { productId } },
    { $group: { _id: "$rating", count: { $sum: 1 } } },
  ]).toArray();
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let count = 0;
  let total = 0;
  for (const row of rows) {
    if (row._id in distribution) distribution[row._id as 1 | 2 | 3 | 4 | 5] = row.count;
    count += row.count;
    total += row._id * row.count;
  }
  return { avg: count ? Math.round((total / count) * 10) / 10 : 0, count, distribution };
}

// The product keeps its own average and count, so lists and cards can show stars without extra queries
export async function refreshRating(productId: ObjectId) {
  const { products } = await collections();
  const { avg, count } = await ratingSummary(productId);
  await products.updateOne({ _id: productId }, { $set: { ratingAvg: avg, ratingCount: count } });
}
