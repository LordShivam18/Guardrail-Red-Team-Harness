import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "GUARDRAIL MESH — Enterprise LLM Security",
  description:
    "Enterprise-grade active interception proxy and automated red-team orchestration for large language models. Air-gapped judge framework with cryptographic compliance vaults."
};

type FeatureCard = {
  icon: string;
  title: string;
  description: string;
};

const FEATURES: FeatureCard[] = [
  {
    icon: "🛡️",
    title: "Active Interception Proxy",
    description:
      "Inspects incoming telemetry and drops adversarial jailbreaks at the network edge in under 5 ms. Zero-trust architecture with real-time OWASP LLM-01 classification."
  },
  {
    icon: "🔄",
    title: "BYOJ Architecture",
    description:
      "Seamlessly hot-swap security evaluation nodes between decentralized cloud clusters and air-gapped local runtimes. Gemini, LlamaGuard, or your own webhook — one env var."
  },
  {
    icon: "🔒",
    title: "Executive Compliance Vault",
    description:
      "Compile execution metrics, compute exhaustion shifts, and safety scores into cryptographically signed PDF audits. Board-ready in one click."
  }
];

export default function LandingPage() {
  return (
    <main className="bg-black text-white selection:bg-white selection:text-black">
      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="hero">
        {/* Ambient grid overlay */}
        <div className="hero-grid" aria-hidden="true" />

        <div className="hero-content">
          {/* Mono label */}
          <p className="hero-label">
            <span className="hero-label-dot" />
            SECURITY MESH v2.0
          </p>

          {/* Headline */}
          <h1 className="hero-headline">
            GUARDRAIL
            <br />
            <span className="hero-headline-accent">MESH.</span>
          </h1>

          {/* Subheadline */}
          <p className="hero-sub">
            Enterprise-grade active interception proxy &amp;&nbsp;automated
            red&#8209;team orchestration for large language models.
          </p>

          {/* CTA */}
          <Link href="/dashboard" className="hero-cta" prefetch={false}>
            Launch Control Room
            <span className="hero-cta-arrow" aria-hidden="true">
              ↗
            </span>
          </Link>
        </div>

        {/* Decorative bottom rule */}
        <div className="hero-rule" aria-hidden="true" />
      </section>

      {/* ── Feature Grid ────────────────────────────────── */}
      <section className="features-section">
        <div className="features-header">
          <p className="features-eyebrow">ARCHITECTURE</p>
          <h2 className="features-title">
            Three pillars.
            <br />
            Zero&nbsp;compromise.
          </h2>
        </div>

        <div className="features-grid">
          {FEATURES.map((feature) => (
            <article key={feature.title} className="feature-card">
              <span className="feature-icon" aria-hidden="true">
                {feature.icon}
              </span>
              <h3 className="feature-name">{feature.title}</h3>
              <p className="feature-desc">{feature.description}</p>
              <div className="feature-shine" aria-hidden="true" />
            </article>
          ))}
        </div>
      </section>

      {/* ── Footer strip ────────────────────────────────── */}
      <footer className="landing-footer">
        <p>
          © {new Date().getFullYear()} Guardrail Mesh &middot; All rights
          reserved.
        </p>
      </footer>
    </main>
  );
}
