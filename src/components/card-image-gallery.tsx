"use client";

import { useState } from "react";
import { ImageIcon } from "lucide-react";

export function CardImageGallery({
  images,
  name,
}: {
  images: string[];
  name: string;
}) {
  const uniqueImages = [...new Set(images.filter(Boolean))];
  const [active, setActive] = useState(0);
  const safeActive = Math.min(active, Math.max(uniqueImages.length - 1, 0));
  const image = uniqueImages[safeActive] ?? null;

  return (
    <div className="min-w-0">
      <div className="relative aspect-[2.5/3.5] overflow-hidden rounded-xl border border-app-border bg-panel shadow-2xl shadow-[var(--shadow)] sm:rounded-2xl">
        {image ? (
          <img
            src={image}
            alt={`${name} — ảnh ${safeActive + 1}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full place-items-center text-muted">
            <ImageIcon size={42} />
          </div>
        )}
        <span className="absolute bottom-2 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-white/20 bg-black/55 px-2.5 py-1 text-[10px] text-white backdrop-blur">
          <ImageIcon size={11} />
          <strong>
            {image ? safeActive + 1 : 0}/{uniqueImages.length}
          </strong>
        </span>
      </div>
      {uniqueImages.length > 1 && (
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
          {uniqueImages.map((url, index) => (
            <button
              type="button"
              key={`${url}-${index}`}
              onClick={() => setActive(index)}
              aria-label={`Xem ảnh ${index + 1}`}
              className={`h-12 w-9 shrink-0 overflow-hidden rounded-md border-2 ${
                safeActive === index ? "border-violet-500" : "border-app-border"
              }`}
            >
              <img src={url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
