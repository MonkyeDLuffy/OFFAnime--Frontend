import type { Metadata } from "next";
import Link from "next/link";
import { Mail, Scale } from "lucide-react";
import { HOSTING_DISCLAIMER, SITE_EMAIL, siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "DMCA Policy",
  description:
    "How to submit a copyright takedown notice to OFFAnime — requirements, process and contact address.",
  alternates: { canonical: siteUrl("/dmca") },
  openGraph: {
    title: "DMCA Policy — OFFANIME",
    description:
      "How to submit a copyright takedown notice to OFFAnime — requirements, process and contact address.",
    url: siteUrl("/dmca"),
    siteName: "OFFANIME",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "DMCA Policy — OFFANIME",
    description:
      "How to submit a copyright takedown notice to OFFAnime — requirements, process and contact address.",
  },
};

/** The exact good-faith statement a notice must contain. */
const GOOD_FAITH_STATEMENT =
  "I have a good faith belief that the use of the copyrighted material I am complaining of is not authorized by the copyright owner, its agent, or the law (e.g., as a fair use)";

/** The exact accuracy/authority statement a notice must contain. */
const ACCURACY_STATEMENT =
  "The information in this notice is accurate and, under penalty of perjury, I am the owner, or authorized to act on behalf of the owner, of the copyright or of an exclusive right that is allegedly infringed";

/** The six required elements of a complete takedown notice. */
const REQUIREMENTS: {
  title: string;
  body: string;
  quote?: string;
}[] = [
  {
    title: "Identification of the copyrighted work",
    body: "A description of the copyrighted work claimed to have been infringed.",
  },
  {
    title: "Identification of the allegedly infringing material",
    body: "A description of the material requested to be removed or disabled, including its URL or other specific location.",
  },
  {
    title: "Contact information",
    body: "The reporting person's name, title if acting as an agent, address, telephone number, and email address.",
  },
  {
    title: "Good-faith statement",
    body: "Include this exact statement:",
    quote: GOOD_FAITH_STATEMENT,
  },
  {
    title: "Accuracy and authority statement",
    body: "Include this exact statement:",
    quote: ACCURACY_STATEMENT,
  },
  {
    title: "Signature",
    body: "An electronic or physical signature of the copyright owner or an authorized representative.",
  },
] as const;

/**
 * "/dmca" — the DMCA policy and takedown page. Professional, readable, and
 * deliberately modest in its claims: it describes a voluntary review
 * process, never asserts verified legal compliance, and never promises
 * immunity from liability. The six notice requirements and both quoted
 * statements are preserved exactly as specified.
 */
export default function DmcaPage() {
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
          DMCA Policy &amp; Takedown Requests
        </h1>

        <p className="mt-6 text-base leading-relaxed text-white/65">
          {HOSTING_DISCLAIMER}
        </p>
        <p className="mt-4 text-base leading-relaxed text-white/65">
          OFFAnime respects the rights of copyright holders. If you believe
          material made available through this site infringes your
          copyright, you can submit a takedown request using the process
          below — no account or special form is needed. Requests are reviewed
          by a human, and where a notice is complete and warranted, we will
          take appropriate action, including removing or disabling access to
          the material in question.
        </p>

        {/* The six required elements */}
        <section aria-labelledby="dmca-requirements" className="mt-14">
          <h2
            id="dmca-requirements"
            className="type-display text-xl text-white sm:text-2xl"
          >
            What a complete takedown notice includes
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-white/55">
            A copyright takedown notice should include all six of the
            following. Incomplete notices may take longer to process or may
            not be actionable.
          </p>
          <ol className="mt-8 space-y-6">
            {REQUIREMENTS.map((requirement, index) => (
              <li key={requirement.title} className="flex gap-4">
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/[0.06] type-label text-sm text-white/85"
                >
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <h3 className="type-display text-base text-white">
                    {requirement.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-white/60">
                    {requirement.body}
                  </p>
                  {requirement.quote ? (
                    <blockquote className="mt-3 rounded-xl border border-white/12 bg-white/[0.03] px-4 py-3 text-sm italic leading-relaxed text-white/75">
                      &ldquo;{requirement.quote}&rdquo;
                    </blockquote>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Submission channel */}
        <section aria-labelledby="dmca-submit" className="mt-14">
          <h2
            id="dmca-submit"
            className="type-display text-xl text-white sm:text-2xl"
          >
            Submit your request
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-white/55">
            Send your complete notice to the address below — it is the
            official channel for all copyright complaints and takedown
            requests. Including everything listed above is the fastest way to
            get your request handled.
          </p>
          <div className="mt-6 rounded-3xl border border-white/12 bg-white/[0.04] p-6 backdrop-blur-md sm:p-8">
            <p className="flex items-center gap-2.5 type-label text-[11px] uppercase text-white/40">
              <Mail className="h-3.5 w-3.5" aria-hidden="true" />
              Copyright requests
            </p>
            <a
              href={`mailto:${SITE_EMAIL}?subject=${encodeURIComponent(
                "[OFFAnime] DMCA Takedown Request",
              )}`}
              className="type-display mt-4 inline-block break-all text-lg text-white underline decoration-white/25 decoration-2 underline-offset-[6px] transition-colors hover:decoration-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/90 sm:text-2xl"
            >
              {SITE_EMAIL}
            </a>
            <p className="mt-4 text-sm leading-relaxed text-white/60">
              OFFAnime will review submitted requests and take appropriate
              action, including removing or disabling access to material
              where warranted. We may contact you at the email address in
              your notice if additional information is needed.
            </p>
          </div>
        </section>

        {/* Honest scope note */}
        <section
          aria-labelledby="dmca-scope"
          className="mt-14 flex items-start gap-4 rounded-2xl border border-white/12 bg-white/[0.03] p-5 sm:p-6"
        >
          <Scale className="mt-1 h-5 w-5 shrink-0 text-white/50" />
          <div>
            <h2
              id="dmca-scope"
              className="type-display text-base text-white"
            >
              Please note
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-white/60">
              This policy describes a voluntary review process. It is
              provided for information only, does not constitute legal
              advice, and does not claim that OFFAnime has verified legal
              compliance with any particular law or that following this
              process guarantees any party immunity from liability. If you
              are unsure of your rights or obligations, please consult a
              qualified legal professional. Our{" "}
              <Link
                href="/terms"
                className="font-semibold text-white/85 underline decoration-white/30 underline-offset-4 transition-colors hover:text-white hover:decoration-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/90"
              >
                Terms of Service
              </Link>{" "}
              provide additional context about third-party content on the
              site.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
