import { SEO } from "@/components/SEO";
import { motion } from "framer-motion";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useState, useEffect } from "react";
import { useCreateContact } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Mail, MapPin, Phone, ArrowRight, CheckCircle2, MessageSquare, Banknote, Briefcase } from "lucide-react";

const budgetRanges = [
  "< $500",
  "$500 – $1,000",
  "$1,000 – $2,500",
  "$2,500 – $5,000",
  "$5,000 – $10,000",
  "$10,000+",
  "Not sure yet",
];

const services = [
  { value: "Website Development", label: "Website Development" },
  { value: "Facebook Marketing", label: "Facebook Marketing" },
  { value: "Social Media Management", label: "Social Media Management" },
  { value: "Graphics & Branding", label: "Graphics & Branding" },
  { value: "Python Bot Automation", label: "Python Bot Automation" },
  { value: "CRM Integration", label: "CRM Integration" },
  { value: "Ecommerce Solutions", label: "Ecommerce Solutions" },
  { value: "Sales Page Design", label: "Sales Page Design" },
  { value: "Virtual Assistant", label: "Virtual Assistant" },
  { value: "Lead Generation", label: "Lead Generation" },
  { value: "Data Entry", label: "Data Entry" },
  { value: "Team Management", label: "Team Management" },
  { value: "Other", label: "Other" },
];

type ServiceDetails = Record<string, string>;

const serviceQuestions: Record<string, { key: string; label: string; type: "text" | "select"; options?: string[] }[]> = {
  "Website Development": [
    { key: "websiteType", label: "Type of Website", type: "select", options: ["Portfolio / Personal", "Business / Corporate", "E-commerce", "Landing Page", "Blog", "Other"] },
    { key: "existingWebsite", label: "Do you have an existing website?", type: "select", options: ["Yes – needs a redesign", "Yes – needs minor updates", "No – starting from scratch"] },
    { key: "platform", label: "Preferred Platform", type: "select", options: ["WordPress", "Shopify", "Webflow", "Custom (React/Next.js)", "No preference"] },
    { key: "keyPages", label: "Key pages you need (e.g. Home, About, Blog)", type: "text" },
  ],
  "Facebook Marketing": [
    { key: "facebookPageUrl", label: "Facebook Page URL", type: "text" },
    { key: "campaignGoal", label: "Campaign Goal", type: "select", options: ["Generate Leads", "Drive Sales / Conversions", "Brand Awareness", "Website Traffic", "Page Likes / Followers"] },
    { key: "monthlyAdBudget", label: "Monthly Ad Spend Budget", type: "select", options: ["< $100", "$100 – $500", "$500 – $1,000", "$1,000 – $5,000", "$5,000+"] },
    { key: "targetAudience", label: "Target Audience (location, age, interests)", type: "text" },
  ],
  "Social Media Management": [
    { key: "platforms", label: "Platforms to Manage", type: "select", options: ["Instagram only", "Facebook only", "Instagram + Facebook", "TikTok", "Multiple platforms"] },
    { key: "postsPerWeek", label: "Posts Per Week", type: "select", options: ["1–2 posts", "3–5 posts", "Daily posting", "Not sure"] },
    { key: "contentCreation", label: "Content Creation Needed?", type: "select", options: ["Yes – design + captions", "Captions only", "I will provide content"] },
  ],
  "Graphics & Branding": [
    { key: "projectType", label: "Project Type", type: "select", options: ["Logo Design", "Full Brand Kit", "Social Media Graphics", "Flyer / Poster", "Business Card", "Banner / Ad Creative", "Other"] },
    { key: "hasBrandGuidelines", label: "Do you have existing brand guidelines?", type: "select", options: ["Yes – I will share them", "Partially", "No – starting fresh"] },
    { key: "colorPreference", label: "Color / Style Preference (optional)", type: "text" },
  ],
  "Python Bot Automation": [
    { key: "botType", label: "Bot / Automation Type", type: "select", options: ["Web Scraper", "Data Pipeline", "Telegram / WhatsApp Bot", "Email Automation", "Task Scheduler", "API Integration", "Other"] },
    { key: "targetPlatform", label: "Target Website or Platform", type: "text" },
    { key: "expectedVolume", label: "Expected Data Volume / Frequency", type: "text" },
  ],
  "CRM Integration": [
    { key: "currentCrm", label: "Current CRM (if any)", type: "select", options: ["HubSpot", "Salesforce", "Zoho", "Pipedrive", "GoHighLevel", "None – need setup", "Other"] },
    { key: "teamSize", label: "Number of CRM Users", type: "select", options: ["1–5", "6–20", "21–50", "50+"] },
    { key: "integrationNeeds", label: "Tools to Integrate (e.g. email, calendar, WhatsApp)", type: "text" },
  ],
  "Ecommerce Solutions": [
    { key: "productCount", label: "Approximate Number of Products", type: "select", options: ["1–20", "21–100", "101–500", "500+"] },
    { key: "platform", label: "Preferred Platform", type: "select", options: ["Shopify", "WooCommerce", "Wix eCommerce", "Custom", "No preference"] },
    { key: "paymentGateway", label: "Payment Gateway", type: "select", options: ["Stripe", "PayPal", "SSLCommerz (Bangladesh)", "bKash / Nagad", "Multiple / Not sure"] },
  ],
  "Sales Page Design": [
    { key: "offerType", label: "What is the offer or product?", type: "text" },
    { key: "targetAudience", label: "Target Audience", type: "text" },
    { key: "hasBrand", label: "Do you have brand assets (logo, colors)?", type: "select", options: ["Yes – ready to share", "Partially", "No"] },
  ],
  "Virtual Assistant": [
    { key: "tasks", label: "Tasks Needed (e.g. scheduling, research, data entry)", type: "text" },
    { key: "hoursPerWeek", label: "Hours Per Week", type: "select", options: ["< 5 hours", "5–10 hours", "10–20 hours", "20–40 hours", "Full-time (40+)"] },
    { key: "tools", label: "Tools / Platforms Used (e.g. Notion, Slack, Google Workspace)", type: "text" },
  ],
  "Lead Generation": [
    { key: "targetIndustry", label: "Target Industry", type: "text" },
    { key: "targetLocation", label: "Target Location / Country", type: "text" },
    { key: "channel", label: "Preferred Channel", type: "select", options: ["LinkedIn Outreach", "Email Campaigns", "Facebook Ads", "Cold Calling", "Multiple channels", "Not sure"] },
  ],
  "Data Entry": [
    { key: "dataSource", label: "Data Source Type", type: "select", options: ["Handwritten documents", "PDFs / Scanned files", "Website / Online", "Spreadsheets", "Other"] },
    { key: "volume", label: "Approximate Volume", type: "select", options: ["< 100 records", "100–500 records", "500–2,000 records", "2,000+ records"] },
    { key: "outputFormat", label: "Preferred Output Format", type: "select", options: ["Excel / Google Sheets", "CSV", "Word Document", "Database", "Other"] },
  ],
  "Team Management": [
    { key: "teamSize", label: "Current Team Size", type: "select", options: ["1–5", "6–15", "16–50", "50+"] },
    { key: "currentTools", label: "Current Tools Used", type: "text" },
    { key: "challenges", label: "Main Challenge / Pain Point", type: "text" },
  ],
};

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  phone: z.string().min(1, "Contact number is required"),
  whatsapp: z.string().optional(),
  service: z.string().min(1, "Please select a service"),
  budget: z.string().min(1, "Please select a budget range"),
  message: z.string().min(5, "Please describe your project"),
});

type FormValues = z.infer<typeof formSchema>;

export default function Contact() {
  const { toast } = useToast();
  const contactMutation = useCreateContact();
  const [sameAsPhone, setSameAsPhone] = useState(false);
  const [serviceDetails, setServiceDetails] = useState<ServiceDetails>({});
  const [submitted, setSubmitted] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", email: "", phone: "", whatsapp: "", service: "", budget: "", message: "" },
  });

  const selectedService = form.watch("service");
  const phoneValue = form.watch("phone");

  useEffect(() => {
    if (sameAsPhone) form.setValue("whatsapp", phoneValue);
  }, [sameAsPhone, phoneValue, form]);

  useEffect(() => {
    setServiceDetails({});
  }, [selectedService]);

  const questions = selectedService ? (serviceQuestions[selectedService] ?? []) : [];

  function onSubmit(values: FormValues) {
    const detailsJson = Object.keys(serviceDetails).length > 0 ? JSON.stringify(serviceDetails) : undefined;
    contactMutation.mutate(
      {
        data: {
          name: values.name,
          email: values.email,
          phone: values.phone,
          whatsapp: values.whatsapp ?? undefined,
          service: values.service,
          budget: values.budget,
          details: detailsJson,
          message: values.message,
        },
      },
      {
        onSuccess: () => {
          setSubmitted(true);
          form.reset();
          setServiceDetails({});
        },
        onError: () => {
          toast({ variant: "destructive", title: "Something went wrong.", description: "Please try again or email us directly." });
        },
      }
    );
  }

  const fieldClass = "bg-background/50 border-border h-12 text-foreground";

  if (submitted) {
    return (
      <div className="pt-32 pb-24 min-h-screen bg-background flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center max-w-md mx-auto px-6"
        >
          <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-green-500" />
          </div>
          <h2 className="text-3xl font-display font-bold mb-3">Quote Request Sent!</h2>
          <p className="text-muted-foreground mb-8">
            Thank you! We've received your request and will get back to you within 24 hours with a custom quote.
          </p>
          <Button onClick={() => setSubmitted(false)} variant="outline" className="rounded-xl">
            Submit Another Request
          </Button>
        </motion.div>
      </div>
    );
  }

  const contactStructuredData = {
    "@context": "https://schema.org",
    "@type": "ContactPage",
    "name": "Contact Advantix Digital",
    "url": "https://advantix.digital/contact",
    "description": "Get in touch with Advantix Digital for web development, marketing, and automation services.",
    "mainEntity": {
      "@type": "Organization",
      "name": "Advantix Digital",
      "url": "https://advantix.digital",
      "email": "hello@advantix.digital",
      "address": {
        "@type": "PostalAddress",
        "addressCountry": "BD",
        "addressLocality": "Bangladesh",
      },
    },
  };

  return (
    <div className="pt-28 pb-24 min-h-screen bg-background">
      <SEO
        title="Contact Us — Get a Free Quote from Advantix Digital"
        description="Ready to grow your business? Contact Advantix Digital for a free consultation. We offer web development, CRM, automation, and marketing services. Based in Bangladesh, working worldwide."
        keywords="contact advantix agency, hire digital agency bangladesh, web development quote, free consultation, hire web developer, digital marketing agency contact"
        canonical="/contact"
        structuredData={contactStructuredData}
      />
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12"
          >
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-4 py-1.5 text-sm font-semibold mb-4">
              <Briefcase className="w-4 h-4" /> Get a Free Quote
            </div>
            <h1 className="text-4xl md:text-5xl font-display font-bold mb-4">Let's Build Something Great</h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Tell us what you need and we'll send you a custom quote within 24 hours — no commitment required.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 bg-card rounded-3xl overflow-hidden border border-border/50 shadow-xl">

            {/* Sidebar */}
            <div className="col-span-1 lg:col-span-2 bg-secondary p-8 md:p-10 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-full opacity-10 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary to-transparent pointer-events-none" />
              <div className="relative z-10">
                <h3 className="text-2xl font-display font-bold mb-4">Contact Us</h3>
                <p className="text-muted-foreground mb-10 text-sm leading-relaxed">
                  Fill out the quote form and our team will prepare a custom proposal and get back to you within 24 hours.
                </p>
                <div className="space-y-7">
                  <div className="flex items-start gap-4 group">
                    <div className="w-11 h-11 rounded-full bg-background/50 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                      <Mail className="text-primary w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-0.5">Email Us</p>
                      <a href="mailto:hello@advantix.digital" className="text-base hover:text-primary transition-colors">hello@advantix.digital</a>
                    </div>
                  </div>
                  <div className="flex items-start gap-4 group">
                    <div className="w-11 h-11 rounded-full bg-background/50 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                      <Phone className="text-primary w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-0.5">Call / WhatsApp</p>
                      <a href="tel:+1234567890" className="text-base hover:text-primary transition-colors">+1 (234) 567-890</a>
                    </div>
                  </div>
                  <div className="flex items-start gap-4 group">
                    <div className="w-11 h-11 rounded-full bg-background/50 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                      <MessageSquare className="text-primary w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-0.5">Response Time</p>
                      <p className="text-base">Within 24 hours</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4 group">
                    <div className="w-11 h-11 rounded-full bg-background/50 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                      <MapPin className="text-primary w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-0.5">Location</p>
                      <p className="text-base">Global Remote Agency</p>
                    </div>
                  </div>
                </div>

                <div className="mt-12 p-5 bg-background/30 rounded-2xl border border-border/40">
                  <h4 className="font-display font-bold mb-3 text-sm">Services We Offer</h4>
                  <div className="flex flex-wrap gap-2">
                    {services.map(s => (
                      <span key={s.value} className="text-xs px-2.5 py-1 bg-background/50 rounded-lg text-muted-foreground border border-border/40">
                        {s.label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Form */}
            <div className="col-span-1 lg:col-span-3 p-8 md:p-10">
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

                {/* Section: Contact Info */}
                <div>
                  <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-4">Your Contact Info</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold">Full Name *</label>
                      <Input placeholder="John Doe" className={fieldClass} {...form.register("name")} />
                      {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold">Email Address *</label>
                      <Input type="email" placeholder="john@example.com" className={fieldClass} {...form.register("email")} />
                      {form.formState.errors.email && <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold">Contact Number *</label>
                      <Input type="tel" placeholder="+1 (555) 000-0000" className={fieldClass} {...form.register("phone")} />
                      {form.formState.errors.phone && <p className="text-xs text-destructive">{form.formState.errors.phone.message}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold">WhatsApp Number</label>
                      <Input
                        type="tel"
                        placeholder={sameAsPhone ? phoneValue || "Same as contact" : "+1 (555) 000-0000"}
                        className={fieldClass}
                        disabled={sameAsPhone}
                        {...form.register("whatsapp")}
                      />
                      <label className="flex items-center gap-2 cursor-pointer mt-1 select-none">
                        <input
                          type="checkbox"
                          checked={sameAsPhone}
                          onChange={(e) => {
                            setSameAsPhone(e.target.checked);
                            if (e.target.checked) form.setValue("whatsapp", phoneValue);
                            else form.setValue("whatsapp", "");
                          }}
                          className="w-4 h-4 accent-primary rounded"
                        />
                        <span className="text-xs text-muted-foreground">Same as contact number</span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Section: Project Info */}
                <div>
                  <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-4">Project Details</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold">Service Required *</label>
                      <Controller
                        control={form.control}
                        name="service"
                        render={({ field }) => (
                          <Select onValueChange={field.onChange} value={field.value}>
                            <SelectTrigger className={fieldClass}>
                              <SelectValue placeholder="Select a service" />
                            </SelectTrigger>
                            <SelectContent>
                              {services.map(s => (
                                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                      {form.formState.errors.service && <p className="text-xs text-destructive">{form.formState.errors.service.message}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold flex items-center gap-1.5"><Banknote className="w-4 h-4 text-primary" /> Offer Budget *</label>
                      <Controller
                        control={form.control}
                        name="budget"
                        render={({ field }) => (
                          <Select onValueChange={field.onChange} value={field.value}>
                            <SelectTrigger className={fieldClass}>
                              <SelectValue placeholder="Select budget range" />
                            </SelectTrigger>
                            <SelectContent>
                              {budgetRanges.map(b => (
                                <SelectItem key={b} value={b}>{b}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                      {form.formState.errors.budget && <p className="text-xs text-destructive">{form.formState.errors.budget.message}</p>}
                    </div>
                  </div>
                </div>

                {/* Dynamic service-specific questions */}
                {questions.length > 0 && (
                  <div>
                    <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-4">
                      {selectedService} Details
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {questions.map((q) => (
                        <div key={q.key} className="space-y-1.5">
                          <label className="text-sm font-semibold">{q.label}</label>
                          {q.type === "select" && q.options ? (
                            <Select
                              value={serviceDetails[q.key] ?? ""}
                              onValueChange={(v) => setServiceDetails(prev => ({ ...prev, [q.key]: v }))}
                            >
                              <SelectTrigger className={fieldClass}>
                                <SelectValue placeholder="Select an option" />
                              </SelectTrigger>
                              <SelectContent>
                                {q.options.map(opt => (
                                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              placeholder="Your answer..."
                              className={fieldClass}
                              value={serviceDetails[q.key] ?? ""}
                              onChange={(e) => setServiceDetails(prev => ({ ...prev, [q.key]: e.target.value }))}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Message */}
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">Additional Notes / Project Description *</label>
                  <Textarea
                    placeholder="Tell us more about your project, goals, deadlines, or anything else we should know..."
                    className="resize-none min-h-[120px] bg-background/50 border-border text-foreground"
                    {...form.register("message")}
                  />
                  {form.formState.errors.message && <p className="text-xs text-destructive">{form.formState.errors.message.message}</p>}
                </div>

                <Button
                  type="submit"
                  size="lg"
                  className="w-full h-14 text-base font-bold bg-primary hover:bg-primary/90 rounded-xl mt-2 group shadow-lg shadow-primary/20"
                  disabled={contactMutation.isPending}
                >
                  {contactMutation.isPending ? "Sending..." : "Submit Quote Request"}
                  {!contactMutation.isPending && <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />}
                </Button>
              </form>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
