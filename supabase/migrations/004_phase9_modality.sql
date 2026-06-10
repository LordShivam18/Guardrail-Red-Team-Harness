ALTER TABLE redteam_results
  ADD COLUMN IF NOT EXISTS modality VARCHAR(20) DEFAULT 'text'
  CHECK (modality IN ('text','tool_call','vision','rag','voice'));

ALTER TABLE adversarial_prompts
  ADD COLUMN IF NOT EXISTS modality VARCHAR(20) DEFAULT 'text';

CREATE TABLE IF NOT EXISTS agentic_tool_sequences (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  tool_calls JSONB NOT NULL,
  expected_outcome VARCHAR(20) DEFAULT 'blocked',
  mitre_ttp VARCHAR(30),
  owasp_llm VARCHAR(10),
  severity VARCHAR(10) DEFAULT 'high',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
