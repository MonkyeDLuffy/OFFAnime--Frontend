import type { Metadata } from "next";
import Link from "next/link";
import { Mail, Scale } from "lucide-react";
import ContactForm from "@/components/contact-form";
import { SITE_EMAIL, siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Get in touch with OFFAnime — general inquiries, feedback and copyright-related requests.",
  alternates: { canonical: siteUrl("/contact") },
  openGraph: {
    title: "Contact — OFFANIME",
    description:
      "Get in touch with OFFAnime — general inquiries, feedback and copyright-related requests.",
    url: siteUrl("/contact"),
    siteName: "OFFANIME",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Contact — OFFANIME",
    description:
      "Get in touch with OFFAnime — general inquiries, feedback and copyright-related requests.",
  },
};

/**
 * "/contact" — the site's contact page. Premium dark styling consistent with
 * the home experience: outlined-free bold typography, glass surfaces, and
 * the shared liquid-glass button skin. The email address is the single real
 * contact channel (there is no backend messaging service); the form below
 * composes a prefilled email in the visitor's own mail app and says so
 * plainly (see ContactForm).
 */
export default function ContactPage() {
  return (
    <main className="relative">
      {/* Subtle top glow, mirroring the footer/section treatment */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(50%_100%_at_50%_0%,rgba(140,140,190,0.08),transparent_75%)]"
      />

      {/* Top padding clears the fixed navbar (56/64px) with breathing room. */}
      <div className="relative mx-auto max-w-3xl px-6 pb-16 pt-24 sm:px-10 sm:pb-20 sm:pt-28 lg:px-16 xl:px-24">
        <p className="type-label text-[11px] uppercase text-white/40">
          Contact
        </p>
        <h1 className="type-display mt-4 text-[36px] sm:text-48px text-white">
          Get in Touch
        </h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-white/65">
          Questions, feedback, or something that needs fixing? The OFFAnime
          team reads every message. Reach out for general inquiries, bug
          reports, partnership ideas — or copyright-related requests about
          content that appears on the site.
        </p>

        {/* The one real contact channel — prominent, one click away. */}
        <div className="mt-10 rounded-3xl border border-white/12 bg-white/[0.04] p-6 backdrop-blur-md sm:p-8">
          <p className="flex items-center gap-2.5 type-label text-[11px] uppercase text-white/40">
            <Mail className="h-3.5 w-3.5" aria-hidden="true" />
            Email us
          </p>
          <a
            href={`mailto:${SITE_EMAIL}`}
            className="type-display mt-4 inline-block text-lg text-white underline decoration-white/25 decoration-2 underline-offset-[6px] transition-colors hover:decoration-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/90 sm:text-2xl"
          >
            {SITE_EMAIL}
          </a>
          <p className="mt-4 text-sm leading-relaxed text-white/60">
            Use this address for anything at all — general inquiries and
            copyright-related requests both. Copyright takedown notices
            should follow the process described on the{" "}
            <Link
              href="/dmca"
              className="font-semibold text-white/85 underline decoration-white/30 underline-offset-4 transition-colors hover:text-white hover:decoration-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/90"
            >
              DMCA Policy page
            </Link>
            , where you&apos;ll also find what a complete notice includes.
          </p>
        </div>

        {/* Form — composes an email in the visitor's own mail app (see the
            component's doc comment for the honest delivery model). */}
        <div className="mt-14">
          <h2 className="type-display text-xl text-white sm:text-2xl">
            Write to us
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-white/55">
            Fill in the form and we&apos;ll open a pre-filled email in your
            own mail app — the reliable way to reach us until a direct
            delivery service is set up.
          </p>
          <ContactForm />
        </div>

        {/* Cross-link to the takedown process */}
        <div className="mt-14 flex items-start gap-4 rounded-2xl border border-white/12 bg-white/[0.03] p-5 sm:p-6">
          <Scale className="mt-1 h-5 w-5 shrink-0 text-white/50" />
          <p className="text-sm leading-relaxed text-white/60">
            Reporting copyrighted material? You don&apos;t need the form —
            the{" "}
            <Link
              href="/dmca"
              className="font-semibold text-white/85 underline decoration-white/30 underline-offset-4 transition-colors hover:text-white hover:decoration-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/90"
            >
              DMCA Policy
            </Link>{" "}
            page lists exactly what to include so your notice can be handled
            quickly.
          </p>
        </div>
      </div>
    </main>
  );
}
