import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type SearchParams = { client?: string; date?: string; time?: string; busy?: string };

export default async function BookingPage({ searchParams: searchParamsPromise }: { searchParams: Promise<SearchParams> }) {
  const searchParams = (await searchParamsPromise) || {};

  const params = new URLSearchParams();
  if (searchParams.date) params.set("date", searchParams.date);
  if (searchParams.time) params.set("time", searchParams.time);
  if (searchParams.busy) params.set("busy", searchParams.busy);

  redirect(`/my?${params.toString()}#booking-builder`);
}
