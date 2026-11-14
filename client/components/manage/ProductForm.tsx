"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import type { Category, Product } from "@/lib/types";
import { useData } from "@/lib/use-data";
import { Field, ImageField } from "@/components/manage/ui";
import { money } from "@/lib/format";

export default function ProductForm({ product }: { product?: Product }) {
  const router = useRouter();
  const { data: categories } = useData<Category[]>("/api/categories");
  const [name, setName] = useState(product?.name ?? "");
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [image, setImage] = useState(product?.image ?? "");
  const [gallery, setGallery] = useState((product?.gallery ?? []).join("\n"));
  const [price, setPrice] = useState(product ? String(product.price) : "");
  const [discount, setDiscount] = useState(product?.discountPercent ? String(product.discountPercent) : "");
  const [stock, setStock] = useState(product ? String(product.stock) : "0");
  const [featured, setFeatured] = useState(product?.featured ?? false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const body = { name, categoryId, description, image, gallery: gallery.split("\n"), price, discountPercent: discount, stock, featured };
      if (product) await api(`/api/manage/products/${product._id}`, { method: "PUT", body });
      else await api("/api/manage/products", { method: "POST", body });
      toast.success(product ? "Product saved." : "Product added.");
      router.push("/manage/products");
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-3xl space-y-4">
      <Field label="Name"><input required minLength={2} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className="input w-full" /></Field>
      <Field label="Category">
        <select required value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="select w-full">
          <option value="" disabled>Choose a category</option>
          {categories?.map((category) => <option key={category._id} value={category._id}>{category.name}</option>)}
        </select>
      </Field>
      <ImageField value={image} onChange={setImage} />
      <Field label="More photos (optional)" hint="One image link per line, up to 6.">
        <textarea rows={3} value={gallery} onChange={(event) => setGallery(event.target.value)} className="textarea w-full" />
      </Field>
      <Field label="Details"><textarea required rows={4} maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} className="textarea w-full" /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Price (৳)"><input type="number" required min={1} step="any" value={price} onChange={(event) => setPrice(event.target.value)} className="input w-full" /></Field>
        <Field label="Discount (%)" hint="Optional. Customers see the normal price crossed out and the new price next to it.">
          <input type="number" min={0} max={90} step={1} placeholder="0" value={discount} onChange={(event) => setDiscount(event.target.value)} className="input w-full" />
        </Field>
        <Field label="Stock"><input type="number" required min={0} step={1} value={stock} onChange={(event) => setStock(event.target.value)} className="input w-full" /></Field>
      </div>
      {Number(discount) > 0 && Number(price) > 0 && (
        <p className="rounded-field bg-base-200 p-3 text-sm">
          Customers will see <span className="figure text-base-content/55 line-through">{money(Number(price))}</span> <span className="figure font-semibold">{money(Math.round(Number(price) * (100 - Number(discount))) / 100)}</span>, a saving of <span className="figure font-semibold">{money(Number(price) - Math.round(Number(price) * (100 - Number(discount))) / 100)}</span> ({Math.round(Number(discount))}% off).
        </p>
      )}
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" className="checkbox checkbox-sm checkbox-primary" checked={featured} onChange={(event) => setFeatured(event.target.checked)} />
        Show on the home page
      </label>
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={busy}>{busy && <span className="loading loading-spinner loading-xs" />} {product ? "Save product" : "Add product"}</button>
        <button type="button" className="btn btn-ghost" onClick={() => router.push("/manage/products")}>Cancel</button>
      </div>
    </form>
  );
}
