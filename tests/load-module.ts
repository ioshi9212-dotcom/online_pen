import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

// Execute production code with only the Next request boundary replaced. Database
// integration tests use the real Prisma client instead of these request doubles.
export function loadModule(file: string, mocks: Record<string, unknown>) {
  const filename = path.resolve(file);
  const nativeRequire = createRequire(filename);
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const module = { exports: {} as any };
  const require = (name: string) => Object.prototype.hasOwnProperty.call(mocks, name) ? mocks[name] : nativeRequire(name);
  new vm.Script(`(function(require,module,exports){${compiled}\n})`, { filename }).runInThisContext()(require, module, module.exports);
  return module.exports;
}
