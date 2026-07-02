export function AppIconImage({ size = 180 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#F3A9BE"
      }}
    >
      <svg width={size} height={size} viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="512" height="512" rx="0" fill="#F3A9BE" />
        <g transform="translate(0 2)" stroke="#FFFFFF" strokeLinecap="round" strokeLinejoin="round">
          <path d="M189 405V268c0-18 14-32 32-32 11 0 21 6 27 14V144c0-19 15-34 34-34s34 15 34 34v112" strokeWidth="18" />
          <path d="M316 256v-76c0-18 14-32 32-32s32 14 32 32v102" strokeWidth="18" />
          <path d="M248 258v-96c0-18-14-32-32-32s-32 14-32 32v142" strokeWidth="18" />
          <path d="M184 305l-24-34c-11-16-33-20-49-9-15 11-18 32-8 47l66 96c24 35 64 55 106 55h34c58 0 105-47 105-105v-61c0-18-14-32-32-32s-32 14-32 32v28" strokeWidth="18" />
          <path d="M282 109c9 0 17 8 17 17v29h-34v-29c0-9 8-17 17-17Z" strokeWidth="10" />
          <path d="M216 129c8 0 15 7 15 15v27h-30v-27c0-8 7-15 15-15Z" strokeWidth="10" />
          <path d="M348 147c8 0 15 7 15 15v27h-30v-27c0-8 7-15 15-15Z" strokeWidth="10" />
          <path d="M382 262c8 0 15 7 15 15v27h-30v-27c0-8 7-15 15-15Z" strokeWidth="10" />
        </g>
      </svg>
    </div>
  );
}
