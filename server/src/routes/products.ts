import { Router } from "express";
import { collections } from "../config/db.js";
import { featuredProducts, findProduct, productsByIds, searchProducts } from "../lib/catalog.js";
import { ratingSummary, refreshRating } from "../lib/reviews.js";
import { asObjectId, body, HttpError, number, optionalText, pageOf, paging, queryParams } from "../lib/validate.js";
import { currentUser, requireUser } from "../middleware/auth.js";

// Public: anyone can browse the shop
const router = Router();

router.get("/", async (req, res) => {
  res.json(await searchProducts(queryParams(req.query)));
});

router.get("/featured", async (_req, res) => {
  res.json(await featuredProducts());
});

// The cart re-reads its products, so it always shows today's price and stock
router.get("/by-ids", async (req, res) => {
  res.json(await productsByIds(typeof req.query.ids === "string" ? req.query.ids : ""));
});

router.get("/:id", async (req, res) => {
  res.json(await findProduct(req.params.id));
});

// Feedback and ratings. Anyone can read them. Only a logged-in customer can write one.
router.get("/:id/reviews", async (req, res) => {
  const productId = asObjectId(req.params.id);
  const { reviews } = await collections();
  const { page, limit, skip } = paging(queryParams(req.query), 6);
  const user = await currentUser(req);
  const [summary, items, total, mine] = await Promise.all([
    ratingSummary(productId),
    // The reviewer's email is never sent to the browser
    reviews.find({ productId }, { projection: { userEmail: 0 } }).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
    reviews.countDocuments({ productId }),
    user ? reviews.findOne({ productId, userEmail: user.email }, { projection: { userEmail: 0 } }) : null,
  ]);
  res.json({ summary, mine, ...pageOf(items, total, page, limit) });
});

// Adds the customer's review, or replaces it when they already wrote one (one review per product)
router.put("/:id/reviews", requireUser, async (req, res) => {
  const user = res.locals.user;
  if (user.role === "admin") throw new HttpError(403, "The shop owner cannot review products.");
  const productId = asObjectId(req.params.id);
  const { products, orders, reviews } = await collections();
  if (!(await products.findOne({ _id: productId }, { projection: { _id: 1 } }))) throw new HttpError(404, "Product not found.");
  const data = body(req.body);
  const rating = number(data.rating, "Rating", { min: 1, max: 5, integer: true });
  const comment = optionalText(data.comment, "Feedback", 1000);
  const verified = Boolean(await orders.findOne({ userEmail: user.email, status: "Delivered", "items.productId": productId }, { projection: { _id: 1 } }));
  const now = new Date();
  await reviews.updateOne(
    { productId, userEmail: user.email },
    { $set: { userName: user.name, rating, comment, verified, updatedAt: now }, $setOnInsert: { createdAt: now } },
    { upsert: true },
  );
  await refreshRating(productId);
  res.status(201).json({ ok: true });
});

router.delete("/:id/reviews/mine", requireUser, async (req, res) => {
  const productId = asObjectId(req.params.id);
  const { reviews } = await collections();
  const result = await reviews.deleteOne({ productId, userEmail: res.locals.user.email });
  if (!result.deletedCount) throw new HttpError(404, "You have not reviewed this product.");
  await refreshRating(productId);
  res.json({ ok: true });
});

export default router;
