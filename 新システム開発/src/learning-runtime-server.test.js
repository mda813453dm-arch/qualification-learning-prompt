import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createConfiguredLearningRuntime } from "./learning-runtime-server.js";

test("composition root refuses to start without external deployment settings", async () => {
  await assert.rejects(createConfiguredLearningRuntime({ env: {} }), /LEARNING_RUNTIME_CONFIG_REQUIRED/);
});

test("composition root loads injected server-owned adapters and keeps server unstarted", async () => {
  const dir = await mkdtemp(join(tmpdir(), "learning-runtime-"));
  try {
    const adapterPath = join(dir, "adapters.mjs");
    await writeFile(adapterPath, `
      export async function createRuntimeAdapters() {
        return {
          authenticate: async () => ({ id: "deployment-user" }),
          sessions: { put: async () => {}, get: async () => null },
          initializeSession: async () => ({}),\n          loadApprovedStudyPlan: async () => null,\n          loadOfficialCandidateRecords: async () => [],\n          compileVerifiedBundle: async () => ({ status: "blocked" })
        };
      }
    `);
    const runtime = await createConfiguredLearningRuntime({ env: {
      LEARNING_RUNTIME_ADAPTER_MODULE: pathToFileURL(adapterPath).href,
      LEARNING_RUNTIME_HOST: "127.0.0.1", PORT: "8081"
    } });
    assert.equal(runtime.host, "127.0.0.1");
    assert.equal(runtime.port, 8081);
    assert.equal(runtime.server.listening, false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("composition root rejects incomplete or invalid adapters and port configuration", async () => {
  await assert.rejects(createConfiguredLearningRuntime({ env: {
    LEARNING_RUNTIME_ADAPTER_MODULE: "file:///missing-adapter.mjs", LEARNING_RUNTIME_HOST: "127.0.0.1", PORT: "nope"
  } }), /CONFIG_INVALID:PORT/);
});
