import { Router } from "express";
import type { Filter } from "mongodb";
import { collections, type ProductDoc, type ReviewDoc } from "../config/db.js";
import { LOW_STOCK, readCategory, readProduct } from "../lib/admin.js";
import { priced } from "../lib/pricing.js";
import { refreshRating } from "../lib/reviews.js";
import { asObjectId, body, dayStart, escapeRegex, HttpError, pageOf, paging, queryParams, TIME_ZONE } from "../lib/validate.js";
import { requireAdmin } from "../middleware/auth.js";

const DAY = 24 * 60 * 60 * 1000;
const dayKey = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(date);

// Admin dashboard. Every route here needs an admin login.
const router = Router();
router.use(requireAdmin);

// The numbers on the Overview page
router.get("/overview", async (_req, res) => {
  const { orders, products, users } = await collections();
  const today = dayStart(dayKey(new Date()));
  const from = new Date(today.getTime() - 13 * DAY);

  const [rows, pending, exchanges, payments, lowStock, recent, customers] = await Promise.all([
    orders.aggregate<{ _id: string; sales: number; orders: number }>([
      { $match: { createdAt: { $gte: from, $lt: new Date(today.getTime() + DAY) }, status: { $ne: "Cancelled" } } },
      { $group: { _id: { $dateToString: { date: "$createdAt", format: "%Y-%m-%d", timezone: TIME_ZONE } }, sales: { $sum: "$subtotal" }, orders: { $sum: 1 } } },
    ]).toArray(),
    orders.countDocuments({ status: "Pending" }),
    orders.countDocuments({ "exchange.status": "Requested" }),
    orders.countDocuments({ "payment.status": "Awaiting check", status: { $ne: "Cancelled" } }),
    products.find({ stock: { $lte: LOW_STOCK } }, { projection: { name: 1, image: 1, stock: 1 } }).sort({ stock: 1 }).limit(6).toArray(),
    orders.find({}, { projection: { orderNo: 1, userName: 1, total: 1, status: 1, createdAt: 1 } }).sort({ createdAt: -1 }).limit(6).toArray(),
    users.countDocuments({ role: { $ne: "admin" } }),
  ]);

  const byDay = new Map(rows.map((row) => [row._id, row]));
  const days = Array.from({ length: 14 }, (_, index) => {
    const day = dayKey(new Date(from.getTime() + index * DAY));
    return { day, sales: byDay.get(day)?.sales ?? 0, orders: byDay.get(day)?.orders ?? 0 };
  });
  res.json({ salesToday: days[13].sales, pending, exchanges, payments, customers, days, lowStock, recent });
});

// Customers with what they have spent. Cancelled orders do not count.
router.get("/customers", async (req, res) => {
  const params = queryParams(req.query);
  const { users, orders } = await collections();
  const { page, limit, skip } = paging(params, 15);
  const search = params.get("search")?.trim() ?? "";
  const pattern = { $regex: escapeRegex(search), $options: "i" };
  const filter = { role: { $ne: "admin" }, ...(search ? { $or: [{ name: pattern }, { email: pattern }] } : {}) };
  const [list, total] = await Promise.all([
    users.find(filter, { projection: { name: 1, email: 1, image: 1 } }).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
    users.countDocuments(filter),
  ]);
  const stats = await orders.aggregate<{ _id: string; spent: number; count: number; last: Date }>([
    { $match: { userEmail: { $in: list.map((user) => user.email) }, status: { $ne: "Cancelled" } } },
    { $group: { _id: "$userEmail", spent: { $sum: "$total" }, count: { $sum: 1 }, last: { $max: "$createdAt" } } },
  ]).toArray();
  const byEmail = new Map(stats.map((row) => [row._id, row]));
  const items = list.map((user) => ({
    ...user,
    spent: byEmail.get(user.email)?.spent ?? 0,
    orderCount: byEmail.get(user.email)?.count ?? 0,
    lastOrder: byEmail.get(user.email)?.last ?? null,
  }));
  res.json(pageOf(items, total, page, limit));
});

// Products
router.get("/products", async (req, res) => {
  const params = queryParams(req.query);
  const { products } = await collections();
  const { page, limit, skip } = paging(params, 15);
  const filter: Filter<ProductDoc> = {};
  const search = params.get("search")?.trim();
  if (search) filter.name = { $regex: escapeRegex(search), $options: "i" };
  if (params.get("stock") === "low") filter.stock = { $lte: LOW_STOCK };
  const [items, total] = await Promise.all([
    products.find(filter).sort({ name: 1 }).skip(skip).limit(limit).toArray(),
    products.countDocuments(filter),
  ]);
  res.json(pageOf(items.map(priced), total, page, limit));
});

router.post("/products", async (req, res) => {
  const { products } = await collections();
  const now = new Date();
  const { insertedId } = await products.insertOne({ ...(await readProduct(body(req.body))), createdAt: now, updatedAt: now });
  res.status(201).json({ _id: insertedId });
});

router.put("/products/:id", async (req, res) => {
  const { products } = await collections();
  const values = await readProduct(body(req.body));
  const result = await products.updateOne({ _id: asObjectId(req.params.id) }, { $set: { ...values, updatedAt: new Date() } });
  if (!result.matchedCount) throw new HttpError(404, "Product not found.");
  res.json({ ok: true });
});

// Orders keep their own copy of the name and price, so old orders stay readable
router.delete("/products/:id", async (req, res) => {
  const { products, reviews } = await collections();
  const id = asObjectId(req.params.id);
  const result = await products.deleteOne({ _id: id });
  if (!result.deletedCount) throw new HttpError(404, "Product not found.");
  await reviews.deleteMany({ productId: id });
  res.json({ ok: true });
});

// Revenue report for any date range (Bangladesh days). Cancelled orders never count.
// "Collected" is money confirmed as paid; the rest of the revenue is still waiting to be collected.
const DAY_FORMAT = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 366;

router.get("/revenue", async (req, res) => {
  const params = queryParams(req.query);
  const to = params.get("to") || dayKey(new Date());
  const from = params.get("from") || dayKey(new Date(dayStart(to).getTime() - 29 * DAY));
  if (!DAY_FORMAT.test(from) || !DAY_FORMAT.test(to) || Number.isNaN(dayStart(from).getTime()) || Number.isNaN(dayStart(to).getTime())) {
    throw new HttpError(400, "Please choose a valid date range.");
  }
  if (from > to) throw new HttpError(400, "The start date must come before the end date.");
  const start = dayStart(from);
  const end = new Date(dayStart(to).getTime() + DAY);
  const length = Math.round((end.getTime() - start.getTime()) / DAY);
  if (length > MAX_RANGE_DAYS) throw new HttpError(400, `Please choose a range of up to ${MAX_RANGE_DAYS} days.`);

  const { orders } = await collections();
  const match = { createdAt: { $gte: start, $lt: end }, status: { $ne: "Cancelled" } };
  const [totalRows, dayRows, productRows] = await Promise.all([
    orders.aggregate<{ orders: number; units: number; grossSales: number; netSales: number; deliveryFees: number; revenue: number; collected: number }>([
      { $match: match },
      { $addFields: {
        gross: { $reduce: { input: "$items", initialValue: 0, in: { $add: ["$$value", { $multiply: [{ $ifNull: ["$$this.originalPrice", "$$this.price"] }, "$$this.qty"] }] } } },
        units: { $sum: "$items.qty" },
      } },
      { $group: {
        _id: null,
        orders: { $sum: 1 },
        units: { $sum: "$units" },
        grossSales: { $sum: "$gross" },
        netSales: { $sum: "$subtotal" },
        deliveryFees: { $sum: "$deliveryFee" },
        revenue: { $sum: "$total" },
        collected: { $sum: { $cond: [{ $eq: ["$payment.status", "Paid"] }, "$total", 0] } },
      } },
    ]).toArray(),
    orders.aggregate<{ _id: string; sales: number; orders: number }>([
      { $match: match },
      { $group: { _id: { $dateToString: { date: "$createdAt", format: "%Y-%m-%d", timezone: TIME_ZONE } }, sales: { $sum: "$total" }, orders: { $sum: 1 } } },
    ]).toArray(),
    orders.aggregate<{ _id: unknown; name: string; image: string; units: number; revenue: number }>([
      { $match: match },
      { $unwind: "$items" },
      { $group: { _id: "$items.productId", name: { $last: "$items.name" }, image: { $last: "$items.image" }, units: { $sum: "$items.qty" }, revenue: { $sum: { $multiply: ["$items.price", "$items.qty"] } } } },
      { $sort: { revenue: -1 } },
      { $limit: 10 },
    ]).toArray(),
  ]);

  const round = (value: number) => Math.round(value * 100) / 100;
  const t = totalRows[0] ?? { orders: 0, units: 0, grossSales: 0, netSales: 0, deliveryFees: 0, revenue: 0, collected: 0 };
  const byDay = new Map(dayRows.map((row) => [row._id, row]));
  const days = Array.from({ length }, (_, index) => {
    const day = dayKey(new Date(start.getTime() + index * DAY + DAY / 2));
    return { day, sales: round(byDay.get(day)?.sales ?? 0), orders: byDay.get(day)?.orders ?? 0 };
  });
  res.json({
    from,
    to,
    totals: {
      orders: t.orders,
      units: t.units,
      grossSales: round(t.grossSales),
      discounts: round(t.grossSales - t.netSales),
      netSales: round(t.netSales),
      deliveryFees: round(t.deliveryFees),
      revenue: round(t.revenue),
      collected: round(t.collected),
      outstanding: round(t.revenue - t.collected),
      averageOrder: t.orders ? round(t.revenue / t.orders) : 0,
    },
    days,
    topProducts: productRows.map((row) => ({ productId: row._id, name: row.name, image: row.image, units: row.units, revenue: round(row.revenue) })),
  });
});

// Customer feedback. The admin can read it all and remove anything unfit to show.
router.get("/reviews", async (req, res) => {
  const params = queryParams(req.query);
  const { reviews, products } = await collections();
  const { page, limit, skip } = paging(params, 15);
  const filter: Filter<ReviewDoc> = {};
  const rating = Number(params.get("rating"));
  if (Number.isInteger(rating) && rating >= 1 && rating <= 5) filter.rating = rating;
  const search = params.get("search")?.trim();
  if (search) {
    const pattern = { $regex: escapeRegex(search), $options: "i" };
    filter.$or = [{ userName: pattern }, { userEmail: pattern }, { comment: pattern }];
  }
  const [list, total] = await Promise.all([
    reviews.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
    reviews.countDocuments(filter),
  ]);
  const found = await products.find({ _id: { $in: list.map((review) => review.productId) } }, { projection: { name: 1, image: 1 } }).toArray();
  const byId = new Map(found.map((product) => [String(product._id), product]));
  const items = list.map((review) => ({ ...review, product: byId.get(String(review.productId)) ?? null }));
  res.json(pageOf(items, total, page, limit));
});

router.delete("/reviews/:id", async (req, res) => {
  const { reviews } = await collections();
  const review = await reviews.findOneAndDelete({ _id: asObjectId(req.params.id) });
  if (!review) throw new HttpError(404, "Feedback not found.");
  await refreshRating(review.productId);
  res.json({ ok: true });
});

// Categories
router.post("/categories", async (req, res) => {
  const { categories } = await collections();
  const { insertedId } = await categories.insertOne({ ...readCategory(body(req.body)), createdAt: new Date() });
  res.status(201).json({ _id: insertedId });
});

router.put("/categories/:id", async (req, res) => {
  const { categories, products } = await collections();
  const id = asObjectId(req.params.id);
  const values = readCategory(body(req.body));
  const result = await categories.updateOne({ _id: id }, { $set: values });
  if (!result.matchedCount) throw new HttpError(404, "Category not found.");
  await products.updateMany({ categoryId: id }, { $set: { category: values.name } });
  res.json({ ok: true });
});

router.delete("/categories/:id", async (req, res) => {
  const { categories, products } = await collections();
  const id = asObjectId(req.params.id);
  const used = await products.countDocuments({ categoryId: id });
  if (used) throw new HttpError(409, `Move or delete the ${used} products in this category first.`);
  const result = await categories.deleteOne({ _id: id });
  if (!result.deletedCount) throw new HttpError(404, "Category not found.");
  res.json({ ok: true });
});

export default router;
