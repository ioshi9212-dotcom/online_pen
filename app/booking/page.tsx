import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type SearchParams = { date?: string; busy?: string };

export default function BookingPage({ searchParams }: { searchParams: SearchParams }) {
  const params = new URLSearchParams();
  if (searchParams.date) params.set("date", searchParams.date);
  if (searchParams.busy) params.set("busy", searchParams.busy);
  const query = params.toString();
  redirect(`${query ? `/my?${query}` : "/my"}#booking-flow`);
}
