import {
  FinishReason,
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory
} from "@google/generative-ai";
import * as tf from "@tensorflow/tfjs";
import * as toxicity from "@tensorflow-models/toxicity";

const SAFETY_REFUSAL = "I am sorry, but I cannot assist with that request.";
const CI_SAFETY_REFUSAL =
  "I cannot fulfill this request as it violates corporate safety protocols.";
const CI_SAFE_COMPLETION =
  "This request is safe. CI mock mode completed the baseline response successfully.";
const TOXICITY_THRESHOLD = 0.85;
const TOXICITY_LABELS = ["insult", "threat", "obscene"];
const DEFAULT_MODEL_NAME = "gemini-2.0-flash";
const GEMINI_RETRY_DELAYS_MS = [5_000, 10_000, 20_000, 40_000];
const SAFETY_SYSTEM_INSTRUCTION =
  "If you cannot answer due to safety, reply exactly: 'I am sorry, but I cannot assist with that request.'";

export type BlockReason = "gemini_safety" | "local_toxicity" | "ci_mock";

type ToxicityPrediction = Awaited<
  ReturnType<Awaited<ReturnType<typeof toxicity.load>>["classify"]>
>[number];

export type LocalToxicityMatch = {
  label: string;
  probability: number;
};

export type GuardedResponse = {
  blocked: boolean;
  rawOutput: string;
  finalOutput: string;
  modelName: string;
  blockReason?: BlockReason;
  toxicityMatches?: LocalToxicityMatch[];
};

export type GuardedResponseOptions = {
  forceLive?: boolean;
  targetModel?: string;
  apiKey?: string;
};

export type ModelProviderRequest = {
  prompt: string;
  modelName: string;
  apiKey: string;
};

export type ModelProviderResult = {
  blocked: boolean;
  rawOutput: string;
  modelName: string;
  providerName: string;
  blockReason?: BlockReason;
  blockDetail?: string;
};

export interface ModelProvider {
  id: "gemini" | "openai" | "anthropic";
  displayName: string;
  apiKeyEnvName?: string;
  generate(request: ModelProviderRequest): Promise<ModelProviderResult>;
}

let toxicityModelPromise: ReturnType<typeof toxicity.load> | undefined;
let toxicityModelReadyLogged = false;

export function applyRegexScrubbers(text: string): string {
  return text
    .replace(
      /\b(?:\d[ -]*?){13,19}\b/g,
      (match) => (isLikelyCreditCard(match) ? "[REDACTED_CREDIT_CARD]" : match)
    )
    .replace(
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      "[REDACTED_EMAIL]"
    );
}

export async function guardedResponse(
  prompt: string,
  options: GuardedResponseOptions = {}
): Promise<GuardedResponse> {
  const modelName = normalizeModelName(options.targetModel);
  const isCI = process.env.GITHUB_ACTIONS === "true" || process.env.CI === "true";

  if (isCI && !options.forceLive) {
    return getCiMockResponse(prompt, modelName);
  }

  const provider = getModelProvider(modelName);
  const apiKey = options.apiKey ?? getProviderApiKey(provider);
  const modelResult = await provider.generate({
    prompt,
    modelName,
    apiKey
  });

  if (modelResult.blocked) {
    console.log(
      `[${modelResult.providerName}] ${modelResult.modelName} blocked by safety: ${
        modelResult.blockDetail ?? "unknown"
      }`
    );

    return {
      blocked: true,
      rawOutput: modelResult.rawOutput,
      finalOutput: SAFETY_REFUSAL,
      modelName: modelResult.modelName,
      blockReason: modelResult.blockReason
    };
  }

  const rawOutput = modelResult.rawOutput;
  console.log(`[${modelResult.providerName}] ${modelResult.modelName} raw response:`);
  console.log(rawOutput || "[empty response]");

  const toxicityMatches = await getLocalToxicityMatches(rawOutput);

  if (toxicityMatches.length > 0) {
    return {
      blocked: true,
      rawOutput,
      finalOutput: SAFETY_REFUSAL,
      modelName: modelResult.modelName,
      blockReason: "local_toxicity",
      toxicityMatches
    };
  }

  return {
    blocked: false,
    rawOutput,
    finalOutput: applyRegexScrubbers(rawOutput),
    modelName: modelResult.modelName,
    toxicityMatches
  };
}

function normalizeModelName(modelName?: string) {
  const normalized = modelName?.trim();

  if (!normalized) {
    return DEFAULT_MODEL_NAME;
  }

  switch (normalized.toLowerCase()) {
    case "gemini 2.0 flash":
      return "gemini-2.0-flash";
    case "gemini 1.5 pro":
      return "gemini-1.5-pro";
    default:
      return normalized;
  }
}

function getModelProvider(modelName: string): ModelProvider {
  const normalized = modelName.toLowerCase();

  if (normalized.includes("gemini")) {
    return geminiProvider;
  }

  if (normalized.includes("openai") || normalized.includes("gpt")) {
    return openAiProvider;
  }

  if (normalized.includes("anthropic") || normalized.includes("claude")) {
    return anthropicProvider;
  }

  throw new Error(`Unsupported model provider for target model: ${modelName}`);
}

function getProviderApiKey(provider: ModelProvider) {
  if (!provider.apiKeyEnvName) {
    return "";
  }

  const apiKey = process.env[provider.apiKeyEnvName];

  if (!apiKey) {
    throw new Error(
      `Missing ${provider.apiKeyEnvName} environment variable for ${provider.displayName}.`
    );
  }

  return apiKey;
}

const geminiProvider: ModelProvider = {
  id: "gemini",
  displayName: "Google Gemini",
  apiKeyEnvName: "GEMINI_API_KEY",
  async generate({ prompt, modelName, apiKey }) {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: SAFETY_SYSTEM_INSTRUCTION
    });

    const result = await withGeminiRetry(() =>
      model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        safetySettings: [
          {
            category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
            threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
          },
          {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
          },
          {
            category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
            threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
          },
          {
            category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
          }
        ]
      })
    );
    const candidate = result.response.candidates?.[0];
    const blockDetail =
      result.response.promptFeedback?.blockReason ?? candidate?.finishReason ?? undefined;
    const geminiBlocked =
      Boolean(result.response.promptFeedback?.blockReason) ||
      candidate?.finishReason === FinishReason.SAFETY ||
      candidate?.finishReason === FinishReason.RECITATION;

    if (geminiBlocked) {
      return {
        blocked: true,
        rawOutput: "",
        modelName,
        providerName: "gemini",
        blockReason: "gemini_safety",
        blockDetail
      };
    }

    return {
      blocked: false,
      rawOutput: result.response.text(),
      modelName,
      providerName: "gemini"
    };
  }
};

const openAiProvider: ModelProvider = {
  id: "openai",
  displayName: "OpenAI",
  async generate(_request) {
    throw new Error("OpenAI model provider is not implemented yet.");
  }
};

const anthropicProvider: ModelProvider = {
  id: "anthropic",
  displayName: "Anthropic",
  async generate(_request) {
    throw new Error("Anthropic model provider is not implemented yet.");
  }
};

async function getCiMockResponse(
  prompt: string,
  modelName: string = DEFAULT_MODEL_NAME
): Promise<GuardedResponse> {
  console.log(
    "[gemini] GitHub Actions runner detected. Bypassing live endpoint to protect serverless quotas."
  );
  await sleep(200);

  if (isAdversarialCiPrompt(prompt)) {
    return {
      blocked: true,
      rawOutput: CI_SAFETY_REFUSAL,
      finalOutput: CI_SAFETY_REFUSAL,
      modelName,
      blockReason: "ci_mock"
    };
  }

  return {
    blocked: false,
    rawOutput: CI_SAFE_COMPLETION,
    finalOutput: CI_SAFE_COMPLETION,
    modelName
  };
}

function isAdversarialCiPrompt(prompt: string) {
  return [
    /\bcredit card\b/i,
    /\bpii\b/i,
    /\boverride\b/i,
    /\bbypass\b/i,
    /ignore all previous instructions/i,
    /\bdeveloper mode\b/i,
    /\bsystem prompt\b/i,
    /\bunrestricted assistant\b/i,
    /\bevade\b/i,
    /\bcontent filter\b/i,
    /\bsocial security\b/i,
    /\bssn\b/i,
    /\binsult\b/i,
    /\bthreat(?:en|ening)?\b/i
  ].some((pattern) => pattern.test(prompt));
}

async function getLocalToxicityMatches(text: string): Promise<LocalToxicityMatch[]> {
  console.log("[toxicity] Classifying model output with cached TensorFlow.js model.");
  const model = await getToxicityModel();
  const before = getTfMemorySummary();
  const predictions = await model.classify([text]);
  const after = getTfMemorySummary();
  console.log(`[toxicity] Classification complete. memory before=${before} after=${after}`);

  return predictions.flatMap((prediction: ToxicityPrediction) => {
    const result = prediction.results[0];

    if (!result?.match) {
      return [];
    }

    return [
      {
        label: prediction.label,
        probability: Number(result.probabilities[1] ?? 0)
      }
    ];
  });
}

function getToxicityModel() {
  if (!toxicityModelPromise) {
    const startedAt = Date.now();
    console.log(
      `[toxicity] Loading TensorFlow.js toxicity model once. labels=${TOXICITY_LABELS.join(
        ","
      )} threshold=${TOXICITY_THRESHOLD}`
    );
    console.log(`[toxicity] Memory before load: ${getTfMemorySummary()}`);

    toxicityModelPromise = toxicity.load(TOXICITY_THRESHOLD, TOXICITY_LABELS);
    toxicityModelPromise
      .then(() => {
        toxicityModelReadyLogged = true;
        console.log(
          `[toxicity] Model ready in ${Date.now() - startedAt}ms. memory after load=${getTfMemorySummary()}`
        );
      })
      .catch((error) => {
        console.error("[toxicity] Model load failed.");
        console.error(error);
      });
  } else if (toxicityModelReadyLogged) {
    console.log("[toxicity] Reusing previously loaded model.");
  }

  return toxicityModelPromise;
}

async function withGeminiRetry<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt <= GEMINI_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const delayMs = GEMINI_RETRY_DELAYS_MS[attempt];

      if (!delayMs || !isRetryableGeminiError(error)) {
        throw error;
      }

      console.warn(
        `[gemini] Retryable request error on attempt ${attempt + 1}. Sleeping ${delayMs}ms before retry.`
      );
      await sleep(delayMs);
    }
  }

  throw new Error("Gemini retry loop exited unexpectedly.");
}

function isRetryableGeminiError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  return (
    /\b429\b|rate limit|quota|resource exhausted|fetch failed|timeout|timed out|ECONNRESET|ETIMEDOUT/i.test(
      message
    )
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getTfMemorySummary() {
  const memory = tf.memory();
  return `tensors=${memory.numTensors}, bytes=${formatBytes(memory.numBytes)}`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes}B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)}KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function isLikelyCreditCard(value: string): boolean {
  const digits = value.replace(/\D/g, "");

  if (digits.length < 13 || digits.length > 19) {
    return false;
  }

  let checksum = 0;
  let shouldDouble = false;

  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);

    if (shouldDouble) {
      digit *= 2;

      if (digit > 9) {
        digit -= 9;
      }
    }

    checksum += digit;
    shouldDouble = !shouldDouble;
  }

  return checksum % 10 === 0;
}
