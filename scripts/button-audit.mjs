import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const appDir = path.join(root, "app");
const issues = [];

function walk(dir, result = []) {
  if (!fs.existsSync(dir)) return result;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, result);
    else if (/\.(tsx|jsx|ts)$/.test(name)) result.push(full);
  }
  return result;
}

function routeForFile(file) {
  const relative = path.relative(appDir, path.dirname(file)).replaceAll(path.sep, "/");
  if (relative === "") return "/";
  return `/${relative}`;
}

const routeFiles = walk(appDir).filter((file) => ["page.tsx", "route.ts"].includes(path.basename(file)));
const routes = new Set(routeFiles.map(routeForFile));

function stripJsx(text) {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function literalAttrValue(attrs, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`${escaped}\\s*=\\s*["']([^"']*)["']`);
  return attrs.match(re)?.[1] || "";
}

function hasAttr(attrs, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${escaped}\\s*=`).test(attrs);
}

function hasLabel(attrs, body) {
  if (hasAttr(attrs, "aria-label") || hasAttr(attrs, "title")) return true;
  const clean = stripJsx(body);
  if (clean.length > 0) return true;
  // Dynamic JSX children are treated as labelled because text may come from data/map.
  if (/\{[^}]+\}/.test(body)) return true;
  return false;
}

function shouldCheckRoute(href) {
  if (!href.startsWith("/")) return false;
  if (href.includes("${") || href.includes("[") || href.includes("{")) return false;
  if (href.startsWith("//")) return false;
  return true;
}

function normalizeHref(href) {
  return href.split("?")[0].split("#")[0] || "/";
}

for (const file of walk(appDir).filter((item) => /\.(tsx|jsx)$/.test(item))) {
  const source = fs.readFileSync(file, "utf8");
  const rel = path.relative(root, file).replaceAll(path.sep, "/");
  const re = /<(button|a)\b([^>]*)>([\s\S]*?)<\/\1>/g;
  let match;
  while ((match = re.exec(source))) {
    const [, tag, attrs, body] = match;
    const line = source.slice(0, match.index).split("\n").length;

    if (!hasLabel(attrs, body)) {
      issues.push(`${rel}:${line} — пустой <${tag}> без текста, aria-label или title`);
    }

    if (tag === "a") {
      if (!hasAttr(attrs, "href")) {
        issues.push(`${rel}:${line} — ссылка <a> без href`);
        continue;
      }

      const href = literalAttrValue(attrs, "href");
      if (!href) continue; // href can be a JSX expression; static checker skips it.
      if (href === "#") {
        issues.push(`${rel}:${line} — ссылка ведёт в пустой #`);
      } else if (shouldCheckRoute(href)) {
        const normalized = normalizeHref(href);
        const isStaticRoute = !normalized.includes("{") && !normalized.includes("}");
        if (isStaticRoute && !routes.has(normalized)) {
          issues.push(`${rel}:${line} — ссылка ${href} не совпадает со статической страницей app${normalized}/page.tsx или route.ts`);
        }
      }
    }
  }
}

if (issues.length) {
  console.error("Проверка кнопок нашла проблемы:\n");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Проверка кнопок прошла: пустых кнопок и явных битых статических ссылок не найдено.");
