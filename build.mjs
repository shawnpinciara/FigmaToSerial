#!/usr/bin/env node
/* FigProxyWEB cross-browser build (zero dependencies, plain Node).
 *
 *   node build.mjs [--target=chrome|firefox] [--clean] [--no-zip]
 *
 * Reads manifest.json at the repo root as the single source of truth and
 * produces store-ready trees:
 *
 *   dist/chrome/manifest.json   — Manifest V3 + service worker
 *   dist/firefox/manifest.json  — Manifest V3 + background scripts + gecko id
 *   dist/figmatoserial-<target>-<version>.zip (+ .zip per target)
 *
 * Firefox notes:
 * - Web Serial needs Firefox >= 151 (strict_min_version enforced below).
 * - Firefox MV3 keeps `background.scripts`, which suits the long-lived
 *   serial observer better than an event service worker.
 * - TODO: replace GECKO_ID with your own before submitting to AMO.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const DIST = join(ROOT, "dist");
const GECKO_ID = "figmatoserial@shawnpinciara.com"; // TODO: replace with your own

const STATIC_FILES = [
  "background.js",
  "content-script.js",
  "popup.html",
  "popup.js",
  "style.css",
  "figmaToSerial_icon_128.png",
  "figmaToSerial_icon.svg",
];
const STATIC_DIRS = ["lib", "rules"];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function firefoxManifest(base) {
  const manifest = JSON.parse(JSON.stringify(base));
  delete manifest.minimum_chrome_version;
  manifest.background = { scripts: ["lib/browser-api.js", "background.js"] };
  manifest.browser_specific_settings = {
    gecko: { id: GECKO_ID, strict_min_version: "151.0" },
  };
  return manifest;
}

function buildTarget(target, baseManifest, noZip) {
  const outDir = join(DIST, target);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  for (const file of STATIC_FILES) {
    const src = join(ROOT, file);
    if (!existsSync(src)) {
      console.warn(`[${target}] skipping missing file: ${file}`);
      continue;
    }
    cpSync(src, join(outDir, file));
  }
  for (const dir of STATIC_DIRS) {
    const src = join(ROOT, dir);
    if (!existsSync(src)) {
      console.warn(`[${target}] skipping missing dir: ${dir}`);
      continue;
    }
    cpSync(src, join(outDir, dir), { recursive: true });
  }

  const manifest =
    target === "firefox" ? firefoxManifest(baseManifest) : baseManifest;
  writeFileSync(
    join(outDir, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n"
  );

  // Validate the DNR rules file made it across intact.
  readJson(join(outDir, "rules", "figma-exit.json"));

  console.log(`[${target}] wrote ${outDir}/`);

  if (!noZip) {
    const zipName = `figproxyweb-${target}-${manifest.version}.zip`;
    const zipPath = join(DIST, zipName);
    rmSync(zipPath, { force: true });
    const res = spawnSync("zip", ["-qr", zipPath, "."], {
      cwd: outDir,
      stdio: "inherit",
    });
    if (res.status === 0) console.log(`[${target}] wrote ${zipPath}`);
    else console.warn(`[${target}] 'zip' CLI failed — upload ${outDir}/ manually.`);
  }
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--clean")) {
    rmSync(DIST, { recursive: true, force: true });
    console.log("dist/ cleaned.");
    return;
  }

  const targetArg = args.find((a) => a.startsWith("--target="));
  const targets = targetArg ? [targetArg.split("=")[1]] : ["chrome", "firefox"];
  for (const t of targets) {
    if (!["chrome", "firefox"].includes(t)) {
      console.error(`Unknown target: ${t}`);
      process.exitCode = 1;
      continue;
    }
  }
  const noZip = args.includes("--no-zip");
  const baseManifest = readJson(join(ROOT, "manifest.json"));

  try {
    const pkg = readJson(join(ROOT, "package.json"));
    if (pkg.version !== baseManifest.version) {
      console.warn(
        `Version drift: package.json (${pkg.version}) != manifest.json (${baseManifest.version})`
      );
    }
  } catch {
    /* package.json optional for the build itself */
  }

  mkdirSync(DIST, { recursive: true });
  for (const t of targets) {
    if (["chrome", "firefox"].includes(t)) buildTarget(t, baseManifest, noZip);
  }
}

main();
