import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

type SecretPattern = {
  type: string;
  regex: RegExp;
};

type SecretFinding = {
  filePath: string;
  line: number;
  column: number;
  type: string;
};

const SCANNED_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".yml"]);
const IGNORED_DIRECTORIES = new Set(["node_modules", ".git", ".next"]);
const SECRET_PATTERNS: SecretPattern[] = [
  {
    type: "Gemini / Google API Key",
    regex: /AIza[0-9A-Za-z-_]{35}/g
  },
  {
    type: "Postgres Connection String",
    regex: /postgres(?:ql)?:\/\/[^:\s]+:[^@\s]+@/gi
  },
  {
    type: "Redis Connection String",
    regex: /redis:\/\/[^:\s]+:[^@\s]+@/gi
  },
  {
    type: "Generic API Key / Secret",
    regex: /(api_key|secret|password|token)\s*(:|=)\s*['"][a-zA-Z0-9-_]{10,}['"]/gi
  }
];

async function main() {
  const repositoryRoot = process.cwd();
  const filePaths = await collectScannableFiles(repositoryRoot);
  const findings: SecretFinding[] = [];

  for (const filePath of filePaths) {
    const fileContents = await readFile(filePath, "utf8");
    findings.push(...scanFile(repositoryRoot, filePath, fileContents));
  }

  if (findings.length > 0) {
    printFailure(findings);
    process.exit(1);
  }

  console.log(
    "\u001b[32m[sec-ops] Repository scan complete. 0 hardcoded secrets detected in tracked files.\u001b[0m"
  );
}

async function collectScannableFiles(directoryPath: string): Promise<string[]> {
  const entries = await readdir(directoryPath, {
    withFileTypes: true
  });
  const filePaths = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = join(directoryPath, entry.name);

      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entry.name)) {
          return [];
        }

        return collectScannableFiles(entryPath);
      }

      if (!entry.isFile() || !SCANNED_EXTENSIONS.has(getExtension(entry.name))) {
        return [];
      }

      return [entryPath];
    })
  );

  return filePaths.flat();
}

function scanFile(
  repositoryRoot: string,
  filePath: string,
  fileContents: string
): SecretFinding[] {
  const findings: SecretFinding[] = [];

  for (const pattern of SECRET_PATTERNS) {
    pattern.regex.lastIndex = 0;

    for (const match of fileContents.matchAll(pattern.regex)) {
      const index = match.index ?? 0;
      const location = getLineAndColumn(fileContents, index);

      findings.push({
        filePath: relative(repositoryRoot, filePath),
        line: location.line,
        column: location.column,
        type: pattern.type
      });
    }
  }

  return findings;
}

function getLineAndColumn(fileContents: string, index: number) {
  const prefix = fileContents.slice(0, index);
  const lines = prefix.split(/\r?\n/);
  const line = lines.length;
  const column = lines[lines.length - 1].length + 1;

  return {
    line,
    column
  };
}

function getExtension(fileName: string) {
  const extensionIndex = fileName.lastIndexOf(".");

  if (extensionIndex === -1) {
    return "";
  }

  return fileName.slice(extensionIndex).toLowerCase();
}

function printFailure(findings: SecretFinding[]) {
  const red = "\u001b[31m";
  const bold = "\u001b[1m";
  const reset = "\u001b[0m";
  const divider = "=".repeat(88);

  console.error(`${red}${bold}${divider}${reset}`);
  console.error(
    `${red}${bold}[sec-ops] CRITICAL SECRET SCAN FAILURE: hardcoded sensitive values detected.${reset}`
  );
  console.error(`${red}${bold}${divider}${reset}`);

  for (const finding of findings) {
    console.error(
      `${red}${bold}- ${finding.type}${reset} ${finding.filePath}:${finding.line}:${finding.column}`
    );
  }

  console.error(`${red}${bold}${divider}${reset}`);
}

main().catch((error) => {
  console.error("[sec-ops] Secret scan failed unexpectedly.");
  console.error(error);
  process.exitCode = 1;
});
