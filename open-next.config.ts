// open-next.config.ts — adapts the Next.js App Router build for Cloudflare Workers.
// See https://opennext.js.org/cloudflare
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  // Incremental cache is intentionally left unconfigured here so the app can
  // be deployed without provisioning an R2 bucket. Enable it later via the
  // r2IncrementalCache override if cache-heavy ISR behaviour is required.
});
