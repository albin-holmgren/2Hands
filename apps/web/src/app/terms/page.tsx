import type { Metadata } from "next";
import { Navbar } from "@/components/marketing/Navbar";
import { Footer } from "@/components/marketing/Footer";

export const metadata: Metadata = {
  title: "Terms of Service | User Agreement",
  description:
    "Read the terms and conditions for using 2Hands AI agent management platform. Learn about acceptable use, billing, and your rights as a user.",
  alternates: {
    canonical: "https://2hands.ai/terms",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function TermsPage() {
  return (
    <div className="marketing-page">
      <Navbar />
      <main className="flex flex-col flex-grow">
        <section className="relative flex flex-col bg-stone-50 dark:bg-[#1A1918]">
          <div className="relative h-[97.5714px] md:h-[123.429px]"></div>
          <div className="max-w-[1440px] w-[calc(100%_-_67.1429px)] md:w-[calc(100%_-_118.857px)] mx-auto">
            <div className="max-w-3xl">
              <h1 className="font-display font-medium text-neutral-900 dark:text-[#F5F3F0] text-[37.375px] leading-[1.1] md:text-[48px] mb-4">
                Terms of Service
              </h1>

              <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6 text-zinc-500 dark:text-[#9E9C99]">
                <p className="text-[15px] leading-relaxed">
                  <strong className="text-neutral-900 dark:text-[#F5F3F0]">Last updated:</strong> January 25, 2026
                </p>

                <section className="space-y-4">
                  <h2 className="text-lg font-medium text-neutral-900 dark:text-[#F5F3F0]">1. Acceptance of Terms</h2>
                  <p className="text-[15px] leading-relaxed">By accessing or using 2Hands&apos; services, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our services.</p>
                </section>

                <section className="space-y-4">
                  <h2 className="text-lg font-medium text-neutral-900 dark:text-[#F5F3F0]">2. Description of Service</h2>
                  <p className="text-[15px] leading-relaxed">2Hands provides an AI-powered automation platform that allows users to create and manage AI agents capable of performing computer-based tasks. Our services include but are not limited to task automation, scheduling, and AI-assisted workflows.</p>
                </section>

                <section className="space-y-4">
                  <h2 className="text-lg font-medium text-neutral-900 dark:text-[#F5F3F0]">3. User Accounts</h2>
                  <p className="text-[15px] leading-relaxed">You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You must notify us immediately of any unauthorized use of your account.</p>
                </section>

                <section className="space-y-4">
                  <h2 className="text-lg font-medium text-neutral-900 dark:text-[#F5F3F0]">4. Acceptable Use</h2>
                  <p className="text-[15px] leading-relaxed">You agree not to use 2Hands for any unlawful purposes or in any way that could damage, disable, or impair our services. You may not use our AI agents to perform actions that violate any applicable laws or third-party rights.</p>
                </section>

                <section className="space-y-4">
                  <h2 className="text-lg font-medium text-neutral-900 dark:text-[#F5F3F0]">5. Payment and Billing</h2>
                  <p className="text-[15px] leading-relaxed">Paid services are billed in advance on a subscription basis. You agree to pay all fees associated with your selected plan. Subscription fees are non-refundable except as required by law.</p>
                </section>

                <section className="space-y-4">
                  <h2 className="text-lg font-medium text-neutral-900 dark:text-[#F5F3F0]">6. Intellectual Property</h2>
                  <p className="text-[15px] leading-relaxed">2Hands and its licensors retain all rights to the service, including all intellectual property rights. You retain ownership of any content you create using our services.</p>
                </section>

                <section className="space-y-4">
                  <h2 className="text-lg font-medium text-neutral-900 dark:text-[#F5F3F0]">7. Limitation of Liability</h2>
                  <p className="text-[15px] leading-relaxed">To the maximum extent permitted by law, 2Hands shall not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use of or inability to use the service.</p>
                </section>

                <section className="space-y-4">
                  <h2 className="text-lg font-medium text-neutral-900 dark:text-[#F5F3F0]">8. Changes to Terms</h2>
                  <p className="text-[15px] leading-relaxed">We reserve the right to modify these terms at any time. We will notify users of any material changes via email or through the service. Continued use of the service after changes constitutes acceptance of the new terms.</p>
                </section>

                <section className="space-y-4">
                  <h2 className="text-lg font-medium text-neutral-900 dark:text-[#F5F3F0]">9. Contact</h2>
                  <p className="text-[15px] leading-relaxed">If you have any questions about these Terms, please contact us at <a href="mailto:legal@2hands.ai" className="text-neutral-900 dark:text-[#F5F3F0] hover:underline">legal@2hands.ai</a>.</p>
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
