import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS_DIR = resolve(process.cwd(), "supabase", "migrations");

describe("migration ordering (deterministic 003a/003b chain)", () => {
  it("uses unique 003a/003b prefixes with no legacy duplicate 003 files", () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((file) => file.endsWith(".sql"));

    expect(files).toContain("003a_compliance_engine.sql");
    expect(files).toContain("003b_mesh_dataset_versions.sql");
    expect(files).not.toContain("003_compliance_engine.sql");
    expect(files).not.toContain("003_mesh_dataset_versions.sql");

    const prefixes = files.map((file) => file.split("_")[0]);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });

  it("keeps docker-compose initdb mounts aligned with the renamed files", () => {
    const compose = readFileSync(resolve(process.cwd(), "docker-compose.yml"), "utf8");

    expect(compose).toContain("003a_compliance_engine.sql");
    expect(compose).toContain("003b_mesh_dataset_versions.sql");
    expect(compose).not.toContain("migrations/003_compliance_engine.sql");
    expect(compose).not.toContain("migrations/003_mesh_dataset_versions.sql");
  });

  it("defines db:migrate:007 and db:migrate:all scripts", () => {
    const pkg = JSON.parse(
      readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };

    expect(pkg.scripts["db:migrate:007"]).toContain("migrate-007.ts");
    expect(pkg.scripts["db:migrate:all"]).toContain("migrate-all.ts");
    expect(pkg.scripts["db:migrate:003a"]).toContain("migrate-003a.ts");
    expect(pkg.scripts["db:migrate:003b"]).toContain("migrate-003b.ts");
  });

  it("runs migrations in deterministic order 003a, 003b, 004, 005, 006, 007", () => {
    const source = readFileSync(resolve(process.cwd(), "scripts", "migrate-all.ts"), "utf8");
    const order = [
      "003a_compliance_engine.sql",
      "003b_mesh_dataset_versions.sql",
      "004_phase9_modality.sql",
      "005_sovereign_index.sql",
      "006_evolutionary_art.sql",
      "007_drift_monitoring.sql",
    ];
    const positions = order.map((file) => source.indexOf(file));

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);

    for (const file of order) {
      expect(existsSync(resolve(MIGRATIONS_DIR, file))).toBe(true);
    }
  });
});
