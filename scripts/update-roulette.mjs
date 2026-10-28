import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

/** The companion source repository stays independent; only a reviewed tarball enters the hub. */
const hubRoot = process.cwd();
const sourceRoot = path.resolve(hubRoot, process.argv[2] ?? "../Loaded-Roulette");
const vendorRoot = path.join(hubRoot, "vendor");
const npmCli = process.env.npm_execpath;
assert.ok(npmCli, "Run this helper through npm run update:roulette.");
assert.ok(existsSync(path.join(sourceRoot, "package.json")), "Loaded-Roulette source folder was not found.");
const metadata = JSON.parse(readFileSync(path.join(sourceRoot, "package.json"), "utf8"));
assert.equal(metadata.name, "@masonf539/loaded-roulette", "The source folder must contain Loaded Roulette.");
assert.equal(metadata.private, true, "This helper is for the private development package.");
mkdirSync(vendorRoot, { recursive: true });

/** Runs npm through the current Node executable so paths with spaces and Windows npm.cmd work reliably. */
function runNpm(args, cwd, quiet = false) {
  const result = spawnSync(process.execPath, [npmCli, ...args], { cwd, encoding: "utf8", shell: false });
  if (result.status !== 0) throw new Error(`npm ${args.join(" ")} failed.\n${result.error?.message ?? ""}\n${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  if (!quiet && result.stdout) process.stdout.write(result.stdout);
  return result.stdout;
}
runNpm(["run", "check"], sourceRoot);
runNpm(["test"], sourceRoot);
const [packed] = JSON.parse(runNpm(["pack", "--json", "--pack-destination", vendorRoot], sourceRoot, true));
assert.equal(packed.name, metadata.name);
assert.equal(path.basename(packed.filename), packed.filename);
runNpm(["install", "--save-exact", path.join(vendorRoot, packed.filename), "--no-audit", "--no-fund"], hubRoot);
runNpm(["run", "verify:packages"], hubRoot);
console.log(`Loaded Roulette ${packed.version} refreshed in the normal GameHub build. Rebuild/restart GameHub to use it.`);
