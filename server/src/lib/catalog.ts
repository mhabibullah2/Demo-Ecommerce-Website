import { ObjectId, type Filter } from "mongodb";
import { collections, type ProductDoc } from "../config/db.js";
import { priced } from "./pricing.js";
import { asObjectId, escapeRegex, HttpError, pageOf, paging } from "./validate.js";

// Used by both the public API routes and the shop pages

export async function listCategories() {
  const { categories, products } = await collections();
  const [list, counts] = await Promise.all([
    categories.find().sort({ name: 1 }).toArray(),
    products.aggregate<{ _id: unknown; count: number }>([{ $group: { _id: "$categoryId", count: { $sum: 1 } } }]).toArray(),
  ]);
  const byId = new Map(counts.map((row) => [String(row._id), row.count]));
  return list.map((category) => ({ ...category, productCount: byId.get(String(category._id)) ?? 0 }));
}

export async function featuredProducts() {
  const { products } = await collections();
  return (await products.find({ featured: true }).sort({ createdAt: -1 }).limit(8).toArray()).map(priced);
}

// The cart re-reads its products, so a saved cart always shows today's price and stock
export async function productsByIds(ids: string) {
  const { products } = await collections();
  const list = ids.split(",").filter((id) => ObjectId.isValid(id)).slice(0, 50).map((id) => new ObjectId(id));
  return (await products.find({ _id: { $in: list } }).toArray()).map(priced);
}

// What a customer pays is the price after the discount, so price sorting uses that
const effectivePrice = { $multiply: ["$price", { $subtract: [1, { $divide: [{ $ifNull: ["$discountPercent", 0] }, 100] }] }] };

const SORTS: Record<string, Record<string, 1 | -1>> = {
  newest: { createdAt: -1, _id: -1 },
  "price-asc": { effectivePrice: 1, _id: 1 },
  "price-desc": { effectivePrice: -1, _id: 1 },
  "top-rated": { ratingAvg: -1, ratingCount: -1, _id: 1 },
  "biggest-discount": { discountPercent: -1, _id: 1 },
};

export async function searchProducts(params: URLSearchParams) {
  const { products } = await collections();
  const { page, limit, skip } = paging(params, 12);
  const filter: Filter<ProductDoc> = {};
  const search = params.get("search")?.trim();
  if (search) {
    // Match the words anywhere a shopper might look: name, category or description
    const pattern = { $regex: escapeRegex(search), $options: "i" };
    filter.$or = [{ name: pattern }, { category: pattern }, { description: pattern }];
  }
  const category = params.get("category");
  if (category) filter.category = category;
  if (params.get("onSale") === "1") filter.discountPercent = { $gt: 0 };

  const [items, total] = await Promise.all([
    products.aggregate<ProductDoc>([
      { $match: filter },
      { $addFields: { effectivePrice } },
      { $sort: SORTS[params.get("sort") ?? ""] ?? SORTS.newest },
      { $skip: skip },
      { $limit: limit },
      { $project: { effectivePrice: 0 } },
    ]).toArray(),
    products.countDocuments(filter),
  ]);
  return pageOf(items.map(priced), total, page, limit);
}

export async function findProduct(id: string) {
  const { products } = await collections();
  const product = await products.findOne({ _id: asObjectId(id) });
  if (!product) throw new HttpError(404, "Product not found.");
  return priced(product);
}
