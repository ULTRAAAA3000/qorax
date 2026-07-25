import { createClient } from "@/app/lib/supabase/server";
import { MarketingHeader } from "@/app/components/MarketingHeader";
import { SiteFooterExpanded } from "@/app/components/SiteFooterExpanded";
import { LegalPageLayout } from "@/app/components/LegalPageLayout";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://qorax.mrcru96.workers.dev";

export const metadata = {
  title: "Privacy Policy — Qorax",
  alternates: {
    canonical: `${SITE_URL}/en/privacy`,
    languages: {
      uk: `${SITE_URL}/privacy`,
      en: `${SITE_URL}/en/privacy`,
      "x-default": `${SITE_URL}/privacy`,
    },
  },
};

export default async function PrivacyPageEn() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <main className="flex flex-col min-h-screen" style={{ background: "var(--bg)" }}>
      <MarketingHeader isLoggedIn={!!user} activePath="/privacy" lang="en" />

      <LegalPageLayout title="Privacy Policy" lastUpdated="July 5, 2026" lang="en">
        <div>
          <p>
            This Privacy Policy describes what data Qorax (&ldquo;we,&rdquo; &ldquo;the
            service&rdquo;) collects while you use the website-monitoring platform, how we use,
            store, and protect it, and your rights regarding that data.
          </p>
          <p>
            By using Qorax, you agree to the collection and processing of data described below.
            If you have questions, write to{" "}
            <a href="mailto:wysbweb@gmail.com">wysbweb@gmail.com</a>.
          </p>
        </div>

        <div>
          <h2>1. What data we collect</h2>

          <h3>1.1. Account data</h3>
          <ul>
            <li>Email address and password (the password is stored encrypted — we never see it in plain text)</li>
            <li>Name (optional, at registration)</li>
            <li>Interface language</li>
          </ul>

          <h3>1.2. Data about the sites you monitor</h3>
          <ul>
            <li>URLs of the sites you add for monitoring</li>
            <li>The public content of those pages — titles, meta tags, text, links, forms — which we analyze to check uptime, speed, SEO, and to generate AI recommendations</li>
            <li>Snapshots (screenshots/hashes) of competitor pages, if you enable the competitor-monitoring feature</li>
          </ul>
          <p>
            We only process publicly available page content — the same content any visitor or
            search-engine crawler would see. We never access admin panels, databases, or internal
            systems of your sites.
          </p>

          <h3>1.3. Notification data</h3>
          <ul>
            <li>Email addresses for alerts</li>
            <li>Telegram chat ID, if you connect notifications through the Telegram bot</li>
          </ul>

          <h3>1.4. Google Search Console data (optional)</h3>
          <p>
            If you connect your Google Search Console account, we receive an OAuth access token
            (stored encrypted — AES-256) and your site&apos;s search-traffic data via the Search
            Console API. You can disconnect this integration at any time in settings — the token
            is deleted.
          </p>

          <h3>1.5. Payment data</h3>
          <p>
            Subscription payments are processed by LemonSqueezy, an independent merchant of
            record. Your card data never reaches our servers — it is processed directly by
            LemonSqueezy under their own{" "}
            <a href="https://www.lemonsqueezy.com/privacy" target="_blank" rel="noopener noreferrer">
              privacy policy
            </a>
            . We only receive the subscription status, customer ID, and plan from LemonSqueezy.
          </p>

          <h3>1.6. Technical data</h3>
          <ul>
            <li>IP address — temporarily, solely to protect the free audit tool from abuse (rate limiting); automatically deleted within a few minutes</li>
            <li>Date and time of requests to our API — for diagnostics and security</li>
          </ul>
          <p>
            Qorax does not use advertising cookies, does not install third-party trackers (Google
            Analytics, Meta Pixel, etc.), and does not sell user data to advertisers.
          </p>
        </div>

        <div>
          <h2>2. How we use the data</h2>
          <ul>
            <li>Providing monitoring features — checking uptime, speed, SSL certificates, and SEO metrics for your sites</li>
            <li>Generating AI recommendations for improving a site via the Google Gemini API (see section 3)</li>
            <li>Sending incident notifications via email/Telegram</li>
            <li>Processing subscription payments and granting access to your plan&apos;s features</li>
            <li>Technical support and responding to inquiries</li>
            <li>Protecting the service from abuse (rate limiting, spam detection)</li>
          </ul>
        </div>

        <div>
          <h2>3. Third parties that process data</h2>
          <p>To run Qorax, we use the following services:</p>
          <ul>
            <li><strong>Supabase</strong> — database and user authentication</li>
            <li><strong>Cloudflare</strong> — backend hosting (Workers), temporary data storage for abuse protection (KV), storage of uploaded agency logos</li>
            <li><strong>LemonSqueezy</strong> — payment processing (Merchant of Record)</li>
            <li><strong>Resend</strong> — sending email notifications</li>
            <li><strong>Telegram</strong> — sending notifications via the bot (only if you connect this feature yourself)</li>
            <li><strong>Google</strong> — Gemini API for generating AI recommendations, PageSpeed Insights API for speed analysis, Search Console API (only if you connect this integration)</li>
          </ul>
          <p>
            When we send your site&apos;s content to Google Gemini for AI analysis, we only pass
            technical information about the page (titles, meta tags, structure) needed to
            generate recommendations. This data is processed under the{" "}
            <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noopener noreferrer">
              Google Gemini API Terms of Service
            </a>{" "}
            and is not used by Google to train models under the commercial API.
          </p>
        </div>

        <div>
          <h2>4. How long we retain data</h2>
          <ul>
            <li>Account data and monitoring history — for as long as your account is active</li>
            <li>Check history (uptime, speed) — kept to build charts and reports; older detailed records may be aggregated over time</li>
            <li>IP addresses used for rate limiting — automatically deleted within a few minutes</li>
            <li>Google Search Console OAuth tokens — until you disconnect the integration</li>
          </ul>
          <p>
            When you delete your account, we remove your personal data and your sites&apos; data from
            our primary systems. Backups may be retained for a limited time for disaster-recovery
            purposes, after which they are also deleted.
          </p>
        </div>

        <div>
          <h2>5. Your rights</h2>
          <p>You have the right to:</p>
          <ul>
            <li>Receive a copy of the data we hold about you</li>
            <li>Correct inaccurate data in your account settings</li>
            <li>Delete your account and associated data</li>
            <li>Withdraw consent to processing (for example, disconnect the Telegram or Google Search Console integration)</li>
            <li>Object to or restrict processing</li>
          </ul>
          <p>
            To exercise any of these rights, write to{" "}
            <a href="mailto:wysbweb@gmail.com">wysbweb@gmail.com</a>. We respond to requests
            within a reasonable time, usually within 30 days.
          </p>
        </div>

        <div>
          <h2>6. Security</h2>
          <p>
            We apply technical safeguards: password encryption, OAuth token encryption (AES-256),
            database access restricted by row-level security policies (each user sees only their
            own organization&apos;s data), and data transfer exclusively over HTTPS. Even so, no method
            of transmitting data over the internet is completely secure — we cannot guarantee
            absolute security, but we continuously work to improve it.
          </p>
        </div>

        <div>
          <h2>7. Children</h2>
          <p>
            Qorax is a B2B/B2C service intended for business owners, agencies, and freelancers.
            We do not knowingly collect data from anyone under the age of 18.
          </p>
        </div>

        <div>
          <h2>8. Changes to this policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify you of material
            changes by email or an in-service notification. The date of the last update is shown
            at the top of this page.
          </p>
        </div>

        <div>
          <h2>9. Contact</h2>
          <p>
            For any questions about this Privacy Policy or the processing of your data, contact
            us:
          </p>
          <ul>
            <li>Email: <a href="mailto:wysbweb@gmail.com">wysbweb@gmail.com</a></li>
            <li>Telegram: +380999276155</li>
          </ul>
        </div>
      </LegalPageLayout>

      <SiteFooterExpanded lang="en" />
    </main>
  );
}
