import Image from "next/image";

/** A single image for site branding; no image-optimizer CPU on the small Amvera plan. */
export default function BrandMark({ className = "", size = 44 }: { className?: string; size?: number }) {
  return (
    <Image
      src="/icon-512.png"
      alt=""
      aria-hidden="true"
      className={["online-pen-logo", className].filter(Boolean).join(" ")}
      width={size}
      height={size}
      unoptimized
    />
  );
}
