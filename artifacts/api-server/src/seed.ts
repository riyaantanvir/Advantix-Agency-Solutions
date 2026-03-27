import bcrypt from "bcryptjs";
import { db, adminsTable, servicesTable } from "@workspace/db";
import { eq, sql, count } from "drizzle-orm";
import { logger } from "./lib/logger.js";

export async function runMigrations(): Promise<void> {
  await db.execute(sql`
    ALTER TABLE contacts
      ADD COLUMN IF NOT EXISTS whatsapp text,
      ADD COLUMN IF NOT EXISTS budget text,
      ADD COLUMN IF NOT EXISTS details text
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS services (
      id serial PRIMARY KEY,
      name text NOT NULL,
      icon text NOT NULL DEFAULT 'Briefcase',
      description text NOT NULL,
      details text,
      "order" integer NOT NULL DEFAULT 0,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamp DEFAULT now() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS tool_users (
      id serial PRIMARY KEY,
      name text NOT NULL,
      email text NOT NULL UNIQUE,
      password_hash text NOT NULL,
      created_at timestamp DEFAULT now() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS short_urls (
      id serial PRIMARY KEY,
      short_code text NOT NULL UNIQUE,
      original_url text NOT NULL,
      title text,
      user_id integer NOT NULL REFERENCES tool_users(id) ON DELETE CASCADE,
      clicks integer NOT NULL DEFAULT 0,
      created_at timestamp DEFAULT now() NOT NULL
    )
  `);

  await db.execute(sql`
    ALTER TABLE conversations
      ADD COLUMN IF NOT EXISTS visitor_name text,
      ADD COLUMN IF NOT EXISTS visitor_email text,
      ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ai',
      ADD COLUMN IF NOT EXISTS session_token text,
      ADD COLUMN IF NOT EXISTS has_unread_admin boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS has_unread_visitor boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_session_token
    ON conversations (session_token) WHERE session_token IS NOT NULL
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS url_clicks (
      id serial PRIMARY KEY,
      url_id integer NOT NULL REFERENCES short_urls(id) ON DELETE CASCADE,
      country_code text,
      country text,
      city text,
      referrer text,
      device text,
      created_at timestamp DEFAULT now() NOT NULL
    )
  `);

  logger.info("Migrations applied");
}

export async function ensureSessionTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "session" (
      "sid" varchar NOT NULL COLLATE "default",
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL
    );
  `);
  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'session_pkey'
      ) THEN
        ALTER TABLE "session" ADD CONSTRAINT "session_pkey"
          PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;
      END IF;
    END $$;
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
  `);
}

export async function seedAdmin(): Promise<void> {
  const username = "admin";
  const password = "2816";

  const [existing] = await db.select().from(adminsTable).where(eq(adminsTable.username, username)).limit(1);

  if (!existing) {
    const passwordHash = await bcrypt.hash(password, 12);
    await db.insert(adminsTable).values({ username, passwordHash });
    logger.info("Admin user seeded successfully");
  } else {
    logger.info("Admin user already exists, skipping seed");
  }
}

const initialServices = [
  {
    name: "Website Development",
    icon: "LayoutTemplate",
    description: "Custom, responsive, and blazing fast web applications.",
    details: `We build high-performance websites tailored to your brand and business goals.\n\n**What's included:**\n- Custom responsive design (mobile, tablet, desktop)\n- SEO-ready page structure and meta tags\n- Contact forms and CTA integration\n- CMS setup (WordPress, Webflow, or custom)\n- Fast hosting & deployment setup\n- Google Analytics & tracking integration\n- 30-day post-launch support\n\n**Technologies we use:**\nReact, Next.js, WordPress, Webflow, Shopify, HTML/CSS, and more.`,
    order: 1,
  },
  {
    name: "CRM Integration",
    icon: "Database",
    description: "Streamline your customer relationships and data flow.",
    details: `We connect your business tools and centralize your customer data so nothing falls through the cracks.\n\n**What's included:**\n- CRM setup and configuration (HubSpot, Zoho, GoHighLevel, Pipedrive)\n- Data migration from existing systems\n- Sales pipeline automation\n- Email & calendar integration\n- Lead capture form connections\n- Team onboarding and training\n- Ongoing technical support`,
    order: 2,
  },
  {
    name: "Sales Page Design",
    icon: "Monitor",
    description: "High-converting landing pages engineered for sales.",
    details: `We design and develop landing pages optimized to convert visitors into paying customers.\n\n**What's included:**\n- Conversion-focused copywriting guidance\n- Custom design matching your brand\n- Compelling offer presentation\n- Social proof sections (testimonials, logos, stats)\n- Mobile-first responsive layout\n- A/B testing setup\n- Pixel & analytics integration\n- Fast load time optimization`,
    order: 3,
  },
  {
    name: "Ecommerce Solutions",
    icon: "ShoppingCart",
    description: "Robust online stores with seamless payment flows.",
    details: `We build full-featured ecommerce stores that sell 24/7 with a seamless customer experience.\n\n**What's included:**\n- Product catalog setup (unlimited products)\n- Secure payment gateway integration (Stripe, PayPal, bKash, SSLCommerz)\n- Shopping cart and checkout optimization\n- Inventory management system\n- Order tracking and notifications\n- Discount codes and promotions\n- Mobile-optimized storefront\n- Post-launch support`,
    order: 4,
  },
  {
    name: "Python Bot Automation",
    icon: "Bot",
    description: "Automate repetitive tasks and scale your operations.",
    details: `We build custom Python bots and automation scripts that save your team hours every week.\n\n**What's included:**\n- Web scraping and data extraction bots\n- Telegram / WhatsApp bots\n- Email automation workflows\n- Scheduled task runners\n- API integrations and data pipelines\n- Dashboard or notification alerts\n- Full source code delivery\n- Documentation and handover`,
    order: 5,
  },
  {
    name: "Team Management",
    icon: "Users",
    description: "Systems to track, manage, and empower your workforce.",
    details: `We set up digital systems that help you manage your team efficiently and scale without chaos.\n\n**What's included:**\n- Project management tool setup (Notion, ClickUp, Trello, Asana)\n- Team workflow design and documentation\n- Role and permission configuration\n- Time tracking integration\n- Performance reporting dashboards\n- Standard operating procedures (SOPs)\n- Staff onboarding workflows`,
    order: 6,
  },
  {
    name: "Virtual Assistants",
    icon: "UserPlus",
    description: "Dedicated professionals to handle your day-to-day.",
    details: `We provide skilled virtual assistants to handle your business tasks so you can focus on growth.\n\n**What's included:**\n- Administrative and scheduling support\n- Email management and follow-ups\n- Research and data collection\n- Customer support handling\n- Social media posting and engagement\n- Data entry and reporting\n- CRM updating and lead follow-up\n- Flexible hours (part-time or full-time)`,
    order: 7,
  },
  {
    name: "Graphics & Branding",
    icon: "Palette",
    description: "Stunning visual identities that capture attention.",
    details: `We create visual identities and design assets that make your brand unforgettable.\n\n**What's included:**\n- Logo design (multiple concepts + revisions)\n- Full brand kit (colors, fonts, style guide)\n- Social media graphics and templates\n- Business card and letterhead design\n- Flyer, poster, and banner design\n- Ad creative for Facebook, Instagram, Google\n- Presentation deck design\n- All source files delivered`,
    order: 8,
  },
  {
    name: "Facebook Marketing",
    icon: "Facebook",
    description: "Targeted ad campaigns with high ROI.",
    details: `We run data-driven Facebook and Instagram ad campaigns designed to generate real results for your business.\n\n**What's included:**\n- Facebook Business Manager setup\n- Audience research and targeting\n- Campaign strategy and ad copywriting\n- Ad creative design (image/video)\n- A/B testing and optimization\n- Retargeting campaigns\n- Weekly performance reporting\n- Pixel setup and conversion tracking`,
    order: 9,
  },
  {
    name: "Social Media Management",
    icon: "Share2",
    description: "Grow your audience with consistent, engaging content.",
    details: `We manage your social media presence so you stay top of mind with your audience every day.\n\n**What's included:**\n- Content calendar planning (monthly)\n- Graphic design for every post\n- Caption writing and hashtag research\n- Posting on Instagram, Facebook, TikTok, or LinkedIn\n- Community management (replies & DMs)\n- Monthly analytics report\n- Story and reel creation\n- Brand voice consistency`,
    order: 10,
  },
  {
    name: "Data Entry & Ops",
    icon: "ClipboardList",
    description: "Accurate, efficient data processing and management.",
    details: `We handle large volumes of data entry, cleaning, and organization with high accuracy and speed.\n\n**What's included:**\n- Document and PDF digitization\n- Spreadsheet data entry and formatting\n- Database population and updates\n- Web research and data collection\n- Data validation and quality checks\n- CRM data migration and cleanup\n- Report generation\n- Flexible turnaround times`,
    order: 11,
  },
  {
    name: "Lead Generation",
    icon: "TrendingUp",
    description: "Qualified inbound leads ready to convert.",
    details: `We build and execute lead generation systems that bring qualified prospects to your business consistently.\n\n**What's included:**\n- Target audience and market research\n- LinkedIn outreach and email campaigns\n- Landing page + lead magnet setup\n- Facebook/Instagram lead ads\n- Lead qualification and scoring\n- CRM delivery of verified leads\n- Weekly lead reports\n- Ongoing campaign optimization`,
    order: 12,
  },
];

export async function seedServices(): Promise<void> {
  const [{ total }] = await db.select({ total: count() }).from(servicesTable);

  if (total > 0) {
    logger.info("Services already seeded, skipping");
    return;
  }

  await db.insert(servicesTable).values(initialServices);
  logger.info("Initial services seeded");
}
