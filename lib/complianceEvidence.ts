import { sql } from "./db";
import { calculateMeshScore } from "./meshScore";

export type ComplianceStatus = "PASS" | "FAIL" | "NOT_EVALUATED";
export type OverallComplianceStatus = "COMPLIANT" | "PARTIAL" | "NON_COMPLIANT";
export type ComplianceSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type ComplianceOperator = "<=" | ">=";

export type EvidenceControl = {
  controlId: string;
  controlName: string;
  metricField: string;
  operator: ComplianceOperator;
  threshold: number;
  severity: ComplianceSeverity;
  observedValue: number | null;
  status: ComplianceStatus;
  evidence: Record<string, unknown>;
};

export type EvidenceFramework = {
  code: string;
  name: string;
  version: string;
  effectiveDate: string;
  controls: EvidenceControl[];
  passCount: number;
  failCount: number;
  overallStatus: OverallComplianceStatus;
};

export type EvidencePack = {
  runId: string;
  generatedAt: string;
  frameworks: EvidenceFramework[];
};

type RunRow = {
  id: string;
  timestamp: string;
  model_version: string;
  jailbreak_rate: number;
  fp_rate: number;
  safety_sharpe: number;
};

type MappingRow = {
  framework_id: number;
  framework_code: string;
  framework_name: string;
  framework_version: string;
  effective_date: string;
  control_id: string;
  control_name: string;
  metric_field: string;
  operator: ComplianceOperator;
  threshold: number | string;
  severity: ComplianceSeverity;
};

type ModalitiesRow = {
  modalities: string[] | null;
};

export class RunNotFoundError extends Error {
  constructor(runId: string) {
    super(`Run not found: ${runId}`);
    this.name = "RunNotFoundError";
  }
}

export async function generateEvidencePack(runId: string): Promise<EvidencePack> {
  const generatedAt = new Date().toISOString();
  const runRows = (await sql`
    select
      id,
      timestamp,
      model_version,
      jailbreak_rate,
      fp_rate,
      coalesce(safety_sharpe, 0) as safety_sharpe
    from redteam_runs
    where id = ${runId}::uuid
    limit 1
  `) as RunRow[];
  const run = runRows[0];

  if (!run) {
    throw new RunNotFoundError(runId);
  }

  const [mappingRows, modalitiesRows] = await Promise.all([
    sql`
      select
        frameworks.id as framework_id,
        frameworks.code as framework_code,
        frameworks.name as framework_name,
        frameworks.version as framework_version,
        frameworks.effective_date::text as effective_date,
        mappings.control_id,
        mappings.control_name,
        mappings.metric_field,
        mappings.operator,
        mappings.threshold,
        mappings.severity
      from compliance_mappings mappings
      inner join compliance_frameworks frameworks
        on frameworks.id = mappings.framework_id
      order by frameworks.id asc, mappings.id asc
    `,
    sql`
      select
        array_remove(
          array_agg(
            distinct coalesce(nullif(to_jsonb(results)->>'modality', ''), 'text')
          ),
          null
        ) as modalities
      from redteam_results results
      where results.run_id = ${runId}::uuid
    `
  ]);
  const mappings = mappingRows as MappingRow[];
  const modalities = normalizeModalities((modalitiesRows as ModalitiesRow[])[0]?.modalities);
  const frameworkMap = new Map<string, EvidenceFramework>();

  for (const mapping of mappings) {
    const threshold = toNumber(mapping.threshold);
    const observedValue = getObservedMetric(mapping.metric_field, run, modalities);
    const status = evaluateStatus(observedValue, mapping.operator, threshold);
    const frameworkKey = mapping.framework_code;
    const evidence = {
      runId: run.id,
      modelVersion: run.model_version,
      runTimestamp: run.timestamp,
      generatedAt,
      frameworkCode: mapping.framework_code,
      controlId: mapping.control_id,
      metricField: mapping.metric_field,
      operator: mapping.operator,
      threshold,
      observedValue,
      severity: mapping.severity,
      status,
      modalities
    };

    await sql`
      insert into compliance_evidence (
        run_id,
        framework_id,
        control_id,
        status,
        observed_value,
        threshold,
        evidence_json
      )
      values (
        ${run.id}::uuid,
        ${mapping.framework_id},
        ${mapping.control_id},
        ${status},
        ${observedValue},
        ${threshold},
        ${JSON.stringify(evidence)}::jsonb
      )
      on conflict (run_id, framework_id, control_id) do update set
        status = excluded.status,
        observed_value = excluded.observed_value,
        threshold = excluded.threshold,
        evidence_json = excluded.evidence_json,
        created_at = now()
    `;

    const framework = frameworkMap.get(frameworkKey) ?? {
      code: mapping.framework_code,
      name: mapping.framework_name,
      version: mapping.framework_version,
      effectiveDate: formatDate(mapping.effective_date),
      controls: [],
      passCount: 0,
      failCount: 0,
      overallStatus: "COMPLIANT" as OverallComplianceStatus
    };

    framework.controls.push({
      controlId: mapping.control_id,
      controlName: mapping.control_name,
      metricField: mapping.metric_field,
      operator: mapping.operator,
      threshold,
      severity: mapping.severity,
      observedValue,
      status,
      evidence
    });

    if (status === "PASS") {
      framework.passCount += 1;
    } else if (status === "FAIL") {
      framework.failCount += 1;
    }

    frameworkMap.set(frameworkKey, framework);
  }

  for (const framework of frameworkMap.values()) {
    framework.overallStatus = getOverallStatus(framework.controls);
  }

  return {
    runId: run.id,
    generatedAt,
    frameworks: [...frameworkMap.values()]
  };
}

function getObservedMetric(metricField: string, run: RunRow, modalities: string[]) {
  if (metricField === "jailbreak_rate") {
    return toFiniteNumber(run.jailbreak_rate);
  }

  if (metricField === "false_positive_rate") {
    return toFiniteNumber(run.fp_rate);
  }

  if (metricField === "safety_sharpe") {
    return toFiniteNumber(run.safety_sharpe);
  }

  if (metricField === "mesh_score") {
    return calculateMeshScore(
      toFiniteNumber(run.jailbreak_rate) ?? 0,
      toFiniteNumber(run.fp_rate) ?? 0,
      toFiniteNumber(run.safety_sharpe) ?? 0,
      modalities
    );
  }

  return null;
}

function evaluateStatus(
  observedValue: number | null,
  operator: ComplianceOperator,
  threshold: number
): ComplianceStatus {
  if (observedValue == null || !Number.isFinite(threshold)) {
    return "NOT_EVALUATED";
  }

  if (operator === "<=") {
    return observedValue <= threshold ? "PASS" : "FAIL";
  }

  return observedValue >= threshold ? "PASS" : "FAIL";
}

function getOverallStatus(controls: EvidenceControl[]): OverallComplianceStatus {
  const failures = controls.filter((control) => control.status === "FAIL");

  if (failures.some((control) => control.severity === "CRITICAL" || control.severity === "HIGH")) {
    return "NON_COMPLIANT";
  }

  if (failures.length > 0) {
    return "PARTIAL";
  }

  return "COMPLIANT";
}

function normalizeModalities(values: string[] | null | undefined) {
  const modalities = (values ?? [])
    .map((value) => String(value).trim().toLowerCase())
    .filter(Boolean);

  return modalities.length > 0 ? [...new Set(modalities)] : ["text"];
}

function toNumber(value: number | string) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toFiniteNumber(value: number | string | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDate(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}
