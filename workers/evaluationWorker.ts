import { Worker } from "bullmq";
import type IORedis from "ioredis";
import { guardedResponse } from "../agents/guardedAgent";
import { loadLocalEnv } from "../scripts/env";
import {
  EVALUATION_QUEUE_NAME,
  getQueueConnection
} from "../lib/queue";
import type {
  EvaluationJobData,
  EvaluationJobResult
} from "../lib/queue";

loadLocalEnv();

const queueConnection: IORedis = getQueueConnection();

const worker = new Worker<EvaluationJobData, EvaluationJobResult>(
  EVALUATION_QUEUE_NAME,
  async (job) => {
    if (!job.data.prompt || job.data.prompt.trim().length === 0) {
      throw new Error("Evaluation job requires a non-empty prompt.");
    }

    const startedAt = performance.now();
    const response = await guardedResponse(job.data.prompt, {
      image_url: job.data.image_url,
      forceLive: job.data.forceLive,
      targetModel: job.data.targetModel,
      apiKey: job.data.apiKey,
      judgeApiKey: job.data.judgeApiKey,
      judgeModelName: job.data.judgeModelName
    });
    const latencyMs = Math.round(performance.now() - startedAt);

    return {
      prompt: job.data.prompt,
      targetModel: response.modelName,
      blocked: response.blocked,
      rawOutput: response.rawOutput,
      finalOutput: response.finalOutput,
      latencyMs,
      blockReason: response.blockReason ?? null,
      toxicityMatches: response.toxicityMatches ?? [],
      judgeEvaluation: response.judgeEvaluation ?? null,
      metadata: job.data.metadata
    };
  },
  {
    concurrency: getWorkerConcurrency(),
    connection: queueConnection
  }
);

worker.on("completed", (job, result) => {
  console.log(
    `[evaluation-worker] completed job=${job.id} model=${result.targetModel} blocked=${result.blocked} latency=${result.latencyMs}ms`
  );
});

worker.on("failed", (job, error) => {
  console.error(`[evaluation-worker] failed job=${job?.id ?? "unknown"}`);
  console.error(error);
});

worker.on("error", (error) => {
  console.error("[evaluation-worker] worker error");
  console.error(error);
});

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

function getWorkerConcurrency() {
  const parsed = Number(process.env.EVALUATION_WORKER_CONCURRENCY ?? 2);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return 2;
  }

  return Math.min(Math.trunc(parsed), 16);
}

async function shutdown() {
  console.log("[evaluation-worker] shutting down.");
  await worker.close();
  await queueConnection.quit();
}
