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
  let presets: typeof import("../lib/windowPresets");
  let passwords: typeof import("../lib/adminPassword");
  const date = addBusinessDays(todayBusinessDateKey(), 7);
  const at = (time: string) => businessDateTimeFromKeyAndTime(date, time);
  let client: { id: string; phone: string; publicToken: string };
  let service: { id: string; price: number };
  before(async () => {
    process.env.ADMIN_SECRET = "database-test-secret-not-production";
    ({ prisma } = await import("../lib/prisma"));
    bookings = await import("../lib/bookings"); clients = await import("../lib/clientSync"); windows = await import("../lib/onlineWindows"); presets = await import("../lib/windowPresets"); passwords = await import("../lib/adminPassword");
    await prisma.$connect();
  });
  beforeEach(async () => {
    await prisma.$transaction([prisma.booking.deleteMany(), prisma.waitlistEntry.deleteMany(), prisma.pushSubscription.deleteMany(), prisma.client.deleteMany(), prisma.service.deleteMany(), prisma.onlineWindow.deleteMany(), prisma.blockedSlot.deleteMany(), prisma.dayOverride.deleteMany(), prisma.scheduleRule.deleteMany(), prisma.setting.deleteMany()]);
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
    await prisma.onlineWindow.create({data:{startAt:at("10:00")}});
    const old = await bookings.bookOnline({clientId:client.id,serviceId:service.id,startAt:at("10:00"),comment:""});
    await bookings.changeBookingStatus(old.id, "CONFIRMED");
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


  test("public registration is persisted after disconnect and cannot create a duplicate", async () => {
    const phone = "79990000003";
    const birthDate = new Date("1996-04-12T00:00:00.000Z");
    const result = await clients.syncPublicRegistration({
      firstName: "Новая", lastName: "Клиентка",
      phone: "+7 (999) 000-00-03", birthDate, notes: "Первая заявка"
    });
    assert.equal(result.mode, "created");
    assert.equal(result.client.status, "PENDING");
    assert.equal(result.client.phone, phone);

    await prisma.$disconnect();
    await prisma.$connect();

    const saved = await prisma.client.findUniqueOrThrow({ where: { phone } });
    assert.equal(saved.id, result.client.id);
    assert.equal(saved.publicToken, result.client.publicToken);
    assert.equal(saved.notes, "Первая заявка");
    assert.equal(saved.birthDate.toISOString().slice(0, 10), "1996-04-12");

    const retry = await clients.syncPublicRegistration({
      firstName: "Чужое", lastName: "Имя",
      phone: "8 999 000 00 03", birthDate: new Date("2004-01-01T00:00:00.000Z")
    });
    assert.equal(retry.mode, "existing");
    assert.equal(await prisma.client.count({ where: { phone } }), 1);
    assert.equal((await prisma.client.findUniqueOrThrow({ where: { phone } })).firstName, "Новая");
  });

  test("rejected applicant can reapply without deleting identity, history or master notes", async () => {
    const phone = "79990000004";
    const original = await prisma.client.create({
      data: {
        firstName: "Прежнее", lastName: "Имя", phone, birthDate: new Date("1997-05-20T00:00:00.000Z"),
        status: "REJECTED", notes: "Заметка мастера", approvedAt: null
      }
    });
    const savedBooking = await manual(at("11:00"), {clientId:original.id, status:"COMPLETED"});
    await prisma.waitlistEntry.create({
      data: {clientId: original.id, status:"CLOSED", mode:"NEAREST", note:"История ожидания"}
    });
    const applied = await clients.syncPublicRegistration({
      firstName:"Исправленное", lastName:"Имя", phone:"8 (999) 000-00-04",
      birthDate: original.birthDate, notes:"Прошу рассмотреть ещё раз"
    });
    assert.equal(applied.mode, "reapplied");
    assert.equal(applied.client.id, original.id);
    assert.equal(applied.client.publicToken, original.publicToken);
    assert.equal(applied.client.status, "PENDING");
    assert.match(applied.client.notes, /Заметка мастера/);
    assert.match(applied.client.notes, /Прошу рассмотреть ещё раз/);
    assert.equal((await prisma.booking.findUniqueOrThrow({where:{id:savedBooking.id}})).clientId, original.id);
    assert.equal(await prisma.waitlistEntry.count({where:{clientId:original.id}}), 1);
    assert.equal(await prisma.client.count({where:{phone}}), 1);

    const reappliedTwice = await clients.syncPublicRegistration({
      firstName:"Кто угодно", lastName:"Другой", phone,
      birthDate: original.birthDate
    });
    assert.equal(reappliedTwice.mode, "existing");
    assert.equal((await prisma.client.findUniqueOrThrow({where:{phone}})).firstName, "Исправленное");
  });

  test("reapplication cannot change rejected identity with wrong birth date or revive a banned account", async () => {
    const rejected = await prisma.client.create({
      data: {firstName:"Анна",lastName:"Пример",phone:"79990000005",birthDate:new Date("1996-07-10T00:00:00.000Z"),status:"REJECTED"}
    });
    const banned = await prisma.client.create({
      data: {firstName:"Вера",lastName:"Пример",phone:"79990000006",birthDate:new Date("1996-07-10T00:00:00.000Z"),status:"BANNED"}
    });
    const wrong = await clients.syncPublicRegistration({
      firstName:"Другая",lastName:"Другая",phone:rejected.phone,
      birthDate:new Date("2000-07-10T00:00:00.000Z")
    });
    const disallowed = await clients.syncPublicRegistration({
      firstName:"Другая",lastName:"Другая",phone:banned.phone,
      birthDate:banned.birthDate
    });
    assert.equal(wrong.mode, "existing");
    assert.equal(disallowed.mode, "existing");
    assert.equal((await prisma.client.findUniqueOrThrow({where:{id:rejected.id}})).status,"REJECTED");
    assert.equal((await prisma.client.findUniqueOrThrow({where:{id:banned.id}})).status,"BANNED");
    assert.equal(await prisma.client.count({where:{phone:{in:[rejected.phone,banned.phone]}}}),2);
  });

  test("real action flow: register, approve, log in, book, waitlist, reconnect, cancel", async () => {
    class Redirect extends Error { constructor(public target: string) { super(target); } }
    const redirects = {redirect: (target: string) => {throw new Redirect(target);}};
    let issuedCookie = "";
    const auth = {
      requireClient: async () => {
        const token = signedSession.readSession(issuedCookie,"client");
        if (!token) throw new Error("No authenticated client");
        const saved = await prisma.client.findUniqueOrThrow({where:{publicToken:token}});
        if (saved.status !== "APPROVED") throw new Error("Not approved");
        return saved;
      },
      setPendingCookie: async (token: string) => {
        const cookie = signedSession.signSession(token,"pending",14*24*60*60);
        assert.equal(signedSession.readSession(cookie,"pending"),token);
        assert.equal(signedSession.readSession(cookie,"client"),"");
      },
      setClientCookie: async (token: string) => {
        issuedCookie = signedSession.signSession(token,"client",30*24*60*60);
      }
    };
    const actions = loadModule("app/actions.ts", {
      "@/lib/avatarUpload":{},
      "@/lib/bookingRemember":{},
      "@/lib/prisma":{prisma},
      "@/lib/format":await import("../lib/format"),
      "@/lib/clientSync":clients,
      "@/lib/clientSession":auth,
      "@/lib/authRateLimit":{allowAuthAttempt:async()=>true},
      "@/lib/pushNotifications":{notifyMaster:async()=>0},
      "@/lib/validation":await import("../lib/validation"),
      "@/lib/bookings":bookings,
      "next/cache":{revalidatePath:()=>{}},
      "next/navigation":redirects
    });
    const adminActions = loadModule("app/admin/actions.ts", {
      "@/lib/bookingRemember":{},
      "@/lib/bookings":bookings,
      "@/lib/scheduleTransaction":await import("../lib/scheduleTransaction"),
      "@/lib/admin":{isAdmin:async()=>true},
      "@/lib/prisma":{prisma},
      "@/lib/cancellationNotice":{},
      "@/lib/pushNotifications":{notifyClient:async()=>0},
      "next/cache":{revalidatePath:()=>{}},
      "next/navigation":redirects
    });
    const phone="79990000007",birthDate="1999-05-15";
    const registration = new FormData();
    for(const [k,v] of Object.entries({
      firstName:"Инна",lastName:"Проверка",phone:"+7 999 000 00 07",
      birthDate,comment:"Удобно вечером"
    })) registration.set(k,v);
    await assert.rejects(actions.registerClient(registration),
      (e: unknown)=>e instanceof Redirect && e.target==="/pending");
    const applicant=await prisma.client.findUniqueOrThrow({where:{phone}});
    assert.equal(applicant.status,"PENDING");
    assert.equal(applicant.notes,"Удобно вечером");
    assert.equal(issuedCookie,"","Registration must not auto-login");

    const login=new FormData();
    login.set("phone","8 (999) 000 00 07");
    login.set("birthDate",birthDate);
    await assert.rejects(actions.loginClient(login),
      (e: unknown)=>e instanceof Redirect && e.target==="/pending?already=1");
    assert.equal(issuedCookie,"","Pending client must not be authenticated");

    const approval = new FormData();
    approval.set("id",applicant.id);
    await assert.rejects(adminActions.approveClient(approval),
      (e: unknown)=>e instanceof Redirect && e.target==="/admin");
    assert.equal((await prisma.client.findUniqueOrThrow({where:{id:applicant.id}})).status,"APPROVED");

    await assert.rejects(actions.loginClient(login),
      (e: unknown)=>e instanceof Redirect && e.target==="/my?login=1");
    assert.equal(signedSession.readSession(issuedCookie,"client"),applicant.publicToken);

    await prisma.onlineWindow.create({data:{startAt:at("16:00")}});
    const form=new FormData();
    form.set("serviceId",service.id);
    form.set("startAt",at("16:00").toISOString());
    form.set("comment","Тестовая запись сохраняется");
    await assert.rejects(actions.createBooking({error:""},form),
      (e: unknown)=>e instanceof Redirect && e.target.startsWith("/my?created="));

    const waitlist=new FormData();
    waitlist.set("waitMode","NEAREST");
    waitlist.set("note","Приходить после обеда");
    await assert.rejects(actions.joinWaitlist(waitlist),
      (e: unknown)=>e instanceof Redirect && e.target==="/my?waitlist=nearest#waitlist");

    await prisma.$disconnect();
    await prisma.$connect();

    const reread=await prisma.client.findUniqueOrThrow({
      where:{publicToken:signedSession.readSession(issuedCookie,"client")},
      include:{bookings:true,waitlist:true}
    });
    assert.equal(reread.id,applicant.id);
    assert.equal(reread.status,"APPROVED");
    assert.equal(reread.bookings.length,1);
    assert.equal(reread.bookings[0].status,"PENDING");
    assert.equal(reread.bookings[0].clientComment,"Тестовая запись сохраняется");
    assert.equal(reread.waitlist.length,1);
    assert.equal(reread.waitlist[0].note,"Приходить после обеда");

    const cancel=new FormData();
    cancel.set("bookingId",reread.bookings[0].id);
    await assert.rejects(actions.cancelClientBooking(cancel),
      (e: unknown)=>e instanceof Redirect && e.target==="/my?cancelled=1");
    await prisma.$disconnect();
    await prisma.$connect();
    assert.equal((await prisma.booking.findUniqueOrThrow({where:{id:reread.bookings[0].id}})).status,"CANCELLED_BY_CLIENT");
  });

  test("profile API saves new client data in PostgreSQL and login works with updated phone", async () => {
    const {NextResponse}=await import("next/server");
    const {sameOriginRequest}=await import("../lib/sameOrigin");
    const {normalizeAvatarDataUrl}=await import("../lib/avatarUpload");
    const token=client.publicToken;
    const cookie=signedSession.signSession(token,"client",60*60);
    const api=loadModule("app/api/profile/update/route.ts",{
      "@/lib/validation":await import("../lib/validation"),
      "@/lib/sameOrigin":{sameOriginRequest},
      "@/lib/avatarUpload":{normalizeAvatarDataUrl},
      "@/lib/clientSession":{getClientCookie:async()=>signedSession.readSession(cookie,"client")},
      "@/lib/format":await import("../lib/format"),
      "@/lib/prisma":{prisma},
      "next/server":{NextResponse}
    });
    const result=await api.POST(new Request("http://localhost/api/profile/update",{
      method:"POST",
      headers:{origin:"http://localhost","content-type":"application/json"},
      body:JSON.stringify({
        firstName:"Исправлено",lastName:"Клиентка",
        phone:"+7 (999) 000-00-08",birthDate:"1994-12-17"
      })
    }));
    assert.equal(result.status,200);
    assert.equal((await result.json()).ok,true);
    await prisma.$disconnect();
    await prisma.$connect();
    const saved=await prisma.client.findUniqueOrThrow({where:{id:client.id}});
    assert.equal(saved.firstName,"Исправлено");
    assert.equal(saved.phone,"79990000008");
    assert.equal(saved.birthDate.toISOString().slice(0,10),"1994-12-17");
    assert.equal(saved.publicToken,token);
    assert.equal(signedSession.readSession(cookie,"client"),token);
  });

  test("push subscription persists across reconnect and is deleted with the client", async () => {
    const first=await prisma.pushSubscription.create({data:{
      endpoint:"https://fcm.googleapis.com/fcm/send/fake-opaque-test-token",
      p256dh:"test-key",auth:"test-auth",clientId:client.id,isAdmin:false
    }});
    await prisma.$disconnect(); await prisma.$connect();
    const reread=await prisma.pushSubscription.findUniqueOrThrow({where:{endpoint:first.endpoint}});
    assert.equal(reread.clientId,client.id);
    assert.equal(reread.isAdmin,false);
    await prisma.client.delete({where:{id:client.id}});
    assert.equal(await prisma.pushSubscription.count({where:{id:first.id}}),0);
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


  test("save-all commits all three named presets and preserves them after reconnect", async () => {
    const names = ["Утренний", "Обычный", "Вечерний"];
    const initial = await presets.saveAllWindowPresets([
      {name: names[0], times: "09:00, 11:00"},
      {name: names[1], times: "12:00, 14:30"},
      {name: names[2], times: "17:00, 19:00"}
    ]);
    assert.deepEqual(initial.map((item) => item.name), names);
    await prisma.$disconnect();
    await prisma.$connect();
    assert.deepEqual((await presets.listWindowPresets()).map((item) => item.name), names);
    await assert.rejects(presets.saveAllWindowPresets([
      {name:"Сломанный", times:"10:00"},
      {name:"Пустой", times:""},
      {name:"Ещё", times:"18:00"}
    ]));
    assert.deepEqual((await presets.listWindowPresets()).map((item) => item.name), names);
    await presets.saveWindowPreset(1,"Другой день","10:30, 15:00");
    assert.deepEqual((await presets.listWindowPresets()).map((item) => item.name), ["Утренний","Другой день","Вечерний"]);
    await assert.rejects(presets.saveWindowPreset(2,"Не сохранять",""));
    assert.deepEqual((await presets.listWindowPresets()).map((item) => item.name), ["Утренний","Другой день","Вечерний"]);
  });

  test("three reusable window presets survive reconnect and only append non-busy times", async () => {
    const first = await presets.saveWindowPreset(0, "Обычный день", "10:00, 11:00, 12:00, 14:00, 15:30, 21:00");
    await presets.saveWindowPreset(1, "Короткий", "09:30; 13:30");
    await presets.saveWindowPreset(2, "Длинный", "09:00, 18:00");
    assert.deepEqual(first.times, ["10:00", "11:00", "12:00", "14:00", "15:30", "21:00"]);
    await prisma.$disconnect();
    await prisma.$connect();
    const saved = await prisma.setting.findMany({ where: { key: { in: [...presets.WINDOW_PRESET_KEYS] } } });
    assert.deepEqual(presets.readWindowPresets(saved).map((x) => x.name), ["Обычный день", "Короткий", "Длинный"]);

    await prisma.onlineWindow.create({ data: { startAt: at("10:00") } });
    await manual(at("12:00"));
    await prisma.blockedSlot.create({ data: { startAt: at("14:00"), endAt: at("15:00"), reason: "Перерыв" } });
    const applied = await presets.applyWindowPreset(date, 0);
    assert.deepEqual(applied, { added: 2, addedTimes: ["11:00", "15:30"], alreadyOpen: 1, unavailable: 3 });
    assert.deepEqual((await prisma.onlineWindow.findMany({ orderBy: { startAt: "asc" } })).map(x => x.startAt.toISOString()), [at("10:00"), at("11:00"), at("15:30")].map(x => x.toISOString()));

    const again = await presets.applyWindowPreset(date, 0);
    assert.equal(again.added, 0);
    assert.equal(again.alreadyOpen, 3);
    assert.equal(await prisma.onlineWindow.count(), 3);
    await prisma.dayOverride.create({ data: { date: businessDateFromKey(date), kind: "DAY_OFF" } });
    await assert.rejects(presets.applyWindowPreset(date, 1), /рабоч/);
    assert.equal(await prisma.onlineWindow.count(), 3);
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


  test("cancelling a manual appointment never publishes an online window", async () => {
    const manualBooking = await manual(at("10:00"));
    await bookings.changeBookingStatus(manualBooking.id, "CANCELLED_BY_ADMIN");
    assert.equal(await prisma.onlineWindow.count({where:{startAt:at("10:00")}}), 0);
  });

  test("cancelling a missing or already cancelled booking is a no-op", async () => {
    assert.equal(await bookings.cancelOnlineBooking(client.id, "not-a-booking"),false);
    await prisma.onlineWindow.create({data:{startAt:at("14:00")}});
    const saved=await bookings.bookOnline({clientId:client.id,serviceId:service.id,startAt:at("14:00"),comment:""});
    assert.equal(await bookings.cancelOnlineBooking(client.id,saved.id),true);
    assert.equal(await bookings.cancelOnlineBooking(client.id,saved.id),false);
    assert.equal((await prisma.booking.findUniqueOrThrow({where:{id:saved.id}})).status,"CANCELLED_BY_CLIENT");
  });

  test("cancelling a published online appointment restores the window", async () => {
    await prisma.onlineWindow.create({data:{startAt:at("12:00")}});
    const online = await bookings.bookOnline({clientId:client.id,serviceId:service.id,startAt:at("12:00"),comment:""});
    assert.equal(await prisma.onlineWindow.count({where:{startAt:at("12:00")}}), 0);
    await bookings.cancelOnlineBooking(client.id, online.id);
    assert.equal(await prisma.onlineWindow.count({where:{startAt:at("12:00")}}), 1);
  });

  test("a second IP can reach admin login after another IP hits its limit", async () => {
    let ip = "203.0.113.10";
    const limiter = loadModule("lib/authRateLimit.ts", {"node:crypto":await import("node:crypto"),"next/headers":{headers:async()=>new Headers({"x-forwarded-for":ip})},"@/lib/prisma":{prisma},"@/lib/rateLimit":await import("../lib/rateLimit"),"@/lib/signedSession":signedSession});
    for (let i = 0; i < 10; i++) assert.equal(await limiter.allowAuthAttempt("admin"), true);
    assert.equal(await limiter.allowAuthAttempt("admin"), false);
    ip = "203.0.113.11";
    assert.equal(await limiter.allowAuthAttempt("admin"), true);
  });

});
