import Link from "next/link";
import Logo from "@/components/Logo";

export default function Footer() {
  return (
    <footer className="no-print mt-auto bg-neutral text-neutral-content">
      <div className="page-shell grid gap-8 py-10 sm:grid-cols-3">
        <div>
          <span className="text-white"><Logo /></span>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-neutral-content/75">Home appliances, wardrobes, office equipment, automobiles and phones, all in one online catalog.</p>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white">Shop</h2>
          <ul className="mt-3 space-y-2 text-sm text-neutral-content/75">
            <li><Link href="/products" className="hover:text-white">All products</Link></li>
            <li><Link href="/cart" className="hover:text-white">Cart</Link></li>
            <li><Link href="/orders" className="hover:text-white">Track my orders</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white">Payment and exchange</h2>
          <ul className="mt-3 space-y-2 text-sm text-neutral-content/75">
            <li>bKash, Nagad or cash on delivery</li>
            <li>Exchange within 7 days of delivery</li>
            <li>Free delivery from ৳5,000</li>
          </ul>
        </div>
      </div>
      <p className="border-t border-white/10 py-4 text-center text-xs text-neutral-content/60">© {new Date().getFullYear()} ShopDesk. Demo project with sample data.</p>
    </footer>
  );
}
