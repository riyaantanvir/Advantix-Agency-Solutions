import { SEO } from "@/components/SEO";
import { motion } from "framer-motion";
import { Shield, Eye, Lock, Share2, Database, Mail, RefreshCw, ChevronRight } from "lucide-react";

const sections = [
  {
    icon: Eye,
    title: "Information We Collect",
    content: [
      {
        subtitle: "Information You Provide",
        items: [
          "Name, email address, phone number, and message when you submit our contact form or request a service.",
          "Account credentials (username and password) when you register for our Tools platform.",
          "Business information such as company name, website URL, and service requirements.",
          "Payment details — processed securely through third-party payment gateways; we do not store card numbers.",
        ],
      },
      {
        subtitle: "Information Collected Automatically",
        items: [
          "IP address, browser type, operating system, and device information when you visit our website.",
          "Pages visited, time spent, and clickstream data via analytics tools (e.g., Google Analytics).",
          "Cookies and similar tracking technologies to enhance user experience and remember preferences.",
          "Usage data from our Tools platform (URL shortener, Facebook auto-reply, AI assistant, social media scheduler).",
        ],
      },
      {
        subtitle: "Third-Party Integrations",
        items: [
          "When you connect a Facebook Page through our Facebook Auto-Reply tool, we store your Facebook access token and page data securely to enable automated messaging.",
          "When you use our AI Assistant or Social Media tools, queries may be processed through third-party AI providers (OpenAI, Anthropic, or Google) under their respective privacy policies.",
          "When you use our Social Media Management service, we may access your social media accounts solely to manage and schedule content on your behalf.",
        ],
      },
    ],
  },
  {
    icon: Database,
    title: "How We Use Your Information",
    content: [
      {
        subtitle: "Service Delivery",
        items: [
          "To provide, operate, and maintain our services including website development, CRM integration, Facebook marketing, social media management, graphics & branding, Python bot automation, ecommerce solutions, virtual assistant services, data entry, and lead generation.",
          "To set up and manage your account on our Tools platform.",
          "To process and respond to your service inquiries and project requests.",
          "To send project updates, delivery confirmations, and invoices related to your orders.",
        ],
      },
      {
        subtitle: "Platform Operations",
        items: [
          "To operate the Facebook Auto-Reply tool and send automated responses on your behalf to your page visitors.",
          "To generate shortened URLs and track click analytics through our URL Shortener tool.",
          "To schedule and publish social media posts through our Social Media Scheduler.",
          "To power AI-assisted features within our Tools platform.",
        ],
      },
      {
        subtitle: "Improvement & Communication",
        items: [
          "To analyze usage patterns and improve our website, tools, and services.",
          "To send occasional service announcements and important updates (you can opt out anytime).",
          "To detect and prevent fraudulent activity or misuse of our platform.",
          "To comply with legal obligations and resolve disputes.",
        ],
      },
    ],
  },
  {
    icon: Share2,
    title: "Information Sharing & Disclosure",
    content: [
      {
        subtitle: "We Do Not Sell Your Data",
        items: [
          "Advantix Digital does not sell, rent, or trade your personal information to third parties for marketing purposes.",
        ],
      },
      {
        subtitle: "When We May Share Data",
        items: [
          "With trusted service providers who assist in operating our platform (e.g., cloud hosting, email delivery, payment processors) under strict confidentiality agreements.",
          "With AI service providers (OpenAI, Anthropic, Google) solely to process your requests through our AI tools — they do not retain your data for training purposes.",
          "With Facebook's API when you use our Facebook Auto-Reply tool, governed by Facebook's Data Policy.",
          "When required by law, court order, or government authority.",
          "In the event of a merger or acquisition, with notice provided to affected users.",
        ],
      },
    ],
  },
  {
    icon: Lock,
    title: "Data Security",
    content: [
      {
        subtitle: "Security Measures",
        items: [
          "All data is transmitted over HTTPS with TLS encryption.",
          "Passwords are hashed using industry-standard bcrypt algorithms — we never store plain-text passwords.",
          "Facebook access tokens and sensitive API credentials are stored in encrypted form in our database.",
          "We regularly review and update our security practices.",
          "Access to user data is restricted to authorized team members on a need-to-know basis.",
        ],
      },
      {
        subtitle: "Data Retention",
        items: [
          "We retain your account data for as long as your account is active or as needed to provide services.",
          "Deleted accounts are purged from our systems within 30 days, except where retention is required by law.",
          "Facebook messages and auto-reply logs are retained for up to 90 days to support your account history.",
          "Analytics data is retained in aggregated, anonymized form indefinitely.",
        ],
      },
    ],
  },
  {
    icon: Shield,
    title: "Your Rights & Choices",
    content: [
      {
        subtitle: "Your Rights",
        items: [
          "Access: You may request a copy of the personal data we hold about you.",
          "Correction: You may request correction of inaccurate or incomplete data.",
          "Deletion: You may request deletion of your account and associated data.",
          "Portability: You may request your data in a portable format.",
          "Objection: You may object to certain types of data processing.",
          "Withdraw Consent: Where processing is based on consent, you may withdraw it at any time.",
        ],
      },
      {
        subtitle: "Cookies & Tracking",
        items: [
          "You can control cookie preferences through your browser settings.",
          "You can opt out of Google Analytics tracking by using the Google Analytics Opt-out Browser Add-on.",
          "Disabling cookies may affect certain functionality of our website and tools.",
        ],
      },
    ],
  },
  {
    icon: RefreshCw,
    title: "Changes to This Policy",
    content: [
      {
        subtitle: "",
        items: [
          "We may update this Privacy Policy from time to time to reflect changes in our services or legal requirements.",
          "Significant changes will be notified via email or a prominent notice on our website.",
          "Continued use of our services after changes take effect constitutes your acceptance of the updated policy.",
          "We encourage you to review this page periodically.",
        ],
      },
    ],
  },
];

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background pt-28 pb-24">
      <SEO
        title="Privacy Policy — Advantix Digital"
        description="Learn how Advantix Digital collects, uses, and protects your personal information across our services and tools including Facebook Auto-Reply, Social Media Management, and more."
        canonical="/privacy-policy"
      />

      {/* Hero */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-14"
        >
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-6">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            Privacy Policy
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            At Advantix Digital, your privacy matters. This policy explains what information we collect,
            how we use it, and how we protect it.
          </p>
        </motion.div>

        {/* Applies To Banner */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="bg-primary/5 border border-primary/20 rounded-2xl p-5 mb-12"
        >
          <p className="text-sm text-center text-muted-foreground">
            This Privacy Policy applies to{" "}
            <span className="text-foreground font-semibold">advantix.digital</span>{" "}
            and all associated services, tools, and platforms operated by{" "}
            <span className="text-foreground font-semibold">Advantix Digital</span>,
            including our Facebook Auto-Reply tool, Social Media Scheduler, AI Assistant,
            URL Shortener, and all client services.
          </p>
        </motion.div>

        {/* Sections */}
        <div className="space-y-10">
          {sections.map((section, si) => (
            <motion.div
              key={si}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.45, delay: si * 0.04 }}
              className="border border-border/50 rounded-2xl overflow-hidden"
            >
              {/* Section Header */}
              <div className="flex items-center gap-3 px-6 py-5 bg-muted/30 border-b border-border/40">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <section.icon className="w-4 h-4 text-primary" />
                </div>
                <h2 className="text-lg font-semibold">{section.title}</h2>
              </div>

              {/* Section Body */}
              <div className="px-6 py-6 space-y-6">
                {section.content.map((block, bi) => (
                  <div key={bi}>
                    {block.subtitle && (
                      <h3 className="text-sm font-semibold text-foreground mb-3">
                        {block.subtitle}
                      </h3>
                    )}
                    <ul className="space-y-2">
                      {block.items.map((item, ii) => (
                        <li key={ii} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                          <ChevronRight className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Contact */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45 }}
          className="mt-10 border border-border/50 rounded-2xl p-6 sm:p-8 text-center"
        >
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 mb-4">
            <Mail className="w-5 h-5 text-primary" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Questions or Requests?</h2>
          <p className="text-muted-foreground text-sm max-w-lg mx-auto mb-5">
            If you have any questions about this Privacy Policy, wish to exercise your data rights,
            or need to report a privacy concern, please contact us.
          </p>
          <div className="space-y-1 text-sm">
            <p>
              <span className="text-muted-foreground">Company: </span>
              <span className="font-medium">Advantix Digital</span>
            </p>
            <p>
              <span className="text-muted-foreground">Website: </span>
              <a href="https://advantix.digital" className="text-primary hover:underline font-medium">
                advantix.digital
              </a>
            </p>
            <p>
              <span className="text-muted-foreground">Email: </span>
              <a href="mailto:hello@advantix.digital" className="text-primary hover:underline font-medium">
                hello@advantix.digital
              </a>
            </p>
          </div>
        </motion.div>

        {/* Footer note */}
        <p className="text-center text-xs text-muted-foreground mt-8">
          © {new Date().getFullYear()} Advantix Digital. All rights reserved.
        </p>
      </div>
    </div>
  );
}
