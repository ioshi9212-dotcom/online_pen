import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type SearchParams = { client?: string; date?: string; time?: string; busy?: string };

export default function BookingPage({ searchParams }: { searchParams: SearchParams }) {
  const token = searchParams.client;
  if (!token) redirect("/login");

  const params = new URLSearchParams({ client: token });
  if (searchParams.date) params.set("date", searchParams.date);
  if (searchParams.time) params.set("time", searchParams.time);
  if (searchParams.busy) params.set("busy", searchParams.busy);

  redirect(`/my?${params.toString()}#booking-builder`);
}
