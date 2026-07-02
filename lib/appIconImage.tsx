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
        <rect width="512" height="512" fill="#F3A9BE" />
        <path
          d="M174 438c36-44 48-70 42-105-5-30-31-96-21-126 9-28 42-54 68-77 31-28 54-61 48-88-1-5-6-5-10-2-28 21-48 56-70 84m-23 79c28-42 56-81 100-91 29-6 63-16 82-43 3-5 1-9-5-9-33 2-68 17-97 33m-33 120c45-12 91-13 137 4 18 7 36 12 60 2 5-2 5-7 1-10-25-18-61-30-100-30-35 0-65 5-94 20zm38 45c24-7 49-4 71 9 17 10 36 16 60 8 5-2 6-7 2-10-24-21-57-33-95-36-14-1-27 0-38 4zm-25-72c-41 28-76 66-86 109-6 27 14 77 26 114 17 54 5 91-50 150m180-184c21-40 26-72 12-114-8-24-26-56-18-80"
          stroke="#FFFFFF"
          strokeWidth="12"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M282 85c-14 19-24 38-26 53 22 4 42-15 55-48m36 31c-16 9-31 18-45 28 24 6 51-6 66-30m-5 102c15 12 34 20 58 20-10-19-34-31-58-36m-39 55c11 23 30 38 55 43-7-22-28-39-55-50"
          stroke="#FFFFFF"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
