import { ImageResponse } from "next/og";
import { AppIconImage } from "@/lib/appIconImage";

export const runtime = "edge";

export async function GET() {
  return new ImageResponse(<AppIconImage size={180} />, {
    width: 180,
    height: 180,
    headers: {
      "Cache-Control": "public, max-age=0, must-revalidate"
    }
  });
}
