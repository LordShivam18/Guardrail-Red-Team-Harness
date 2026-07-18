import { createHash } from "crypto";

import { canonicalizeJson } from "@/lib/issuerSigner";

export type RegulatoryLedgerEvent = {
  index: number;
  credential_hash: string;
  previous_event_hash: string | null;
  event_hash: string;
  merkle_root: string;
  timestamp: string;
};

const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

/**
 * In-process append-only Merkle ledger. Persist snapshots/events to immutable
 * sovereign storage in production; this utility supplies continuity and roots.
 */
export class RegulatoryLedger {
  private readonly events: RegulatoryLedgerEvent[] = [];
  private readonly leaves: string[] = [];

  append(credential: unknown, timestamp = new Date().toISOString()): RegulatoryLedgerEvent {
    const credentialHash = sha256(canonicalizeJson(credential));
    const previousEvent = this.events.at(-1);
    const event = {
      index: this.events.length,
      credential_hash: credentialHash,
      previous_event_hash: previousEvent?.event_hash ?? null,
      event_hash: "",
      merkle_root: "",
      timestamp,
    } satisfies RegulatoryLedgerEvent;

    event.event_hash = sha256(
      canonicalizeJson({
        credential_hash: event.credential_hash,
        index: event.index,
        previous_event_hash: event.previous_event_hash,
        timestamp: event.timestamp,
      }),
    );
    this.leaves.push(credentialHash);
    event.merkle_root = this.calculateMerkleRoot();
    this.events.push(Object.freeze(event));

    return event;
  }

  getEvents(): readonly RegulatoryLedgerEvent[] {
    return [...this.events];
  }

  getRoot(): string | null {
    return this.leaves.length === 0 ? null : this.calculateMerkleRoot();
  }

  private calculateMerkleRoot(): string {
    let level = [...this.leaves];

    while (level.length > 1) {
      const nextLevel: string[] = [];
      for (let index = 0; index < level.length; index += 2) {
        nextLevel.push(sha256(`${level[index]}${level[index + 1] ?? level[index]}`));
      }
      level = nextLevel;
    }

    return level[0] ?? "";
  }
}

export const sovereignRegulatoryLedger = new RegulatoryLedger();
