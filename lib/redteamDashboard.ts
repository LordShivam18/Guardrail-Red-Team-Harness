import { createClient } from "@supabase/supabase-js";

type OutcomeFlag = "PASSED" | "FAILED" | "FP" | "FN";

type RunRow = {
  id: string;
  timestamp: string;
  model_version: string;
  jailbreak_rate: number;
  fp_rate: number;
};

type PromptJoin = {
  category: string;
  prompt_text: string;
};

type ResultRow = {
  id: string;
  final_output: string | null;
  raw_output: string | null;
  outcome_flag: OutcomeFlag;
  created_at: string;
  adversarial_prompts: PromptJoin | PromptJoin[] | null;
};

function getDashboardSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  if (!/^https?:\/\//.test(supabaseUrl)) {
    throw new Error("Invalid Supabase URL. Set SUPABASE_URL to your project HTTPS URL.");
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false
    }
  });
}

export type RunSummaryData = {
  runId: string;
  timestamp: string;
  modelVersion: string;
  jailbreakRate: number;
  falsePositiveRate: number;
  totalTests: number;
};

export type IncidentLogRow = {
  id: string;
  category: string;
  prompt: string;
  outcomeFlag: OutcomeFlag;
  finalOutput: string;
  createdAt: string;
};

export type IncidentLogData = {
  runId: string;
  timestamp: string;
  incidents: IncidentLogRow[];
};

async function getLatestRun() {
  const supabase = getDashboardSupabaseClient();

  const { data, error } = await supabase
    .from("redteam_runs")
    .select("id,timestamp,model_version,jailbreak_rate,fp_rate")
    .order("timestamp", { ascending: false })
    .limit(1)
    .maybeSingle<RunRow>();

  if (error) {
    throw error;
  }

  return data;
}

export async function getLatestRunSummary(): Promise<RunSummaryData | null> {
  const latestRun = await getLatestRun();

  if (!latestRun) {
    return null;
  }

  const supabase = getDashboardSupabaseClient();

  const { count, error } = await supabase
    .from("redteam_results")
    .select("id", { count: "exact", head: true })
    .eq("run_id", latestRun.id);

  if (error) {
    throw error;
  }

  return {
    runId: latestRun.id,
    timestamp: latestRun.timestamp,
    modelVersion: latestRun.model_version,
    jailbreakRate: latestRun.jailbreak_rate,
    falsePositiveRate: latestRun.fp_rate,
    totalTests: count ?? 0
  };
}

export async function getLatestRunIncidents(): Promise<IncidentLogData | null> {
  const latestRun = await getLatestRun();

  if (!latestRun) {
    return null;
  }

  const supabase = getDashboardSupabaseClient();

  const { data, error } = await supabase
    .from("redteam_results")
    .select(
      `
        id,
        final_output,
        raw_output,
        outcome_flag,
        created_at,
        adversarial_prompts!inner (
          category,
          prompt_text
        )
      `
    )
    .eq("run_id", latestRun.id)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  const incidents = ((data ?? []) as unknown as ResultRow[]).map((row) => {
    const prompt = Array.isArray(row.adversarial_prompts)
      ? row.adversarial_prompts[0]
      : row.adversarial_prompts;

    return {
      id: row.id,
      category: prompt?.category ?? "unknown",
      prompt: prompt?.prompt_text ?? "Prompt unavailable",
      outcomeFlag: row.outcome_flag,
      finalOutput: row.final_output ?? row.raw_output ?? "No output captured.",
      createdAt: row.created_at
    };
  });

  return {
    runId: latestRun.id,
    timestamp: latestRun.timestamp,
    incidents
  };
}
