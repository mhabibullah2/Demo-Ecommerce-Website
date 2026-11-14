import { Star } from "lucide-react";

// Read-only stars, filled to the nearest half. The number is for screen readers.
export default function StarRating({ value, size = "size-4" }: { value: number; size?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => {
        const fill = Math.max(0, Math.min(1, value - (star - 1)));
        return (
          <span key={star} className={`relative inline-block ${size}`}>
            <Star className={`absolute inset-0 ${size} text-base-content/25`} />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star className={`${size} fill-warning text-warning`} />
            </span>
          </span>
        );
      })}
    </span>
  );
}
