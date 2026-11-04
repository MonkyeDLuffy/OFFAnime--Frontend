import type { Metadata } from "next";
import Link from "next/link";
import { Info, Mail } from "lucide-react";
import { SITE_EMAIL, siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The terms that govern your use of OFFAnime — the service, third-party content, responsibilities and copyright process.",
  alternates: { canonical: siteUrl("/terms") },
  openGraph: {
    title: "Terms of Service — OFFANIME",
    description:
      "The terms that govern your use of OFFAnime — the service, third-party content, responsibilities and copyright process.",
    url: siteUrl("/terms"),
    siteName: "OFFANIME",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Terms of Service — OFFANIME",
    description:
      "The terms that govern your use of OFFAnime — the service, third-party content, responsibilities and copyright process.",
  },
};

/**
 * "/terms" — the Terms of Service page.
 *
 * Deliberately modest and plain-spoken: a clearly-labeled general draft with
 * no invented company registration, business address, or governing
 * jurisdiction, and no claim that the terms are guaranteed legally
 * enforceable. Sections are numbered for easy reference.
 */
export default function TermsPage() {
  return (
    <main className="relative">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(50%_100%_at_50%_0%,rgba(140,140,190,0.08),transparent_75%)]"
      />

      {/* Top padding clears the fixed navbar (56/64px) with breathing room. */}
      <div className="relative mx-auto max-w-3xl px-6 pb-16 pt-24 sm:px-10 sm:pb-20 sm:pt-28 lg:px-16 xl:px-24">
        <p className="type-label text-[11px] uppercase text-white/40">
          Legal
        </p>
        <h1 className="type-display mt-4 text-[36px] sm:text-48px text-white">
          Terms of Service
        </h1>

        {/* Draft notice — required honesty about the document's status */}
        <div className="mt-8 flex items-start gap-4 rounded-2xl border border-white/12 bg-white/[0.03] p-5 sm:p-6">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-white/50" />
          <p className="text-sm leading-relaxed text-white/60">
            <span className="font-semibold text-white/85">
              About this document:
            </span>{" "}
            this is a general draft of the site&apos;s terms, written to be
            understandable rather than exhaustive. It should be reviewed for
            your applicable jurisdiction — ideally by a qualified legal
            professional — before being relied upon in production. Nothing
            here constitutes legal advice, no business registration, address
            or governing jurisdiction is asserted, and these terms are not
            represented as guaranteed legally enforceable.
          </p>
        </div>

        <p className="mt-6 text-base leading-relaxed text-white/65">
          These terms apply to your use of OFFAnime (the &ldquo;site&rdquo;).
          By using the site you accept them, so please take a few minutes to
          read them. The sections below describe what the service is, how
          third-party content works, what we expect from users, and how
          copyright concerns are handled.
        </p>

        <div className="mt-14 space-y-12">
          <section aria-labelledby="terms-acceptance">
            <h2
              id="terms-acceptance"
              className="type-display text-xl text-white sm:text-2xl"
            >
              1. Acceptance of the terms
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-white/60">
              By accessing or using OFFAnime in any way, you agree to these
              terms. If you do not agree with any part of them, please do not
              use the site. We may update these terms from time to time
              (see{" "}
              <a
                href="#terms-changes"
                className="font-semibold text-white/85 underline decoration-white/30 underline-offset-4 transition-colors hover:text-white hover:decoration-white"
              >
                Changes to the terms
              </a>
              ); continuing to use the site after an update means you accept
              the revised version.
            </p>
          </section>

          <section aria-labelledby="terms-service">
            <h2
              id="terms-service"
              className="type-display text-xl text-white sm:text-2xl"
            >
              2. Description of the service
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-white/60">
              OFFAnime is a discovery and viewing interface for anime
              content. It presents information about anime titles (such as
              posters, descriptions and metadata) together with embedded
              playback of video streams served by third-party providers. The
              site does not host, store, or upload any media files itself; it
              surfaces content that originates from external services.
            </p>
          </section>

          <section aria-labelledby="terms-third-party">
            <h2
              id="terms-third-party"
              className="type-display text-xl text-white sm:text-2xl"
            >
              3. Third-party content, links &amp; streaming providers
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-white/60">
              Video streams, images, and some metadata shown on OFFAnime come
              from third-party services over which we have no control. We
              don&apos;t endorse, warrant, or guarantee any third-party
              content, and we are not responsible for its availability,
              accuracy, legality, or any practices of the providers behind
              it. Where the site links to or embeds external services, those
              services have their own terms and policies — your use of them
              is a matter between you and the provider.
            </p>
          </section>

          <section aria-labelledby="terms-responsibilities">
            <h2
              id="terms-responsibilities"
              className="type-display text-xl text-white sm:text-2xl"
            >
              4. User responsibilities &amp; prohibited misuse
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-white/60">
              You agree to use the site lawfully and respectfully. That means
              you should not: attempt to break, overload, or disrupt the site
              or its infrastructure; scrape or redistribute its content at
              scale; misrepresent your identity or affiliation when
              contacting us; or use the site in any way that violates
              applicable laws or the rights of others, including copyright
              rights. Access may be restricted for misuse.
            </p>
          </section>

          <section aria-labelledby="terms-dmca">
            <h2
              id="terms-dmca"
              className="type-display text-xl text-white sm:text-2xl"
            >
              5. Copyright complaints &amp; DMCA requests
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-white/60">
              We take copyright concerns seriously. If you believe material
              accessible through the site infringes your copyright, you can
              submit a takedown request — our{" "}
              <Link
                href="/dmca"
                className="font-semibold text-white/85 underline decoration-white/30 underline-offset-4 transition-colors hover:text-white hover:decoration-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/90"
              >
                DMCA Policy
              </Link>{" "}
              explains exactly what a complete notice includes and where to
              send it. Submitted requests are reviewed and, where warranted,
              appropriate action is taken, including removing or disabling
              access to the material.
            </p>
          </section>

          <section aria-labelledby="terms-availability">
            <h2
              id="terms-availability"
              className="type-display text-xl text-white sm:text-2xl"
            >
              6. Service availability &amp; changes
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-white/60">
              OFFAnime is provided as-is and as-available. We do not promise
              that the site will be uninterrupted, error-free, or that any
              particular content will always be available — third-party
              sources may change or disappear at any time. We may add,
              modify, suspend, or discontinue any part of the site, including
              individual features or the whole service, at any time.
            </p>
          </section>

          <section aria-labelledby="terms-liability">
            <h2
              id="terms-liability"
              className="type-display text-xl text-white sm:text-2xl"
            >
              7. Limitation of liability
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-white/60">
              To the fullest extent permitted by applicable law, OFFAnime and
              its operators will not be liable for any indirect, incidental,
              or consequential damages arising from your use of — or
              inability to use — the site, or from any third-party content
              accessed through it. Because the site provides access to
              third-party services it does not control, no warranty is made
              about the accuracy, legality, or safety of that content.
              Nothing in this section limits liability that cannot be limited
              under applicable law.
            </p>
          </section>

          <section aria-labelledby="terms-changes">
            <h2
              id="terms-changes"
              className="type-display text-xl text-white sm:text-2xl"
            >
              8. Changes to the terms
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-white/60">
              We may revise these terms as the service evolves. The version
              published on this page is always the current one, and material
              changes will be reflected here. It&apos;s a good idea to check
              back occasionally — continued use of the site after changes are
              published constitutes acceptance of the updated terms.
            </p>
          </section>

          <section aria-labelledby="terms-contact">
            <h2
              id="terms-contact"
              className="type-display text-xl text-white sm:text-2xl"
            >
              9. Contact
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-white/60">
              Questions about these terms? Reach us at{" "}
              <a
                href={`mailto:${SITE_EMAIL}`}
                className="font-semibold text-white/85 underline decoration-white/30 underline-offset-4 transition-colors hover:text-white hover:decoration-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/90"
              >
                {SITE_EMAIL}
              </a>{" "}
              — the same address handles general inquiries and copyright
              matters.
            </p>
            <a
              href={`mailto:${SITE_EMAIL}`}
              className="glass-btn glass-btn--dark type-label mt-6 inline-flex items-center gap-2.5 rounded-full px-5 py-3 text-sm text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/90"
            >
              <Mail className="h-4 w-4" aria-hidden="true" />
              {SITE_EMAIL}
            </a>
          </section>
        </div>
      </div>
    </main>
  );
}
