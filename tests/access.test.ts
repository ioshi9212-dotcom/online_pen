import assert from "node:assert/strict";
import test from "node:test";
import { BookingError } from "../lib/bookings";
import { loadModule } from "./load-module";
import * as validation from "../lib/validation";
import * as timezone from "../lib/timezone";
import { sameOriginRequest } from "../lib/sameOrigin";
import { NextResponse } from "next/server";

class Redirect extends Error { constructor(public target: string) { super(target); } }
const navigation = { redirect: (target: string) => { throw new Redirect(target); } };
function actionMocks(extra: Record<string, unknown> = {}) {
  return { "@/lib/avatarUpload": {}, "@/lib/bookingRemember": {}, "@/lib/prisma": {}, "@/lib/format": { formatPhone: (value: string) => value }, "@/lib/clientSync": {}, "@/lib/clientSession": {}, "@/lib/authRateLimit": { allowAuthAttempt: async () => true }, "@/lib/validation": validation, "@/lib/bookings": {BookingError}, "next/cache": { revalidatePath: () => {} }, "next/navigation": navigation, ...extra };
}

test("registration of an approved phone never issues a session", async () => {
  let sessions = 0;
  const action = loadModule("app/actions.ts", actionMocks({ "@/lib/clientSync": { syncPublicRegistration: async () => ({ mode: "existing", client: { status: "APPROVED", publicToken: "never-publish-this-token" } }) }, "@/lib/clientSession": { setClientCookie: async () => { sessions++; } } }));
  const form = new FormData();
  for (const [key,value] of Object.entries({firstName:"Test",lastName:"Client",phone:"79990000001",birthDate:"2000-01-01"})) form.set(key,value);
  await assert.rejects(action.registerClient(form), (error: unknown) => error instanceof Redirect && error.target === "/login?known=1");
  assert.equal(sessions, 0);
});

test("a booking action uses the cookie client rather than a submitted token", async () => {
  let submittedClient = "";
  const action = loadModule("app/actions.ts", actionMocks({ "@/lib/clientSession": { requireClient: async () => ({ id: "session-owner" }) }, "@/lib/bookings": { BookingError, bookOnline: async (input: {clientId:string}) => { submittedClient=input.clientId; return {id:"new-booking"}; } } }));
  const form = new FormData(); form.set("clientToken","another-client-token"); form.set("startAt","2030-01-01T02:00:00Z");
  await assert.rejects(action.createBooking({error:""},form), (error: unknown) => error instanceof Redirect && error.target === "/my?created=new-booking");
  assert.equal(submittedClient, "session-owner");
});

test("a bare legacy cabinet URL cannot authenticate without a cookie", async () => {
  const module = loadModule("app/my/page.tsx", {
    "@/lib/schedule": {}, "@/lib/availability": {}, "@/app/SubmitButton": {}, "@/app/actions": {}, "@/app/ClientBookingPicker": {}, "@/lib/bookingRemember": {}, "@/lib/onlineBookingCutoff": {}, "@/lib/prisma": { prisma: { client: { findUnique: () => { throw new Error("Must not query using URL token"); } } } }, "@/lib/format": {}, "@/lib/clientSession": { getClientCookie: async () => "" }, "@/lib/timezone": timezone, "next/navigation": navigation, "./my-page-compact.module.css": {}
  });
  await assert.rejects(module.default({searchParams:Promise.resolve({client:"known-legacy-token"})}), (error: unknown) => error instanceof Redirect && error.target === "/login");
});

test("profile JSON cannot use a bare submitted token to update another client", async () => {
  let writes = 0;
  const module = loadModule("app/api/profile/update/route.ts", { "@/lib/validation": validation, "@/lib/sameOrigin": {sameOriginRequest}, "@/lib/avatarUpload": {}, "@/lib/clientSession": {getClientCookie:async()=>""}, "@/lib/format": {formatPhone:(value:string)=>value}, "@/lib/prisma": {prisma:{client:{update:async()=>{writes++;}}}}, "next/server":{NextResponse} });
  const response = await module.POST(new Request("http://localhost/api/profile/update",{method:"POST",headers:{origin:"http://localhost","content-type":"application/json"},body:JSON.stringify({clientToken:"legacy-token",firstName:"Test",lastName:"Client",phone:"79990000001",birthDate:"2000-01-01"})}));
  assert.equal(response.status,401); assert.equal(writes,0);
});

test("JSON mutations reject a different origin", () => {
  assert.equal(sameOriginRequest(new Request("https://example.test/path",{headers:{origin:"https://attacker.test"}})),false);
});
