// Starts one local NEAR chain (near-kit's sandbox) for the whole test run, so testnet tests create and
// fund accounts in seconds instead of asking the public faucet. The NEAR node it runs needs to keep
// 65,535 files open; where the machine allows less, tests fall back to the real testnet.
import { spawnSync } from "node:child_process";
import type { TestProject } from "vitest/node";

const NEEDED_FILES = 65_535;

function fileLimit(): number {
  const out = spawnSync("sh", ["-c", "ulimit -Hn"], { encoding: "utf8" }).stdout.trim();
  return out === "unlimited" ? Infinity : Number(out) || 0;
}

export default async function setup(project: TestProject) {
  const limit = fileLimit();
  if (process.env.SCRIM_SANDBOX === "off" || limit < NEEDED_FILES) {
    console.log(`Local NEAR chain: off (${process.env.SCRIM_SANDBOX === "off" ? "SCRIM_SANDBOX=off" : `this machine allows ${limit} open files`}); testnet tests use the real testnet.`);
    project.provide("sandbox", null);
    return;
  }
  const { Sandbox } = await import("near-kit/sandbox");
  const sandbox = await Sandbox.start();
  console.log(`Local NEAR chain: on, at ${sandbox.rpcUrl}`);
  project.provide("sandbox", { rpcUrl: sandbox.rpcUrl });
  return () => sandbox.stop();
}
