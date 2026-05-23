import { Queue } from "bullmq";
import IORedis from "ioredis";
import type { JobsOptions } from "bullmq";
import type { JudgeEvaluation } from "../agents/judgeAgent";
import type { LocalToxicityMatch } from "../agents/guardedAgent";

export const EVALUATION_QUEUE_NAME = "guardrail-evaluations";
export const EVALUATE_PROMPT_JOB_NAME = "evaluate-prompt";

export type EvaluationJobData = {
  prompt: string;
  targetModel?: string;
  forceLive?: boolean;
  apiKey?: string;
  judgeApiKey?: string;
  judgeModelName?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type EvaluationJobResult = {
  prompt: string;
  targetModel: string;
  blocked: boolean;
  rawOutput: string;
  finalOutput: string;
  latencyMs: number;
  blockReason: string | null;
  toxicityMatches: LocalToxicityMatch[];
  judgeEvaluation: JudgeEvaluation | null;
  metadata?: EvaluationJobData["metadata"];
};

const DEFAULT_REDIS_URL = "redis://localhost:6379";
const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 2_000
  },
  removeOnComplete: {
    age: 60 * 60 * 24,
    count: 1_000
  },
  removeOnFail: {
    age: 60 * 60 * 24 * 7,
    count: 2_000
  }
};

let redisConnection: IORedis | undefined;

export function getRedisUrl() {
  return process.env.REDIS_URL ?? DEFAULT_REDIS_URL;
}

export function getQueueConnection() {
  if (!redisConnection) {
    redisConnection = new IORedis(getRedisUrl(), {
      lazyConnect: true,
      maxRetriesPerRequest: null
    });
  }

  return redisConnection;
}

export const evaluationQueue = new Queue<
  EvaluationJobData,
  EvaluationJobResult,
  typeof EVALUATE_PROMPT_JOB_NAME
>(EVALUATION_QUEUE_NAME, {
  connection: getQueueConnection(),
  defaultJobOptions: DEFAULT_JOB_OPTIONS
});

export function enqueueEvaluationJob(data: EvaluationJobData, options?: JobsOptions) {
  return evaluationQueue.add(EVALUATE_PROMPT_JOB_NAME, data, options);
}
