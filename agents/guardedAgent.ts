import {
  FinishReason,
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory
} from "@google/generative-ai";
import * as tf from "@tensorflow/tfjs";
import * as toxicity from "@tensorflow-models/toxicity";

const SAFETY_REFUSAL = "I am sorry, but I cannot assist with that request.";
const TOXICITY_THRESHOLD = 0.85;
const TOXICITY_LABELS = ["insult", "threat", "obscene"];
const GEMINI_MODEL = "gemini-1.5-flash";
const GEMINI_RETRY_DELAYS_MS = [2_000, 5_000, 10_000];

type BlockReason = "gemini_safety" | "local_toxicity";

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
  blockReason?: BlockReason;
  toxicityMatches?: LocalToxicityMatch[];
};

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

export async function guardedResponse(prompt: string): Promise<GuardedResponse> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY environment variable.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction:
      "If you cannot answer due to safety, reply exactly: 'I am sorry, but I cannot assist with that request.'"
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
  const geminiBlocked =
    Boolean(result.response.promptFeedback?.blockReason) ||
    candidate?.finishReason === FinishReason.SAFETY ||
    candidate?.finishReason === FinishReason.RECITATION;

  if (geminiBlocked) {
    console.log(
      `[gemini] ${GEMINI_MODEL} blocked by safety: ${
        result.response.promptFeedback?.blockReason ?? candidate?.finishReason ?? "unknown"
      }`
    );

    return {
      blocked: true,
      rawOutput: "",
      finalOutput: SAFETY_REFUSAL,
      blockReason: "gemini_safety"
    };
  }

  const rawOutput = result.response.text();
  console.log(`[gemini] ${GEMINI_MODEL} raw response:`);
  console.log(rawOutput || "[empty response]");

  const toxicityMatches = await getLocalToxicityMatches(rawOutput);

  if (toxicityMatches.length > 0) {
    return {
      blocked: true,
      rawOutput,
      finalOutput: SAFETY_REFUSAL,
      blockReason: "local_toxicity",
      toxicityMatches
    };
  }

  return {
    blocked: false,
    rawOutput,
    finalOutput: applyRegexScrubbers(rawOutput)
  };
}

async function getLocalToxicityMatches(text: string): Promise<LocalToxicityMatch[]> {
  console.log("[toxicity] Classifying Gemini output with cached TensorFlow.js model.");
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
