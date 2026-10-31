import assert from "node:assert/strict";
import { describe, test, before, beforeEach, after } from "node:test";
import { addBusinessDays, todayBusinessDateKey, businessDateTimeFromKeyAndTime, businessDateFromKey } from "../lib/timezone";
import { loadModule } from "./load-module";
import * as signedSession from "../lib/signedSession";

const testUrl = process.env.TEST_DATABASE_URL;

// This suite deletes fixtures. It refuses every database except an explicitly
// supplied local PostgreSQL database named onlinepen_test.
if (testUrl) {
  const url = new URL(testUrl);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/onlinepen_test") throw new Error("TEST_DATABASE_URL must be a local onlinepen_test database");
  process.env.DATABASE_URL = testUrl;
}

describe("real PostgreSQL transactions", { skip: !testUrl, concurrency: false }, () => {
  let prisma: typeof import("../lib/prisma").prisma;
  let bookings: typeof import("../lib/bookings");
  let clients: typeof import("../lib/clientSync");
  let windows: typeof import("../lib/onlineWindows");
  let passwords: typeof import("../lib/adminPassword");
  const date = addBusinessDays(todayBusinessDateKey(), 7);
  const at = (time: string) => businessDateTimeFromKeyAndTime(date, time);
  let client: { id: string; phone: string; publicToken: string };
  let service: { id: string; price: number };
  before(async () => {
    process.env.ADMIN_SECRET = "database-test-secret-not-production";
    ({ prisma } = await import("../lib/prisma"));
    bookings = await import("../lib/bookings"); clients = await import("../lib/clientSync"); windows = await import("../lib/onlineWindows"); passwords = await import("../lib/adminPassword");
    await prisma.$connect();
  });
  beforeEach(async () => {
    await prisma.$transaction([prisma.booking.deleteMany(), prisma.waitlistEntry.deleteMany(), prisma.client.deleteMany(), prisma.service.deleteMany(), prisma.onlineWindow.deleteMany(), prisma.blockedSlot.deleteMany(), prisma.dayOverride.deleteMany(), prisma.scheduleRule.deleteMany(), prisma.setting.deleteMany()]);
    await prisma.scheduleRule.createMany({data:Array.from({length:7},(_,weekday)=>({weekday,startTime:"09:00",endTime:"20:00",isWorkingDay:true}))});
    client = await prisma.client.create({data:{firstName:"Test",lastName:"Client",phone:"79990000001",birthDate:new Date("1990-01-01"),status:"APPROVED"}});
    service = await prisma.service.create({data:{title:"Test service",price:2000,durationMinutes:60}});
  });
  after(async () => { await prisma?.$disconnect(); });
  const manual = (start: Date, extra = {}) => bookings.saveAdminBooking({clientId:client.id,serviceId:service.id,startAt:start,durationMinutes:60,status:"CONFIRMED",finalPrice:null,...extra});

  test("parallel manual bookings cannot claim the same interval", async () => {
    const result = await Promise.allSettled([manual(at("12:00")),manual(at("12:00"))]);
    assert.equal(result.filter((item)=>item.status==="fulfilled").length,1);
    assert.equal(await prisma.booking.count(),1);
    assert.equal((await prisma.booking.findFirstOrThrow()).finalPrice,2000);
  });

  test("online and manual paths share the same interval lock", async () => {
    await prisma.onlineWindow.create({data:{startAt:at("12:00")}});
    const result = await Promise.allSettled([manual(at("12:00")),bookings.bookOnline({clientId:client.id,serviceId:service.id,startAt:at("12:00"),comment:""})]);
    assert.equal(result.filter((item)=>item.status==="fulfilled").length,1);
    assert.equal(await prisma.booking.count({where:{status:{in:["PENDING","CONFIRMED"]}}}),1);
  });

  test("reactivating two overlapping history records admits one", async () => {
    const a = await manual(at("12:00"),{status:"CANCELLED_BY_ADMIN"});
    const b = await manual(at("12:00"),{status:"CANCELLED_BY_ADMIN"});
    const result = await Promise.allSettled([bookings.changeBookingStatus(a.id,"CONFIRMED"),bookings.changeBookingStatus(b.id,"CONFIRMED")]);
    assert.equal(result.filter((item)=>item.status==="fulfilled").length,1);
    assert.equal(await prisma.booking.count({where:{status:"CONFIRMED"}}),1);
  });

  test("failed reschedule retains the old booking; successful reschedule replaces it atomically", async () => {
    const old = await manual(at("10:00"));
    await manual(at("12:00"));
    await prisma.onlineWindow.createMany({data:[{startAt:at("12:00")},{startAt:at("15:00")},{startAt:at("17:00")}]});
    await assert.rejects(bookings.bookOnline({clientId:client.id,serviceId:service.id,startAt:at("12:00"),comment:"",rescheduleId:old.id}));
    assert.equal((await prisma.booking.findUniqueOrThrow({where:{id:old.id}})).status,"CONFIRMED");
    const result = await Promise.allSettled([bookings.bookOnline({clientId:client.id,serviceId:service.id,startAt:at("15:00"),comment:"",rescheduleId:old.id}),bookings.bookOnline({clientId:client.id,serviceId:service.id,startAt:at("17:00"),comment:"",rescheduleId:old.id})]);
    assert.equal(result.filter((item)=>item.status==="fulfilled").length,1);
    assert.equal((await prisma.booking.findUniqueOrThrow({where:{id:old.id}})).status,"CANCELLED_BY_CLIENT");
    assert.ok(await prisma.onlineWindow.findUnique({where:{startAt:old.startAt}}));
    assert.equal(await prisma.booking.count(),3);
  });

  test("a client cannot reschedule someone else's booking", async () => {
    const old = await manual(at("10:00"));
    const other = await prisma.client.create({data:{firstName:"Other",lastName:"Client",phone:"79990000002",birthDate:new Date("1992-01-01"),status:"APPROVED"}});
    await prisma.onlineWindow.create({data:{startAt:at("15:00")}});
    await assert.rejects(bookings.bookOnline({clientId:other.id,serviceId:service.id,startAt:at("15:00"),comment:"",rescheduleId:old.id}));
    assert.equal((await prisma.booking.findUniqueOrThrow({where:{id:old.id}})).status,"CONFIRMED");
  });

  test("registration never overwrites an approved person's identity", async () => {
    const result = await clients.syncPublicRegistration({firstName:"Changed",lastName:"Changed",phone:client.phone,birthDate:new Date("2001-01-01"),notes:"changed"});
    assert.equal(result.mode,"existing");
    const saved = await prisma.client.findUniqueOrThrow({where:{id:client.id}});
    assert.equal(saved.firstName,"Test"); assert.equal(saved.birthDate.toISOString().slice(0,10),"1990-01-01");
  });

  test("window replacement rolls back deletion when insertion fails", async () => {
    const old = await prisma.onlineWindow.create({data:{startAt:at("10:00")}});
    await prisma.$executeRawUnsafe(`CREATE FUNCTION fail_window_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'intentional integration-test failure'; END $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER fail_window_insert BEFORE INSERT ON "OnlineWindow" FOR EACH ROW EXECUTE FUNCTION fail_window_insert()`);
    try { await assert.rejects(windows.replaceOnlineWindows(date,["12:00","15:00"])); assert.ok(await prisma.onlineWindow.findUnique({where:{id:old.id}})); assert.equal(await prisma.onlineWindow.count(),1); }
    finally { await prisma.$executeRawUnsafe(`DROP TRIGGER fail_window_insert ON "OnlineWindow"`); await prisma.$executeRawUnsafe(`DROP FUNCTION fail_window_insert()`); }
  });

  test("duplicate merge requires explicit selection and rolls back links and deletion on failure", async () => {
    const duplicate = await prisma.client.create({data:{firstName:"Duplicate",lastName:"Client",phone:"79990000002",birthDate:new Date("1990-01-01"),status:"APPROVED"}});
    const linked = await manual(at("10:00"),{clientId:duplicate.id});
    const input = {id:client.id,firstName:"Merged",lastName:"Client",phone:duplicate.phone,birthDate:new Date("1990-01-01"),status:"APPROVED"};
    await assert.rejects(clients.saveAdminClient(input),clients.DuplicateClientError);
    await prisma.$executeRawUnsafe(`CREATE FUNCTION fail_client_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'intentional integration-test failure'; END $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER fail_client_update BEFORE UPDATE ON "Client" FOR EACH ROW EXECUTE FUNCTION fail_client_update()`);
    try { await assert.rejects(clients.saveAdminClient({...input,mergeClientId:duplicate.id})); assert.ok(await prisma.client.findUnique({where:{id:duplicate.id}})); assert.equal((await prisma.booking.findUniqueOrThrow({where:{id:linked.id}})).clientId,duplicate.id); }
    finally { await prisma.$executeRawUnsafe(`DROP TRIGGER fail_client_update ON "Client"`); await prisma.$executeRawUnsafe(`DROP FUNCTION fail_client_update()`); }
    assert.equal((await clients.saveAdminClient({...input,mergeClientId:duplicate.id})).mode,"merged");
    assert.equal((await prisma.booking.findUniqueOrThrow({where:{id:linked.id}})).clientId,client.id);
  });

  test("password change revokes a previously valid admin cookie", async () => {
    await prisma.setting.create({data:{key:"admin_password",value:"old-test-password"}});
    const version = await passwords.verifyAdminPassword("old-test-password"); assert.equal(version,"initial");
    assert.ok((await prisma.setting.findUniqueOrThrow({where:{key:"admin_password"}})).value.startsWith("scrypt$"));
    const cookie = signedSession.signSession(String(version),"admin",600);
    const admin = loadModule("lib/admin.ts",{"next/headers":{cookies:async()=>({get:()=>({value:cookie})})},"@/lib/prisma":{prisma},"@/lib/adminPassword":passwords,"@/lib/signedSession":signedSession});
    assert.equal(await admin.isAdmin(),true);
    await passwords.changeAdminPassword("new-test-password");
    assert.equal(await admin.isAdmin(),false);
    assert.equal(await passwords.verifyAdminPassword("old-test-password"),false);
    assert.ok(await passwords.verifyAdminPassword("new-test-password"));
  });

  test("closed days and invalid times cannot replace published windows", async () => {
    const old = await prisma.onlineWindow.create({data:{startAt:at("10:00")}});
    await assert.rejects(windows.replaceOnlineWindows(date,["25:00"]));
    assert.ok(await prisma.onlineWindow.findUnique({where:{id:old.id}}));
    await prisma.dayOverride.create({data:{date:businessDateFromKey(date),kind:"DAY_OFF"}});
    await assert.rejects(windows.replaceOnlineWindows(date,["12:00"]));
    await assert.rejects(bookings.bookOnline({clientId:client.id,serviceId:service.id,startAt:old.startAt,comment:""}));
  });
  test("account attempt limits persist in PostgreSQL", async () => {
    const limiter = loadModule("lib/authRateLimit.ts", {"node:crypto":await import("node:crypto"),"next/headers":{headers:async()=>new Headers({"x-forwarded-for":"127.0.0.1"})},"@/lib/prisma":{prisma},"@/lib/rateLimit":await import("../lib/rateLimit"),"@/lib/signedSession":signedSession});
    for (let i=0;i<10;i++) assert.equal(await limiter.allowAuthAttempt("client","79990000001"),true);
    assert.equal(await limiter.allowAuthAttempt("client","79990000001"),false);
    const rows = await prisma.setting.findMany({where:{key:{startsWith:"auth_rate:"}}});
    assert.ok(rows.length >= 2);
    assert.equal(rows.some((row)=>row.key.includes("79990000001")),false);
  });

  test("bookings pagination exposes new records after more than 100 old records", async () => {
    const oldStart = new Date(Date.now() - 30*24*60*60_000);
    await prisma.booking.createMany({data:Array.from({length:101},(_,index)=>({id:`history-${index}`,clientId:client.id,serviceId:service.id,startAt:new Date(oldStart.getTime()+index*60_000),endAt:new Date(oldStart.getTime()+(index+1)*60_000),status:"COMPLETED" as const}))});
    const future = await manual(at("12:00"));
    const page = loadModule("app/admin/bookings/page.tsx", {"@/app/admin/actions":{},"@/lib/admin":{isAdmin:async()=>true},"@/lib/format":await import("../lib/format"),"@/lib/statusLabels":await import("../lib/statusLabels"),"@/lib/prisma":{prisma},"@/lib/timezone":await import("../lib/timezone"),"@/lib/validation":await import("../lib/validation"),"next/navigation":{redirect:()=>{throw new Error("unexpected redirect")}},"@/app/SubmitButton":{}});
    const ids = (node: any): string[] => !node ? [] : Array.isArray(node) ? node.flatMap(ids) : typeof node === "object" ? [...(node.type === "article" ? [node.key] : []), ...ids(node.props?.children)] : [];
    assert.deepEqual(ids(await page.default({searchParams:Promise.resolve({})})),[future.id]);
    assert.equal(ids(await page.default({searchParams:Promise.resolve({view:"history",page:"2"})})).length,30);
  });

});
