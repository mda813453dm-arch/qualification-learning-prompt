import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createCrossAiLearningHttpServer } from "./cross-ai-learning-api.js";

const required = (env, key) => {
  const value = String(env[key] || "").trim();
  if (!value) throw new Error(`LEARNING_RUNTIME_CONFIG_REQUIRED:${key}`);
  return value;
};

/** Load deployment-specific adapters without selecting a vendor or storing secrets in code. */
export async function createConfiguredLearningRuntime({ env = process.env } = {}) {
  const adapterModule = required(env, "LEARNING_RUNTIME_ADAPTER_MODULE");
  const host = required(env, "LEARNING_RUNTIME_HOST");
  const portText = required(env, "PORT");
  const port = Number(portText);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("LEARNING_RUNTIME_CONFIG_INVALID:PORT");

  const specifier = adapterModule.startsWith("file:")
    ? adapterModule
    : pathToFileURL(resolve(adapterModule)).href;
  const adapters = await import(specifier);
  if (typeof adapters.createRuntimeAdapters !== "function")
    throw new Error("LEARNING_RUNTIME_ADAPTER_FACTORY_REQUIRED");
  const dependencies = await adapters.createRuntimeAdapters({ env });
  if (!dependencies || typeof dependencies.authenticate !== "function" ||
      typeof dependencies.initializeSession !== "function" ||
      typeof dependencies.sessions?.put !== "function" || typeof dependencies.sessions?.get !== "function")
    throw new Error("LEARNING_RUNTIME_ADAPTERS_INCOMPLETE");
  const server = createCrossAiLearningHttpServer(dependencies);
  return Object.freeze({ server, host, port });
}

export async function startConfiguredLearningRuntime(options) {
  const runtime = await createConfiguredLearningRuntime(options);
  await new Promise((resolveListen, reject) => {
    runtime.server.once("error", reject);
    runtime.server.listen(runtime.port, runtime.host, resolveListen);
  });
  return runtime;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const { server, host, port } = await startConfiguredLearningRuntime();
    process.stdout.write(`learning runtime listening on ${host}:${port}\n`);
    const stop = () => server.close(() => process.exit(0));
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  } catch (error) {
    process.stderr.write(`${error?.message || "LEARNING_RUNTIME_START_FAILED"}\n`);
    process.exitCode = 1;
  }
}
