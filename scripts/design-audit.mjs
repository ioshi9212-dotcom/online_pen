/*
 * Static regression guard for the site-wide design integration.
 * This verifies route coverage and stylesheet order; automated visual browser
 * screenshots are an additional check, not something this test pretends to do.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const layout = read("app/layout.tsx");
const theme = read("app/sitewide-design.css");
const mobile = read("app/mobile-system.css");
const buttons = read("app/button-corners.css");
const imports = ["unified-design.css", "mobile-system.css", "public-landing-refresh.css", "button-corners.css", "sitewide-design.css"];
const offsets = imports.map((name) => layout.indexOf('import "./' + name + '";'));
assert(offsets.every((n) => n >= 0), "All design styles must be imported");
assert(offsets.every((n, i) => i === 0 || n > offsets[i - 1]), "Canonical site-wide theme must be last");
assert(layout.includes('data-design-version="calm-gray-rose-20261119"'), "Deployment marker missing");
assert(theme.includes("@layer online-pen-mobile"), "Mobile layer normalization missing");
assert(theme.includes("--site-control-radius: 8px"), "Square buttons should use an 8px radius");
assert(buttons.includes("--button-corner-radius: 8px"), "Button geometry drifted");
assert(!mobile.includes("--ui-bg: #f7f5f4 !important;"), "Old mobile cream palette reappeared");

const checks = [
  ["public landing", "app/page.tsx", "public-landing-refresh"],
  ["login", "app/login/page.tsx", "auth-page"],
  ["register", "app/register/page.tsx", "auth-page"],
  ["pending", "app/pending/page.tsx", "pending-page"],
  ["unavailable", "app/unavailable/page.tsx", "auth-card"],
  ["standalone price", "app/price/page.tsx", "price-page"],
  ["client profile", "app/profile/page.tsx", "client-page"],
  ["client booking", "app/my/page.tsx", "client-page-compact"],
  ["master dashboard", "app/admin/page.tsx", "master-dashboard"],
  ["master calendar", "app/admin/schedule/page.tsx", "admin-schedule-page"],
  ["master services", "app/admin/services/page.tsx", "admin-services-page"],
  ["master settings", "app/admin/settings/page.tsx", "admin-settings-page"],
  ["master clients", "app/admin/my-clients/page.tsx", "clients-hero"],
  ["master profile", "app/admin/profile/page.tsx", "profile-page"],
  ["master login", "app/admin/login/page.tsx", "auth-card"],
  ["master bookings", "app/admin/bookings/page.tsx", "audit-filters"],
];
for (const [label, path, klass] of checks) {
  assert(existsSync(path), label + " page missing");
  assert(read(path).includes(klass), label + " no longer carries its expected style hook");
}
for (const section of [".auth-card", ".price-page", ".pending-page", ".client-page:not(.client-page-compact)", ".admin-route-frame", ".audit-admin-header", ".schedule-top-card", ".admin-global-bottom-nav", ".pretty-price-card"]) {
  assert(theme.includes(section), section + " missing from unified design");
}
console.log("Site-wide design: stylesheet priority, mobile theme, square controls and " + checks.length + " page hooks verified.");
