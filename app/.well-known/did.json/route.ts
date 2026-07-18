import { NextResponse } from "next/server";

import { sovereignIssuerSigner } from "@/lib/issuerSigner";
import { SOVEREIGN_DID } from "@/lib/credential";

export const runtime = "nodejs";

export function GET() {
  const publicKey = sovereignIssuerSigner.getPublicKey();
  const verificationMethodId = `${SOVEREIGN_DID}#assertion-1`;

  return NextResponse.json({
    "@context": ["https://www.w3.org/ns/did/v1"],
    id: SOVEREIGN_DID,
    verificationMethod: [
      {
        id: verificationMethodId,
        type: "JsonWebKey2020",
        controller: SOVEREIGN_DID,
        publicKeyJwk: publicKey,
      },
    ],
    assertionMethod: [verificationMethodId],
  });
}
