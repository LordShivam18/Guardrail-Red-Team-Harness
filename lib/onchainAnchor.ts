import { JsonRpcProvider, Wallet, hexlify, toUtf8Bytes } from "ethers";

const DEFAULT_AMOY_RPC_URL = "https://rpc-amoy.polygon.technology";

export async function anchorCertificate(
  certHash: string
): Promise<{ txHash: string; network: string }> {
  const normalizedHash = certHash.trim();
  const privateKey = process.env.ONCHAIN_PRIVATE_KEY?.trim();

  if (!privateKey) {
    console.warn("[onchain-anchor] ONCHAIN_PRIVATE_KEY is absent. Using simulation mode.");

    return {
      txHash: `SIMULATED_${normalizedHash.slice(0, 16)}`,
      network: "simulation"
    };
  }

  const rpcUrl = process.env.ONCHAIN_RPC_URL?.trim() || DEFAULT_AMOY_RPC_URL;
  const provider = new JsonRpcProvider(rpcUrl, 80002);
  const signer = new Wallet(privateKey, provider);
  const signerAddress = await signer.getAddress();
  const data = hexlify(toUtf8Bytes(`mesh:cert:${normalizedHash}`));
  const transaction = await signer.sendTransaction({
    to: signerAddress,
    value: 0,
    data
  });

  return {
    txHash: transaction.hash,
    network: "polygon-amoy"
  };
}
