import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { connect } from "node:net";
import { resolve } from "node:path";

const HOST = "localhost";
const PORT = 3000;
const STARTUP_TIMEOUT_MS = 30_000;

async function main() {
  const projectRoot = process.cwd();
  const nextBin = resolve(projectRoot, "node_modules", "next", "dist", "bin", "next");

  if (!existsSync(nextBin)) {
    throw new Error(
      `Unable to find the local Next.js CLI at ${nextBin}. Run npm ci before npm run dev.`
    );
  }

  console.log(`[dev] Project root resolved to: ${projectRoot}`);
  console.log(`[dev] Next.js CLI resolved to: ${nextBin}`);

  const child = spawn(process.execPath, [nextBin, "dev", "--hostname", HOST, "--port", String(PORT)], {
    cwd: projectRoot,
    env: {
      ...process.env,
      HOSTNAME: HOST,
      PORT: String(PORT)
    },
    shell: false,
    stdio: "inherit",
    windowsHide: true
  });

  const shutdown = () => {
    if (!child.killed) {
      child.kill();
    }
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  child.once("exit", (code, signal) => {
    process.off("SIGINT", shutdown);
    process.off("SIGTERM", shutdown);

    if (signal) {
      console.log(`[dev] Next.js dev server stopped by ${signal}.`);
      process.exit(0);
    }

    process.exit(code ?? 1);
  });

  try {
    await waitForPort(HOST, PORT, STARTUP_TIMEOUT_MS);
  } catch (error) {
    if (!child.killed) {
      child.kill();
    }

    throw error;
  }

  console.log(`\u{1F680} Control Room Server successfully initialized on http://localhost:${PORT}`);
}

async function waitForPort(host: string, port: number, timeoutMs: number) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await canConnect(host, port)) {
      return;
    }

    await sleep(250);
  }

  throw new Error(`Timed out waiting for http://${host}:${port} to start listening.`);
}

function canConnect(host: string, port: number) {
  return new Promise<boolean>((resolveConnection) => {
    const socket = connect({ host, port });

    socket.once("connect", () => {
      socket.end();
      resolveConnection(true);
    });

    socket.once("error", () => {
      socket.destroy();
      resolveConnection(false);
    });

    socket.setTimeout(1_000, () => {
      socket.destroy();
      resolveConnection(false);
    });
  });
}

function sleep(ms: number) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

main().catch((error) => {
  console.error("[dev] Failed to start the Control Room dev server.");
  console.error(error);
  process.exitCode = 1;
});
