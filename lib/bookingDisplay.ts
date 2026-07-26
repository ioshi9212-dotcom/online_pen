import { stripBookingMarks } from "@/lib/bookingRemember";

const BUNDLE_COMMENT_PREFIX = "Услуги: ";

export function bookingDisplayTitle(serviceTitle: string, clientComment?: string | null) {
  const firstLine = stripBookingMarks(clientComment).split("\n")[0]?.trim() || "";
  return firstLine.startsWith(BUNDLE_COMMENT_PREFIX)
    ? firstLine.slice(BUNDLE_COMMENT_PREFIX.length).trim() || serviceTitle
    : serviceTitle;
}

export function bookingDisplayComment(clientComment?: string | null) {
  const lines = stripBookingMarks(clientComment).split("\n");
  if (lines[0]?.startsWith(BUNDLE_COMMENT_PREFIX)) lines.shift();
  return lines.join("\n").trim();
}
