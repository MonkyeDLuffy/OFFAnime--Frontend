"use client";

import { useState, type FormEvent } from "react";
import { Mail, Send } from "lucide-react";
import { SITE_EMAIL } from "@/lib/site";

/**
 * Contact form for the /contact page.
 *
 * Honest delivery model: OFFAnime has NO email backend — no submission
 * endpoint, no credentials, nothing to configure server-side. Submitting
 * therefore NEVER pretends to send anything: client-side validation runs,
 * and a valid submission composes a `mailto:` URL (recipient, subject and a
 * structured body) and hands it to the visitor's own email app, which is
 * where the message is actually sent. The success state says exactly that,
 * offers a re-open link (browsers and popup blockers can suppress mail
 * links) and surfaces the raw address for manual copy-paste. Invalid input
 * gets inline, field-level errors wired to aria-describedby/aria-invalid.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FieldErrors {
  name?: string;
  email?: string;
  subject?: string;
  message?: string;
}

const inputClass =
  "w-full rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-white/35 transition-colors duration-200 focus:border-white/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80 aria-[invalid=true]:border-red-400/60";

const errorClass = "mt-1.5 text-xs font-medium text-red-300";

export default function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  /** "composed" = the mailto hand-off happened (nothing is transmitted by
      the site itself — the visitor's mail app does the actual sending). */
  const [status, setStatus] = useState<"idle" | "composed">("idle");
  const [composedMailto, setComposedMailto] = useState("");

  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    if (name.trim().length === 0) next.name = "Please enter your name.";
    if (email.trim().length === 0) {
      next.email = "Please enter your email address.";
    } else if (!EMAIL_PATTERN.test(email.trim())) {
      next.email = "That email address doesn't look valid.";
    }
    if (subject.trim().length === 0) {
      next.subject = "Please add a subject.";
    }
    if (message.trim().length < 10) {
      next.message = "Please write a message of at least 10 characters.";
    }
    return next;
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    // Compose the email in the visitor's own mail app — the website itself
    // never transmits anything (no delivery service exists yet).
    const mailSubject = `[OFFAnime] ${subject.trim()}`;
    const mailBody = [
      `Name: ${name.trim()}`,
      `Email: ${email.trim()}`,
      "",
      message.trim(),
      "",
      "— Sent via the OFFAnime contact form",
    ].join("\n");
    const mailto = `mailto:${SITE_EMAIL}?subject=${encodeURIComponent(
      mailSubject,
    )}&body=${encodeURIComponent(mailBody)}`;

    // Hand off to the OS/mail handler.
    window.location.href = mailto;
    setComposedMailto(mailto);
    // No reliable way to detect whether a mail app actually opened — say
    // exactly that instead of claiming success.
    setStatus("composed");
  };

  return (
    <div className="mt-10">
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label
              htmlFor="contact-name"
              className="type-label mb-2 block text-sm text-white/80"
            >
              Name <span className="text-white/40">*</span>
            </label>
            <input
              id="contact-name"
              name="name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? "contact-name-error" : undefined}
              placeholder="Your name"
              className={inputClass}
            />
            {errors.name ? (
              <p id="contact-name-error" className={errorClass}>
                {errors.name}
              </p>
            ) : null}
          </div>

          <div>
            <label
              htmlFor="contact-email"
              className="type-label mb-2 block text-sm text-white/80"
            >
              Email <span className="text-white/40">*</span>
            </label>
            <input
              id="contact-email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={
                errors.email ? "contact-email-error" : undefined
              }
              placeholder="you@example.com"
              className={inputClass}
            />
            {errors.email ? (
              <p id="contact-email-error" className={errorClass}>
                {errors.email}
              </p>
            ) : null}
          </div>
        </div>

        <div>
          <label
            htmlFor="contact-subject"
            className="type-label mb-2 block text-sm text-white/80"
          >
            Subject <span className="text-white/40">*</span>
          </label>
          <input
            id="contact-subject"
            name="subject"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            aria-invalid={errors.subject ? true : undefined}
            aria-describedby={
              errors.subject ? "contact-subject-error" : undefined
            }
            placeholder="What is this about?"
            className={inputClass}
          />
          {errors.subject ? (
            <p id="contact-subject-error" className={errorClass}>
              {errors.subject}
            </p>
          ) : null}
        </div>

        <div>
          <label
            htmlFor="contact-message"
            className="type-label mb-2 block text-sm text-white/80"
          >
            Message <span className="text-white/40">*</span>
          </label>
          <textarea
            id="contact-message"
            name="message"
            rows={6}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            aria-invalid={errors.message ? true : undefined}
            aria-describedby={
              errors.message ? "contact-message-error" : undefined
            }
            placeholder="Tell us what's on your mind…"
            className={`${inputClass} resize-y`}
          />
          {errors.message ? (
            <p id="contact-message-error" className={errorClass}>
              {errors.message}
            </p>
          ) : null}
        </div>

        <button
          type="submit"
          className="glass-btn glass-btn--bright type-label inline-flex items-center gap-2.5 rounded-full px-6 py-3 text-sm text-[#0b0b0f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/90"
        >
          <Send className="h-4 w-4" aria-hidden="true" />
          Compose Email
        </button>

        {/* How delivery actually works — stated up front, no pretending. */}
        <p className="text-xs leading-relaxed text-white/45">
          This form doesn&apos;t send messages directly — OFFAnime has no
          email delivery service configured yet. Submitting opens your own
          email app with the recipient, subject and message pre-filled, and
          you send it from there.
        </p>
      </form>

      {/* Post-submit state: honest about what did (and didn't) happen. */}
      <div aria-live="polite">
        {status === "composed" ? (
          <div className="mt-6 rounded-2xl border border-white/15 bg-white/[0.04] p-5 backdrop-blur-md">
            <p className="type-label text-sm text-white">
              Your email app should now be open with everything pre-filled.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-white/60">
              Press send there to deliver your message — nothing is sent by
              this website itself. If no app opened, your browser or device
              may be blocking mail links:
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <a
                href={composedMailto}
                className="glass-btn type-label inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-xs text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/90"
              >
                <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                Open your email app again
              </a>
              <a
                href={`mailto:${SITE_EMAIL}`}
                className="text-xs font-semibold text-white/70 underline decoration-white/30 underline-offset-4 transition-colors hover:text-white hover:decoration-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/90"
              >
                or write to {SITE_EMAIL} directly
              </a>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
