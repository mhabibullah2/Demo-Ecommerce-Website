import { MongoClient, type ClientSession, type Collection, type Db, type Document, type ObjectId } from "mongodb";
import "./env.js";

// The client only connects on first use. One client is shared by the shop routes and BetterAuth.
export const client = new MongoClient(process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017");
export const DB_NAME = process.env.DB_NAME || "shopdesk";

export const ORDER_STATUSES = ["Pending", "Confirmed", "Shipped", "Delivered", "Cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_METHODS = ["Cash on Delivery", "bKash", "Nagad"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type PaymentStatus = "Unpaid" | "Awaiting check" | "Paid";
export type ExchangeStatus = "Requested" | "Approved" | "Rejected";

export interface CategoryDoc extends Document {
  name: string;
  description: string;
  image: string;
  createdAt: Date;
}

export interface ProductDoc extends Document {
  name: string;
  categoryId: ObjectId;
  category: string;
  description: string;
  image: string;
  gallery: string[];
  // price is the normal (list) price. The admin can take a percentage off it with discountPercent.
  price: number;
  discountPercent?: number;
  stock: number;
  featured: boolean;
  // Kept up to date whenever a review is added, changed or removed
  ratingAvg?: number;
  ratingCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReviewDoc extends Document {
  productId: ObjectId;
  userEmail: string;
  userName: string;
  rating: number;
  comment: string;
  // True when the reviewer has a delivered order containing this product
  verified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderItemDoc {
  productId: ObjectId;
  name: string;
  image: string;
  // The price the customer paid for one item (after any discount)
  price: number;
  // The normal price at that time. Older orders do not have it, so read it as price.
  originalPrice?: number;
  qty: number;
}

export interface OrderDoc extends Document {
  orderNo: string;
  userEmail: string;
  userName: string;
  items: OrderItemDoc[];
  subtotal: number;
  // Total taken off by discounts on this order (0 when there were none)
  discount?: number;
  deliveryFee: number;
  total: number;
  delivery: { name: string; phone: string; address: string; city: string };
  payment: { method: PaymentMethod; status: PaymentStatus; senderNumber?: string; transactionId?: string };
  exchange?: { status: ExchangeStatus; reason: string; requestedAt: Date };
  status: OrderStatus;
  history: { status: OrderStatus; at: Date }[];
  createdAt: Date;
}

let indexes: Promise<unknown> | null = null;

// Uses the same MongoDB connection as BetterAuth
export async function getDb(): Promise<Db> {
  const db = client.db(DB_NAME);
  indexes ??= Promise.all([
    db.collection("categories").createIndex({ name: 1 }, { unique: true }),
    db.collection("products").createIndex({ categoryId: 1, price: 1 }),
    db.collection("orders").createIndex({ orderNo: 1 }, { unique: true }),
    db.collection("orders").createIndex({ userEmail: 1, createdAt: -1 }),
    // One review per customer per product
    db.collection("productReviews").createIndex({ productId: 1, userEmail: 1 }, { unique: true }),
    db.collection("productReviews").createIndex({ createdAt: -1 }),
  ]).catch((err) => {
    indexes = null;
    throw err;
  });
  await indexes;
  return db;
}

export async function collections() {
  const db = await getDb();
  return {
    categories: db.collection<CategoryDoc>("categories") as Collection<CategoryDoc>,
    products: db.collection<ProductDoc>("products") as Collection<ProductDoc>,
    orders: db.collection<OrderDoc>("orders") as Collection<OrderDoc>,
    reviews: db.collection<ReviewDoc>("productReviews") as Collection<ReviewDoc>,
    counters: db.collection<{ _id: string; value: number }>("counters"),
    // Accounts are created by BetterAuth
    users: db.collection<{ name: string; email: string; image?: string; role?: string; createdAt: Date }>("user"),
  };
}

// An order and its stock change must succeed or fail together
export async function inTransaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
  await getDb();
  const session = client.startSession();
  try {
    return await session.withTransaction(() => work(session));
  } finally {
    await session.endSession();
  }
}
