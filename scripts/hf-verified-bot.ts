type CliOptions = {
  endpoint: string;
  meshScore: number;
  modelId: string;
  token: string;
};

type CommitResponse = {
  commitOid?: string;
  commitUrl?: string;
  pullRequestUrl?: string;
};

const DEFAULT_ENDPOINT = "https://huggingface.co";
const MIN_PLATINUM_SCORE = 950;
const BADGE_START = "<!-- guardrail-mesh-certification:start -->";
const BADGE_END = "<!-- guardrail-mesh-certification:end -->";

async function main() {
  const options = parseCliOptions(process.argv.slice(2));
  const readme = await fetchReadme(options);
  const updatedReadme = injectBadge(readme, options.meshScore);

  if (readme === updatedReadme) {
    console.log("[hf-verified-bot] README already contains the current Guardrail Mesh badge.");
    return;
  }

  const response = await openCertificationPullRequest(options, updatedReadme);

  console.log("[hf-verified-bot] Guardrail Mesh verification PR opened.");
  console.log(`[hf-verified-bot] Model: ${options.modelId}`);
  console.log(`[hf-verified-bot] Mesh Score: ${options.meshScore}`);

  if (response.pullRequestUrl) {
    console.log(`[hf-verified-bot] PR: ${response.pullRequestUrl}`);
  }

  if (response.commitUrl) {
    console.log(`[hf-verified-bot] Commit: ${response.commitUrl}`);
  }

  if (response.commitOid) {
    console.log(`[hf-verified-bot] Commit OID: ${response.commitOid}`);
  }
}

function parseCliOptions(args: string[]): CliOptions {
  const values = new Map<string, string>();
  const positionals: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg.startsWith("--")) {
      const inlineValueIndex = arg.indexOf("=");

      if (inlineValueIndex >= 0) {
        values.set(arg.slice(2, inlineValueIndex), arg.slice(inlineValueIndex + 1));
      } else {
        const nextArg = args[index + 1];
        if (!nextArg || nextArg.startsWith("--")) {
          throw new Error(`Missing value for ${arg}`);
        }
        values.set(arg.slice(2), nextArg);
        index += 1;
      }
    } else {
      positionals.push(arg);
    }
  }

  const modelId = values.get("model") ?? values.get("model-id") ?? positionals[0];
  const scoreRaw = values.get("score") ?? values.get("mesh-score") ?? positionals[1];
  const token = values.get("token") ?? process.env.HF_TOKEN ?? process.env.HUGGINGFACE_TOKEN;
  const endpoint = stripTrailingSlash(values.get("endpoint") ?? process.env.HF_ENDPOINT ?? DEFAULT_ENDPOINT);

  if (!modelId) {
    throw new Error("Missing Hugging Face model ID.");
  }

  if (!scoreRaw) {
    throw new Error("Missing Mesh Score.");
  }

  if (!token) {
    throw new Error("Missing HF_TOKEN or HUGGINGFACE_TOKEN.");
  }

  const meshScore = Number(scoreRaw);

  if (!Number.isFinite(meshScore) || meshScore < 0 || meshScore > 1000) {
    throw new Error("Mesh Score must be a number between 0 and 1000.");
  }

  if (meshScore < MIN_PLATINUM_SCORE) {
    throw new Error(
      `PLATINUM certification requires Mesh Score >= ${MIN_PLATINUM_SCORE}. Received ${meshScore}.`
    );
  }

  return {
    endpoint,
    meshScore,
    modelId,
    token
  };
}

async function fetchReadme(options: CliOptions) {
  const response = await fetch(`${options.endpoint}/${encodeRepoId(options.modelId)}/raw/main/README.md`, {
    headers: {
      Authorization: `Bearer ${options.token}`,
      "User-Agent": "guardrail-mesh-hf-verified-bot/0.1.0"
    }
  });

  if (response.status === 404) {
    return `# ${options.modelId.split("/").at(-1) ?? options.modelId}\n\n`;
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch README.md: ${response.status} ${await response.text()}`);
  }

  return response.text();
}

function injectBadge(readme: string, meshScore: number) {
  const badge = [
    BADGE_START,
    `[ Guardrail Mesh: PLATINUM CERTIFIED ]`,
    ``,
    `Mesh Score: ${Math.round(meshScore)}/1000`,
    BADGE_END
  ].join("\n");
  const existingBadgePattern = new RegExp(`${escapeRegExp(BADGE_START)}[\\s\\S]*?${escapeRegExp(BADGE_END)}`);

  if (existingBadgePattern.test(readme)) {
    return readme.replace(existingBadgePattern, badge);
  }

  const frontMatterMatch = readme.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
  const insertion = `${badge}\n\n`;

  if (frontMatterMatch) {
    return `${frontMatterMatch[0]}${insertion}${readme.slice(frontMatterMatch[0].length)}`;
  }

  const firstHeadingMatch = readme.match(/^# .*(?:\r?\n|$)/);

  if (firstHeadingMatch) {
    return `${firstHeadingMatch[0]}\n${insertion}${readme.slice(firstHeadingMatch[0].length)}`;
  }

  return `${insertion}${readme}`;
}

async function openCertificationPullRequest(options: CliOptions, updatedReadme: string) {
  const commitUrl = `${options.endpoint}/api/models/${encodeRepoId(options.modelId)}/commit/main`;
  const commitDescription = [
    "Automated Guardrail Mesh verification.",
    "",
    `Mesh Score: ${Math.round(options.meshScore)}/1000`,
    "Certification Tier: PLATINUM"
  ].join("\n");
  const ndjson = [
    {
      key: "header",
      value: {
        description: commitDescription,
        summary: "Add Guardrail Mesh certification badge"
      }
    },
    {
      key: "file",
      value: {
        content: Buffer.from(updatedReadme, "utf8").toString("base64"),
        encoding: "base64",
        path: "README.md"
      }
    }
  ]
    .map((item) => JSON.stringify(item))
    .join("\n");

  const response = await fetch(`${commitUrl}?create_pr=1`, {
    body: `${ndjson}\n`,
    headers: {
      Authorization: `Bearer ${options.token}`,
      "Content-Type": "application/x-ndjson",
      "User-Agent": "guardrail-mesh-hf-verified-bot/0.1.0"
    },
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(`Failed to open Hugging Face PR: ${response.status} ${await response.text()}`);
  }

  return (await response.json()) as CommitResponse;
}

function encodeRepoId(repoId: string) {
  return repoId.split("/").map(encodeURIComponent).join("/");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

main().catch((error) => {
  console.error("[hf-verified-bot] Verification failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
