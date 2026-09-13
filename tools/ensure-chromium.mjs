/**
 * Resolves a Chromium executable + shared libs for Playwright in environments
 * where the playwright CDN and apt are unreachable: prefers the npm-delivered
 * @sparticuz/chromium binary + its al2023 lib set, recording paths in
 * .chromium-path.json for playwright.config.ts. Missing libraries (libnspr4,
 * libnss3, ...) are extracted from the package's brotli tarball.
 */
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { execSync } from "child_process";

try {
  const mod = await import("@sparticuz/chromium");
  const chromium = mod.default ?? mod;
  const exe = await chromium.executablePath();
  if (exe && existsSync(exe)) {
    // extract bundled libs (idempotent)
    let libDir = null;
    try {
      libDir = "/tmp/al2023-libs";
      if (!existsSync(`${libDir}/lib/libnss3.so`)) {
        const brotli = (await import("brotli")).default ?? (await import("brotli"));
        const fs = await import("fs");
        const tarPath = "/tmp/al2023.tar";
        // locate the tarball inside the package (bin/al2023.tar.br)
        const { createRequire } = await import("module");
        const require = createRequire(import.meta.url);
        const entry = require.resolve("@sparticuz/chromium"); // exports-safe
        const pkgRoot = entry.split(/@sparticuz[\\/]chromium/)[0] + "@sparticuz/chromium";
        const tarPath2 = `${pkgRoot}/bin/al2023.tar.br`;
        const src = fs.readFileSync(tarPath2);
        const out = brotli.decompress(src);
        fs.writeFileSync(tarPath, Buffer.from(out));
        fs.mkdirSync(`${libDir}/lib`, { recursive: true });
        execSync(`tar -xf ${tarPath} -C ${libDir}`);
      }
    } catch (e) {
      console.warn("lib extraction failed (continuing):", e.message);
    }
    writeFileSync(".chromium-path.json", JSON.stringify({ executablePath: exe, libDir }));
    console.log("chromium (sparticuz):", exe, "libs:", libDir);
    process.exit(0);
  }
} catch {
  // fall through
}
console.log("chromium: using playwright default");
