import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const next = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
const server = spawn(process.execPath, [next, "dev", "-H", "127.0.0.1", "-p", "3001"], {
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: "development", FOCURA_LOCAL_DEMO: "1",
    NEXTAUTH_URL: "http://127.0.0.1:3001", NEXTAUTH_SECRET: randomBytes(32).toString("base64url") },
});

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.kill(signal));
server.on("exit", (code) => { process.exitCode = code ?? 0; });
