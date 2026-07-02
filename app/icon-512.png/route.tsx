import { ImageResponse } from "next/og";
import { AppIconImage } from "@/lib/appIconImage";

export const runtime = "edge";

export async function GET() {
  return new ImageResponse(<AppIconImage size={512} />, {
    width: 512,
    height: 512,
    headers: {
      "Cache-Control": "public, max-age=0, must-revalidate"
    }
  });
}
