// Discounts: the admin sets a percentage on a product. The normal price stays as it is,
// and the price a customer pays is worked out here, in one place, for the whole API.

export const MAX_DISCOUNT = 90;

export function salePriceOf(price: number, discountPercent = 0): number {
  if (!discountPercent) return price;
  return Math.round(price * (100 - discountPercent)) / 100;
}

// Adds discountPercent and salePrice to a product, including older products that have neither
export function priced<T extends { price: number; discountPercent?: number }>(product: T) {
  const discountPercent = product.discountPercent ?? 0;
  return { ...product, discountPercent, salePrice: salePriceOf(product.price, discountPercent) };
}
