import type { Metadata } from "next";
import { Navbar } from "@/components/marketing/Navbar";
import { Footer } from "@/components/marketing/Footer";

export const metadata: Metadata = {
  title: "Privacy Policy | Data Protection & Security",
  description:
    "Learn how 2Hands collects, uses, and protects your personal information. We use AES-256 encryption and follow strict data protection standards.",
  alternates: {
    canonical: "https://2hands.ai/privacy",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function PrivacyPage() {
  return (
    <div className="marketing-page">
      <Navbar />
      <main className="flex flex-col flex-grow">
        <section className="relative flex flex-col bg-stone-50 dark:bg-[#1A1918]">
          <div className="relative h-[97.5714px] md:h-[123.429px]"></div>
          <div className="max-w-[1440px] w-[calc(100%_-_67.1429px)] md:w-[calc(100%_-_118.857px)] mx-auto">
            <div className="max-w-3xl">
              <h1 className="font-display font-medium text-neutral-900 dark:text-[#F5F3F0] text-[37.375px] leading-[1.1] md:text-[48px] mb-4">
                Privacy Policy
              </h1>

              <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6 text-zinc-500 dark:text-[#9E9C99]">
                <p className="text-[15px] leading-relaxed">
                  <strong className="text-neutral-900 dark:text-[#F5F3F0]">Last updated:</strong> January 25, 2026
                </p>

                <section className="space-y-4">
                  <h2 className="text-lg font-medium text-neutral-900 dark:text-[#F5F3F0]">1. Information We Collect</h2>
                  <p className="text-[15px] leading-relaxed">We collect information you provide directly, including your name, email address, and payment information. We also collect usage data about how you interact with our AI agents and services.</p>
                </section>

                <section className="space-y-4">
                  <h2 className="text-lg font-medium text-neutral-900 dark:text-[#F5F3F0]">2. How We Use Your Information</h2>
                  <p className="text-[15px] leading-relaxed">We use your information to provide and improve our services, process payments, communicate with you, and ensure the security of our platform. We may also use aggregated, anonymized data for research and development.</p>
                </section>

                <section className="space-y-4">
                  <h2 className="text-lg font-medium text-neutral-900 dark:text-[#F5F3F0]">3. Data Storage and Security</h2>
                  <p className="text-[15px] leading-relaxed">Your data is stored securely using industry-standard encryption (AES-256-GCM). We implement appropriate technical and organizational measures to protect your personal information against unauthorized access, alteration, or destruction.</p>
                </section>

                <section className="space-y-4">
                  <h2 className="text-lg font-medium text-neutral-900 dark:text-[#F5F3F0]">4. AI Agent Data Processing</h2>
                  <p className="text-[15px] leading-relaxed">When you use our AI agents, they may access and process data on your behalf. We do not store screenshots or sensitive data beyond what is necessary to complete your requested tasks. Agent activity logs are retained for 30 days for debugging purposes.</p>
                </section>

                <section className="space-y-4">
                  <h2 className="text-lg font-medium text-neutral-900 dark:text-[#F5F3F0]">5. Third-Party Services</h2>
                  <p className="text-[15px] leading-relaxed">We use third-party services for payment processing (Stripe), authentication (Supabase), and AI capabilities (Anthropic). These services have their own privacy policies governing their use of your data.</p>
                </section>

                <section className="space-y-4">
                  <h2 className="text-lg font-medium text-neutral-900 dark:text-[#F5F3F0]">6. Cookies and Tracking</h2>
                  <p className="text-[15px] leading-relaxed">We use essential cookies to maintain your session and preferences. We do not use third-party advertising cookies. You can control cookie settings through your browser.</p>
                </section>

                <section className="space-y-4">
                  <h2 className="text-lg font-medium text-neutral-900 dark:text-[#F5F3F0]">7. Your Rights</h2>
                  <p className="text-[15px] leading-relaxed">You have the right to access, correct, or delete your personal data. You can export your data or request account deletion at any time through your account settings or by contacting us.</p>
                </section>

                <section className="space-y-4">
                  <h2 className="text-lg font-medium text-neutral-900 dark:text-[#F5F3F0]">8. Data Retention</h2>
                  <p className="text-[15px] leading-relaxed">We retain your account data for as long as your account is active. Upon account deletion, we will delete your personal data within 30 days, except where retention is required by law.</p>
                </section>

                <section className="space-y-4">
                  <h2 className="text-lg font-medium text-neutral-900 dark:text-[#F5F3F0]">9. Changes to This Policy</h2>
                  <p className="text-[15px] leading-relaxed">We may update this Privacy Policy from time to time. We will notify you of any material changes via email or through the service.</p>
                </section>

                <section className="space-y-4">
                  <h2 className="text-lg font-medium text-neutral-900 dark:text-[#F5F3F0]">10. Contact</h2>
                  <p className="text-[15px] leading-relaxed">If you have any questions about this Privacy Policy, please contact us at <a href="mailto:privacy@2hands.ai" className="text-neutral-900 dark:text-[#F5F3F0] hover:underline">privacy@2hands.ai</a>.</p>
                </section>
              </div>
            </div>
          </div>
          <div className="relative h-[97.5714px] md:h-[123.429px]"></div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
