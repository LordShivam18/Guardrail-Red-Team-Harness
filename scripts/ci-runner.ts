import "dotenv/config";
import {
  DEFAULTS,
  RunnerConfig,
  MUTATIONS,
  SEED_PAYLOADS,
  runFuzzer,
  evaluateGate,
  log,
  logSection
} from "./ci-runner-core";

export function parseArgs(argv = process.argv.slice(2)): RunnerConfig {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
[MESH CI] Guardrail Mesh — Headless CI Runner

USAGE
  npx tsx scripts/ci-runner.ts [OPTIONS]

OPTIONS
  --model <name>        Target model identifier (default: ${DEFAULTS.model})
  --volume <n>          Number of payloads to fire (default: ${DEFAULTS.volume})
  --base-url <url>      Proxy base URL (default: ${DEFAULTS.baseUrl})
  --max-jailbreak <n>   Max allowed jailbreak rate 0-1 (default: ${DEFAULTS.maxJailbreakRate})
  --max-fp <n>          Max allowed false positive rate 0-1 (default: ${DEFAULTS.maxFpRate})
  --help, -h            Show this help message

EXIT CODES
  0  All thresholds passed
  1  Security gate FAILED (policy violation)
  2  Infrastructure error / Runner error
`);
    process.exit(0);
  }

  function getArg(flag: string, fallback: string): string {
    const index = argv.indexOf(flag);
    if (index === -1 || index + 1 >= argv.length) return fallback;
    return argv[index + 1];
  }

  const operatorToken = process.env.MESH_CI_TOKEN?.trim();

  if (!operatorToken) {
    throw new Error("MESH_CI_TOKEN must contain a short-lived signed operator JWT.");
  }

  return {
    model: getArg("--model", DEFAULTS.model),
    volume: parseInt(getArg("--volume", String(DEFAULTS.volume)), 10) || DEFAULTS.volume,
    baseUrl: getArg("--base-url", DEFAULTS.baseUrl),
    maxJailbreakRate: parseFloat(getArg("--max-jailbreak", String(DEFAULTS.maxJailbreakRate))),
    maxFpRate: parseFloat(getArg("--max-fp", String(DEFAULTS.maxFpRate))),
    operatorToken
  };
}

async function main() {
  const config = parseArgs();

  logSection("GUARDRAIL MESH — CI SECURITY GATE");

  log("Configuration:");
  log(`  Model:            ${config.model}`);
  log(`  Volume:           ${config.volume} payloads`);
  log(`  Base URL:         ${config.baseUrl}`);
  log(`  Max Jailbreak:    ${(config.maxJailbreakRate * 100).toFixed(1)}%`);
  log(`  Max FP Rate:      ${(config.maxFpRate * 100).toFixed(1)}%`);
  log(`  Mutations:        ${MUTATIONS.length} strategies loaded`);
  log(`  Seed Payloads:    ${SEED_PAYLOADS.length} adversarial prompts`);

  logSection("FUZZER EXECUTION");

  log("Initializing fuzzer sequence...");

  const startTime = performance.now();
  const stats = await runFuzzer(config);
  const wallTimeMs = Math.round(performance.now() - startTime);

  logSection("EXECUTION SUMMARY");

  log(`Total Payloads:     ${stats.total}`);
  log(`Blocked:            ${stats.blocked}`);
  log(`Allowed:            ${stats.allowed}`);
  log(`Errors:             ${stats.errors}`);
  log(`Wall Time:          ${(wallTimeMs / 1000).toFixed(2)}s`);
  log(`Avg Latency:        ${stats.total > 0 ? Math.round(stats.totalLatencyMs / stats.total) : 0}ms`);

  logSection("SECURITY GATE EVALUATION");

  const gate = evaluateGate(stats, config);

  log(`Jailbreak Rate:     ${(gate.jailbreakRate * 100).toFixed(2)}%  (threshold: ≤${(config.maxJailbreakRate * 100).toFixed(1)}%)`);
  log(`False Positive Rate:${(gate.fpRate * 100).toFixed(2)}%  (threshold: ≤${(config.maxFpRate * 100).toFixed(1)}%)`);

  console.log("");

  if (gate.passed) {
    log("╔══════════════════════════════════════════╗");
    log("║  ✓  SECURITY GATE: PASSED                ║");
    log("╚══════════════════════════════════════════╝");
    process.exit(0);
  } else {
    log("╔══════════════════════════════════════════╗");
    log(`║  ✗  SECURITY GATE FAILED: [${gate.failureType}]`);
    log("╚══════════════════════════════════════════╝");

    for (const reason of gate.reasons) {
      log(`  ${reason}`);
    }

    // Exit code 2 for infrastructure failures, exit code 1 for security policy violations
    const exitCode = gate.failureType === "INFRASTRUCTURE" ? 2 : 1;
    process.exit(exitCode);
  }
}

if (process.argv[1] && process.argv[1].endsWith("ci-runner.ts")) {
  main().catch((err) => {
    log(`FATAL INFRASTRUCTURE ERROR: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  });
}
