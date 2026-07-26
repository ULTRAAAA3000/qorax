import { createClient } from "@/app/lib/supabase/server";
import { MarketingHeader } from "@/app/components/MarketingHeader";
import { SiteFooterExpanded } from "@/app/components/SiteFooterExpanded";
import { LegalPageLayout } from "@/app/components/LegalPageLayout";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://qorax.mrcru96.workers.dev";

export const metadata = {
  title: "Terms of Service — Qorax",
  alternates: {
    canonical: `${SITE_URL}/en/terms`,
    languages: {
      uk: `${SITE_URL}/terms`,
      en: `${SITE_URL}/en/terms`,
      "x-default": `${SITE_URL}/terms`,
    },
  },
};

export default async function TermsPageEn() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <main className="flex flex-col min-h-screen" style={{ background: "var(--bg)" }}>
      <MarketingHeader isLoggedIn={!!user} activePath="/terms" lang="en" />

      <LegalPageLayout title="Terms of Service" lastUpdated="July 5, 2026" lang="en">
        <div>
          <p>
            These Terms of Service govern access to and use of the Qorax service. By registering
            for or continuing to use Qorax, you agree to these terms. If you do not agree,
            please do not use the service.
          </p>
        </div>

        <div>
          <h2>1. Description of the service</h2>
          <p>
            Qorax is a website monitoring service: uptime checks, load-speed monitoring, SSL
            certificate validity checks, a basic SEO audit, broken-link detection, and AI
            recommendations for improving your site. The service is provided on a subscription
            basis, with a free tier and free audit tools that require no registration.
          </p>
        </div>

        <div>
          <h2>2. Account</h2>
          <ul>
            <li>Using paid features requires registration with a valid email address</li>
            <li>You are responsible for keeping your password confidential and for all activity that occurs under your account</li>
            <li>You must notify us immediately if you suspect unauthorized access to your account</li>
            <li>One account is intended for one person or organization; sharing access with third parties without using the team-invite feature is not allowed</li>
          </ul>
        </div>

        <div>
          <h2>3. Permitted use</h2>
          <p>By adding a site for monitoring, you confirm that:</p>
          <ul>
            <li>You are the owner of the site, an authorized representative of the owner, or otherwise have permission to monitor it (for example, as a contracted agency)</li>
            <li>Monitoring the site does not violate that site&apos;s hosting terms of service or applicable law</li>
          </ul>
          <p>You may not use Qorax to:</p>
          <ul>
            <li>Monitor sites you do not have the right or permission of the owner to access</li>
            <li>Attempt to bypass a third-party site&apos;s technical protections (WAF, rate limiting, CAPTCHA, etc.)</li>
            <li>Overload someone else&apos;s servers with excessive requests (abuse of the competitor-monitoring feature)</li>
            <li>Engage in any unlawful activity</li>
          </ul>
          <p>
            We reserve the right to suspend or close an account in the event of a violation of
            these terms.
          </p>
        </div>

        <div>
          <h2>4. Pricing and payment</h2>
          <ul>
            <li>Current plans and prices are listed on the <a href="/en/pricing">Pricing</a> page</li>
            <li>Subscription payments are processed by LemonSqueezy; by making a payment, you also agree to LemonSqueezy&apos;s terms as the merchant of record for the transaction</li>
            <li>Subscriptions renew automatically each month until cancelled</li>
            <li>You can cancel your subscription at any time in settings — access to paid features continues until the end of the period already paid for</li>
            <li>Prices may change; we will notify existing subscribers of a price increase in advance</li>
            <li>Refunds are considered on a case-by-case basis upon request to <a href="mailto:wysbweb@gmail.com">wysbweb@gmail.com</a></li>
          </ul>
        </div>

        <div>
          <h2>5. Fix requests (studio services)</h2>
          <p>
            The &ldquo;Request a fix&rdquo; feature lets you submit a request to have an issue
            resolved by the Qorax studio. This is not an automated service or a contractor
            marketplace — requests are handled manually. The number of free requests per month
            is limited by your plan; additional requests and the cost of work beyond that limit
            are agreed individually before work begins. We do not guarantee a specific turnaround
            time and reserve the right to decline a request (for example, if the site is built on
            a platform we cannot technically work with).
          </p>
        </div>

        <div>
          <h2>6. AI recommendations</h2>
          <p>
            Recommendations generated by artificial intelligence (Qoraxus, AI Insights, revenue-
            loss estimates) are approximate and based on automated analysis of publicly available
            page data. They do not constitute professional advice (legal, financial, or
            accounting) and do not guarantee the accuracy of estimated lost revenue — these are
            approximate calculations meant to illustrate the significance of an issue, not a
            financial audit.
          </p>
        </div>

        <div>
          <h2>7. Service availability</h2>
          <p>
            We aim for high availability of Qorax but do not guarantee uninterrupted operation
            100% of the time. Technical maintenance, third-party outages (Cloudflare, Supabase,
            and other infrastructure providers), or other circumstances beyond our control may
            occur. We are not liable for damages caused by temporary unavailability of the
            service, including missed alerts about incidents on your sites.
          </p>
        </div>

        <div>
          <h2>8. Limitation of liability</h2>
          <p>
            Qorax is provided &ldquo;as is,&rdquo; without warranties of any kind, express or
            implied. Qorax&apos;s maximum liability for any claim related to use of the service is
            limited to the amount you paid for your subscription over the preceding 3 months. We
            are not liable for indirect, incidental, or consequential damages, including lost
            profit or data, arising from use or inability to use the service.
          </p>
        </div>

        <div>
          <h2>9. Intellectual property</h2>
          <p>
            All code, design, the logo, the Qorax name, and other elements of the service are the
            property of Qorax. You retain all rights to your own site data that you upload or
            provide to us for monitoring. White-label clients (Agency plan) receive a limited
            license to use their own branding on reports generated by the service, without the
            right to resell Qorax&apos;s own code or infrastructure as a separate product.
          </p>
        </div>

        <div>
          <h2>10. Changes to these terms</h2>
          <p>
            We may update these Terms of Service. We will notify you of material changes by email
            or an in-service notification at least 14 days before they take effect. Continued use
            of the service after changes take effect constitutes acceptance of them.
          </p>
        </div>

        <div>
          <h2>11. Termination</h2>
          <p>
            You may stop using Qorax and delete your account at any time in settings. We may
            suspend or close your account in the event of a violation of these Terms, non-payment
            of a subscription, or abuse of the service, usually with advance notice, except in
            cases of serious violation (for example, using the service for unlawful activity).
          </p>
        </div>

        <div>
          <h2>12. Governing law</h2>
          <p>
            These Terms are governed by the laws of Ukraine. Disputes are resolved through
            negotiation and, failing that, in the manner prescribed by Ukrainian law.
          </p>
        </div>

        <div>
          <h2>13. Contact</h2>
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
