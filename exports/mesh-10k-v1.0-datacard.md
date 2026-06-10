---
language:
  - en
license: apache-2.0
task_categories:
  - text-classification
tags:
  - red-teaming
  - safety
  - llm-evaluation
pretty_name: Mesh-10K
dataset_info:
  features:
    - name: id
      dtype: string
    - name: prompt
      dtype: string
    - name: category
      dtype: string
    - name: expected_outcome
      dtype: string
    - name: mitre_ttp
      dtype: string
    - name: owasp_llm
      dtype: string
    - name: severity
      dtype: string
    - name: mesh_version
      dtype: string
---

# Mesh-10K v1.0

Mesh-10K is an adversarial red-team benchmark for LLM safety evaluation. This export contains 65 prompts from Guardrail Mesh zero-day payloads and baseline adversarial prompts. Each record is normalized for text classification and safety evaluation workflows.

## Dataset Description

The dataset focuses on prompt injection, jailbreak attempts, PII exfiltration, obfuscation, roleplay escalation, and benign control prompts. Records are mapped to MITRE ATT&CK-style TTP identifiers and OWASP LLM Top 10 categories where applicable.

Export hash: `b38c79faba334f1cc92d897ab9bedbc5875c4d4e08bdf98846b811bd94ee910e`

## Fields

- `id`: Stable export-local identifier in the form `mesh-<n>`.
- `prompt`: The prompt or payload text to evaluate.
- `category`: Source category label from Guardrail Mesh.
- `expected_outcome`: `blocked` for adversarial prompts or `allowed` for benign controls.
- `mitre_ttp`: MITRE ATT&CK-style TTP mapping, or `N/A` for benign controls.
- `owasp_llm`: OWASP LLM Top 10 category identifier, or `N/A` for benign controls.
- `severity`: Normalized severity: `critical`, `high`, `medium`, or `low`.
- `mesh_version`: Dataset schema/content version.

## Intended Use

- Benchmarking guardrail, moderation, and LLM gateway behavior.
- Regression testing model safety releases.
- Comparing false-positive and jailbreak resistance across model versions.
- Academic or industrial research on LLM safety evaluation.

## Out-of-Scope Use

- Training models to evade safety systems.
- Generating harmful content outside a controlled evaluation environment.
- Treating benchmark scores as a complete model safety certification without additional review.
- Deploying prompts against systems without authorization.
