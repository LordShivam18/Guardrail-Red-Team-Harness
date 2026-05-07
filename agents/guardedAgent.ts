import {
  FinishReason,
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory
} from "@google/generative-ai";
import "@tensorflow/tfjs";
import * as toxicity from "@tensorflow-models/toxicity";

const SAFETY_REFUSAL = "I am sorry, but I cannot assist with that request.";
const TOXICITY_THRESHOLD = 0.85;
const TOXICITY_LABELS = ["insult", "threat", "obscene"];

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
    model: "gemini-1.5-flash",
    systemInstruction:
      "If you cannot answer due to safety, reply exactly: 'I am sorry, but I cannot assist with that request.'"
  });

  const result = await model.generateContent({
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
  });

  const candidate = result.response.candidates?.[0];
  const geminiBlocked =
    Boolean(result.response.promptFeedback?.blockReason) ||
    candidate?.finishReason === FinishReason.SAFETY ||
    candidate?.finishReason === FinishReason.RECITATION;

  if (geminiBlocked) {
    return {
      blocked: true,
      rawOutput: "",
      finalOutput: SAFETY_REFUSAL,
      blockReason: "gemini_safety"
    };
  }

  const rawOutput = result.response.text();
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
  const model = await getToxicityModel();
  const predictions = await model.classify([text]);

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
    toxicityModelPromise = toxicity.load(TOXICITY_THRESHOLD, TOXICITY_LABELS);
  }

  return toxicityModelPromise;
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
