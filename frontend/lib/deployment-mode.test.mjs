import test from "node:test";
import assert from "node:assert/strict";
import { benchmarkWritesEnabled, deploymentMode } from "./deployment-mode.mjs";

const originalMode = process.env.CINESEEK_DEPLOYMENT_MODE;
const originalWrites = process.env.CINESEEK_ALLOW_BENCHMARK_WRITES;

function restoreEnvironment() {
  if (originalMode === undefined) delete process.env.CINESEEK_DEPLOYMENT_MODE;
  else process.env.CINESEEK_DEPLOYMENT_MODE = originalMode;
  if (originalWrites === undefined)
    delete process.env.CINESEEK_ALLOW_BENCHMARK_WRITES;
  else process.env.CINESEEK_ALLOW_BENCHMARK_WRITES = originalWrites;
}

test.afterEach(restoreEnvironment);

test("benchmark writes require an explicit local opt-in", () => {
  delete process.env.CINESEEK_DEPLOYMENT_MODE;
  delete process.env.CINESEEK_ALLOW_BENCHMARK_WRITES;
  assert.equal(deploymentMode(), "local");
  assert.equal(benchmarkWritesEnabled(), false);

  process.env.CINESEEK_ALLOW_BENCHMARK_WRITES = "true";
  assert.equal(benchmarkWritesEnabled(), true);

  process.env.CINESEEK_DEPLOYMENT_MODE = "portfolio";
  assert.equal(benchmarkWritesEnabled(), false);
});
