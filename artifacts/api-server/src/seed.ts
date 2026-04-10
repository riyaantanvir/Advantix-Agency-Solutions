import bcrypt from "bcryptjs";
import { db, adminsTable, servicesTable } from "@workspace/db";
import { eq, sql, count } from "drizzle-orm";
import { logger } from "./lib/logger.js";

export async function runMigrations(): Promise<void> {
  // ── Core tables ──────────────────────────────────────────────────────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS admins (
      id serial PRIMARY KEY,
      username text NOT NULL UNIQUE,
      password_hash text NOT NULL,
      created_at timestamp DEFAULT now() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS contacts (
      id serial PRIMARY KEY,
      name text NOT NULL,
      email text NOT NULL,
      phone text,
      service text,
      message text NOT NULL,
      replied boolean DEFAULT false NOT NULL,
      created_at timestamp DEFAULT now() NOT NULL
    )
  `);

  await db.execute(sql`
    ALTER TABLE contacts
      ADD COLUMN IF NOT EXISTS whatsapp text,
      ADD COLUMN IF NOT EXISTS budget text,
      ADD COLUMN IF NOT EXISTS details text
  `);

  await db.execute(sql`
    ALTER TABLE contacts
      ADD COLUMN IF NOT EXISTS assigned_to text,
      ADD COLUMN IF NOT EXISTS notes text
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS portfolio_items (
      id serial PRIMARY KEY,
      title text NOT NULL,
      category text NOT NULL,
      description text,
      image_url text,
      video_url text,
      client_name text,
      created_at timestamp DEFAULT now() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS team_members (
      id serial PRIMARY KEY,
      name text NOT NULL,
      role text NOT NULL,
      bio text,
      photo_url text,
      email text,
      linkedin_url text,
      "order" serial NOT NULL,
      created_at timestamp DEFAULT now() NOT NULL
    )
  `);

  // Columns added after initial release — safe to re-run via IF NOT EXISTS
  await db.execute(sql`ALTER TABLE team_members ADD COLUMN IF NOT EXISTS badge text`);
  await db.execute(sql`ALTER TABLE team_members ADD COLUMN IF NOT EXISTS tagline text`);
  await db.execute(sql`ALTER TABLE team_members ADD COLUMN IF NOT EXISTS skills text[]`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS leads (
      id serial PRIMARY KEY,
      service text NOT NULL,
      source_page text,
      visitor_id text,
      name text,
      email text,
      status text DEFAULT 'new' NOT NULL,
      created_at timestamp DEFAULT now() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS visitor_sessions (
      id serial PRIMARY KEY,
      visitor_id text NOT NULL UNIQUE,
      first_seen_at timestamp DEFAULT now() NOT NULL,
      last_seen_at timestamp DEFAULT now() NOT NULL,
      page_view_count integer DEFAULT 1 NOT NULL,
      user_agent text,
      referrer text
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS page_views (
      id serial PRIMARY KEY,
      visitor_id text NOT NULL,
      page text NOT NULL,
      user_agent text,
      referrer text,
      created_at timestamp DEFAULT now() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS conversations (
      id serial PRIMARY KEY,
      title text DEFAULT '' NOT NULL,
      visitor_name text,
      visitor_email text,
      status text DEFAULT 'ai' NOT NULL,
      session_token text,
      has_unread_admin boolean DEFAULT false NOT NULL,
      has_unread_visitor boolean DEFAULT false NOT NULL,
      created_at timestamptz DEFAULT now() NOT NULL,
      updated_at timestamptz DEFAULT now() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_session_token
    ON conversations (session_token) WHERE session_token IS NOT NULL
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS messages (
      id serial PRIMARY KEY,
      conversation_id integer NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role text NOT NULL,
      content text NOT NULL,
      created_at timestamptz DEFAULT now() NOT NULL
    )
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

  // ── Tool users & URL shortener ────────────────────────────────────────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS tool_users (
      id serial PRIMARY KEY,
      name text NOT NULL,
      email text NOT NULL UNIQUE,
      password_hash text NOT NULL,
      company_name text,
      phone text,
      website text,
      created_at timestamp DEFAULT now() NOT NULL
    )
  `);

  await db.execute(sql`
    ALTER TABLE tool_users
      ADD COLUMN IF NOT EXISTS company_name text,
      ADD COLUMN IF NOT EXISTS phone text,
      ADD COLUMN IF NOT EXISTS website text
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

  await db.execute(sql`
    ALTER TABLE url_clicks
      ADD COLUMN IF NOT EXISTS browser text,
      ADD COLUMN IF NOT EXISTS os text,
      ADD COLUMN IF NOT EXISTS ip text,
      ADD COLUMN IF NOT EXISTS isp text,
      ADD COLUMN IF NOT EXISTS is_mobile boolean
  `);

  await db.execute(sql`
    ALTER TABLE url_clicks
      ADD COLUMN IF NOT EXISTS language text,
      ADD COLUMN IF NOT EXISTS timezone text,
      ADD COLUMN IF NOT EXISTS region text,
      ADD COLUMN IF NOT EXISTS org text,
      ADD COLUMN IF NOT EXISTS is_bot boolean DEFAULT false
  `);

  await db.execute(sql`
    ALTER TABLE short_urls
      ADD COLUMN IF NOT EXISTS password_hash text,
      ADD COLUMN IF NOT EXISTS click_limit integer
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS site_settings (
      key text PRIMARY KEY,
      value text NOT NULL,
      updated_at timestamp DEFAULT now() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id serial PRIMARY KEY,
      endpoint text NOT NULL UNIQUE,
      p256dh text NOT NULL,
      auth text NOT NULL,
      user_agent text,
      subscribed_at timestamp DEFAULT now() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS email_subscribers (
      id serial PRIMARY KEY,
      email text NOT NULL UNIQUE,
      name text,
      source text DEFAULT 'website' NOT NULL,
      tags text,
      active boolean DEFAULT true NOT NULL,
      subscribed_at timestamp DEFAULT now() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS marketing_campaigns (
      id serial PRIMARY KEY,
      name text NOT NULL,
      channel text NOT NULL,
      spend numeric(12,2) DEFAULT 0 NOT NULL,
      revenue numeric(12,2) DEFAULT 0 NOT NULL,
      start_date date NOT NULL,
      end_date date,
      status text DEFAULT 'active' NOT NULL,
      notes text,
      created_at timestamp DEFAULT now() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS page_events (
      id serial PRIMARY KEY,
      session_id text NOT NULL,
      event_type text NOT NULL,
      page_path text NOT NULL,
      referrer text,
      scroll_depth integer,
      time_on_page integer,
      click_x real,
      click_y real,
      ip text,
      country text,
      city text,
      browser text,
      os text,
      device text,
      language text,
      created_at timestamp DEFAULT now() NOT NULL
    )
  `);

  // ── page_events indexes for analytics performance ─────────────────────────
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_page_events_event_type_created_at
      ON page_events (event_type, created_at DESC)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_page_events_created_at
      ON page_events (created_at DESC)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_page_events_session_id
      ON page_events (session_id)
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS recording_sessions (
      id serial PRIMARY KEY,
      user_id integer NOT NULL REFERENCES tool_users(id) ON DELETE CASCADE,
      duration_seconds integer NOT NULL DEFAULT 0,
      created_at timestamp DEFAULT now() NOT NULL
    )
  `);

  // ── AI tables ─────────────────────────────────────────────────────────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ai_projects (
      id serial PRIMARY KEY,
      user_id integer NOT NULL REFERENCES tool_users(id) ON DELETE CASCADE,
      name text NOT NULL,
      instructions text NOT NULL DEFAULT '',
      emoji text NOT NULL DEFAULT '📁',
      created_at timestamptz DEFAULT now() NOT NULL,
      updated_at timestamptz DEFAULT now() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ai_sessions (
      id serial PRIMARY KEY,
      user_id integer REFERENCES tool_users(id) ON DELETE CASCADE,
      project_id integer REFERENCES ai_projects(id) ON DELETE SET NULL,
      title text NOT NULL DEFAULT 'New Chat',
      created_at timestamptz DEFAULT now() NOT NULL,
      updated_at timestamptz DEFAULT now() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ai_messages (
      id serial PRIMARY KEY,
      session_id integer NOT NULL REFERENCES ai_sessions(id) ON DELETE CASCADE,
      role text NOT NULL,
      content text NOT NULL,
      provider text,
      model text,
      intent_type text,
      prompt_tokens integer,
      completion_tokens integer,
      feedback text,
      created_at timestamptz DEFAULT now() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ai_usage_logs (
      id serial PRIMARY KEY,
      user_id integer REFERENCES tool_users(id) ON DELETE SET NULL,
      provider text NOT NULL,
      model text NOT NULL,
      intent_type text,
      prompt_tokens integer NOT NULL DEFAULT 0,
      completion_tokens integer NOT NULL DEFAULT 0,
      total_tokens integer NOT NULL DEFAULT 0,
      estimated_cost_usd numeric(10,6) NOT NULL DEFAULT 0,
      created_at timestamptz DEFAULT now() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ai_user_limits (
      id serial PRIMARY KEY,
      user_id integer NOT NULL UNIQUE REFERENCES tool_users(id) ON DELETE CASCADE,
      monthly_token_limit integer,
      monthly_usd_limit numeric(10,4),
      created_at timestamptz DEFAULT now() NOT NULL,
      updated_at timestamptz DEFAULT now() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ai_memories (
      id serial PRIMARY KEY,
      user_id integer NOT NULL REFERENCES tool_users(id) ON DELETE CASCADE,
      content text NOT NULL,
      source text NOT NULL DEFAULT 'auto',
      created_at timestamptz DEFAULT now() NOT NULL,
      updated_at timestamptz DEFAULT now() NOT NULL
    )
  `);

  // ── Integrations & settings ───────────────────────────────────────────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS integrations (
      id serial PRIMARY KEY,
      name text NOT NULL UNIQUE,
      label text NOT NULL,
      value text NOT NULL DEFAULT '',
      description text,
      category text NOT NULL DEFAULT 'Other',
      created_at timestamptz DEFAULT now() NOT NULL,
      updated_at timestamptz DEFAULT now() NOT NULL
    )
  `);

  // ── Landing page builder ──────────────────────────────────────────────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS landing_page_projects (
      id serial PRIMARY KEY,
      user_id integer NOT NULL REFERENCES tool_users(id) ON DELETE CASCADE,
      name text NOT NULL DEFAULT 'Untitled Project',
      html text NOT NULL DEFAULT '',
      messages jsonb NOT NULL DEFAULT '[]',
      created_at timestamptz DEFAULT now() NOT NULL,
      updated_at timestamptz DEFAULT now() NOT NULL
    )
  `);

  // ── Admin tools ───────────────────────────────────────────────────────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS tasks (
      id serial PRIMARY KEY,
      title text NOT NULL,
      description text,
      status text NOT NULL DEFAULT 'todo',
      priority text NOT NULL DEFAULT 'medium',
      type text NOT NULL DEFAULT 'internal',
      client_name text,
      assigned_to text,
      due_date timestamptz,
      tags text,
      position integer DEFAULT 0 NOT NULL,
      created_by text,
      created_at timestamptz DEFAULT now() NOT NULL,
      updated_at timestamptz DEFAULT now() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS blog_posts (
      id serial PRIMARY KEY,
      title text NOT NULL,
      slug text NOT NULL UNIQUE,
      excerpt text,
      content text NOT NULL DEFAULT '',
      cover_image_url text,
      author text NOT NULL DEFAULT 'Advantix Team',
      category text NOT NULL DEFAULT 'General',
      tags text,
      status text NOT NULL DEFAULT 'draft',
      reading_time text,
      seo_title text,
      seo_description text,
      featured boolean NOT NULL DEFAULT false,
      published_at timestamptz,
      created_at timestamptz DEFAULT now() NOT NULL,
      updated_at timestamptz DEFAULT now() NOT NULL
    )
  `);

  await db.execute(sql`
    ALTER TABLE blog_posts
      ADD COLUMN IF NOT EXISTS views integer DEFAULT 0 NOT NULL,
      ADD COLUMN IF NOT EXISTS likes integer DEFAULT 0 NOT NULL
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS bug_reports (
      id serial PRIMARY KEY,
      title text NOT NULL,
      description text NOT NULL,
      screenshot text,
      status text NOT NULL DEFAULT 'pending',
      priority text NOT NULL DEFAULT 'medium',
      reporter_name text,
      reporter_email text,
      page_url text,
      admin_note text,
      created_at timestamp DEFAULT now() NOT NULL,
      updated_at timestamp DEFAULT now() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS content_plans (
      id serial PRIMARY KEY,
      platform text NOT NULL,
      title text NOT NULL,
      description text,
      content text,
      scheduled_date text NOT NULL,
      scheduled_time text,
      status text DEFAULT 'planned' NOT NULL,
      post_url text,
      tags text,
      notes text,
      created_at timestamp DEFAULT now() NOT NULL,
      updated_at timestamp DEFAULT now() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS email_senders (
      id serial PRIMARY KEY,
      name text NOT NULL,
      email text NOT NULL UNIQUE,
      resend_domain_id text,
      status text NOT NULL DEFAULT 'pending',
      is_default boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS email_templates (
      id serial PRIMARY KEY,
      name text NOT NULL,
      subject text NOT NULL DEFAULT '',
      preview_text text NOT NULL DEFAULT '',
      html_body text NOT NULL DEFAULT '',
      json_blocks text NOT NULL DEFAULT '[]',
      is_system boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS email_contacts (
      id serial PRIMARY KEY,
      email text NOT NULL,
      name text NOT NULL DEFAULT '',
      tags text NOT NULL DEFAULT '',
      list_name text NOT NULL DEFAULT 'default',
      source text NOT NULL DEFAULT 'manual',
      unsubscribed boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS email_contacts_email_list_idx ON email_contacts(email, list_name)
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS email_campaigns (
      id serial PRIMARY KEY,
      name text NOT NULL,
      subject text NOT NULL,
      preview_text text NOT NULL DEFAULT '',
      template_id integer REFERENCES email_templates(id) ON DELETE SET NULL,
      sender_id integer REFERENCES email_senders(id) ON DELETE SET NULL,
      html_content text NOT NULL DEFAULT '',
      recipient_list_name text NOT NULL DEFAULT 'default',
      recipient_count integer NOT NULL DEFAULT 0,
      status text NOT NULL DEFAULT 'draft',
      scheduled_at timestamptz,
      sent_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS email_events (
      id serial PRIMARY KEY,
      campaign_id integer REFERENCES email_campaigns(id) ON DELETE CASCADE,
      contact_email text NOT NULL,
      event_type text NOT NULL,
      metadata text NOT NULL DEFAULT '{}',
      occurred_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS inbox_messages (
      id serial PRIMARY KEY,
      thread_id text NOT NULL,
      direction text NOT NULL DEFAULT 'inbound',
      from_email text NOT NULL,
      from_name text NOT NULL DEFAULT '',
      to_email text NOT NULL,
      subject text NOT NULL,
      body_html text NOT NULL DEFAULT '',
      body_text text NOT NULL DEFAULT '',
      is_read boolean NOT NULL DEFAULT false,
      campaign_id integer,
      resend_id text,
      received_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_inbox_messages_thread_id ON inbox_messages(thread_id)
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS contests (
      id serial PRIMARY KEY,
      title text NOT NULL,
      description text NOT NULL,
      type text NOT NULL DEFAULT 'logo',
      instructions text,
      rules text,
      prize text,
      cover_image_url text,
      deadline timestamptz NOT NULL,
      status text NOT NULL DEFAULT 'draft',
      winner_submission_id text,
      is_active boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS contest_participants (
      id serial PRIMARY KEY,
      contest_id integer NOT NULL,
      name text NOT NULL,
      email text NOT NULL,
      phone text,
      accepted_rules boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS contest_submissions (
      id serial PRIMARY KEY,
      contest_id integer NOT NULL,
      participant_id integer NOT NULL,
      file_url text NOT NULL,
      file_name text,
      description text,
      submitted_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_contest_participants_contest ON contest_participants(contest_id)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_contest_submissions_contest ON contest_submissions(contest_id)
  `);

  // ── Project Management ────────────────────────────────────────────────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS projects (
      id serial PRIMARY KEY,
      name text NOT NULL,
      description text,
      color text NOT NULL DEFAULT '#3b82f6',
      status text NOT NULL DEFAULT 'active',
      created_by integer,
      created_at timestamptz DEFAULT now() NOT NULL,
      updated_at timestamptz DEFAULT now() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS project_members (
      id serial PRIMARY KEY,
      project_id integer NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      admin_id integer NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
      role text NOT NULL DEFAULT 'member',
      added_at timestamptz DEFAULT now() NOT NULL,
      UNIQUE(project_id, admin_id)
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS task_comments (
      id serial PRIMARY KEY,
      task_id integer NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      author_id integer NOT NULL,
      author_name text NOT NULL,
      content text NOT NULL,
      created_at timestamptz DEFAULT now() NOT NULL,
      updated_at timestamptz DEFAULT now() NOT NULL
    )
  `);

  await db.execute(sql`
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project_id integer REFERENCES projects(id) ON DELETE SET NULL
  `);

  // Super admin role
  await db.execute(sql`
    ALTER TABLE admins ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false
  `);

  // Recurring tasks support
  await db.execute(sql`
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_recurring boolean NOT NULL DEFAULT false
  `);
  await db.execute(sql`
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_type text
  `);
  await db.execute(sql`
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_time text
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
  const username = process.env.ADMIN_USERNAME ?? "admin";
  const password = process.env.ADMIN_PASSWORD ?? "2816";

  const [existing] = await db.select().from(adminsTable).where(eq(adminsTable.username, username)).limit(1);

  const passwordHash = await bcrypt.hash(password, 12);

  if (!existing) {
    await db.insert(adminsTable).values({ username, passwordHash, isSuperAdmin: true });
    logger.info({ username }, "Admin user seeded successfully");
  } else {
    // Always sync the password hash with the current ADMIN_PASSWORD env var.
    // Also ensure the primary admin is always super admin.
    await db.update(adminsTable).set({ passwordHash, isSuperAdmin: true }).where(eq(adminsTable.username, username));
    logger.info({ username }, "Admin password synced from ADMIN_PASSWORD env var");
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

const TELEGRAM_DEFAULTS = [
  { name: "TELEGRAM_BOT_TOKEN",                label: "Telegram Bot Token",               value: "",     category: "Notifications" },
  { name: "TELEGRAM_CHAT_ID",                   label: "Telegram Chat / Group ID",         value: "",     category: "Notifications" },
  { name: "TELEGRAM_NOTIFICATIONS_ENABLED",     label: "Telegram Notifications Enabled",   value: "true", category: "Notifications" },
  { name: "TELEGRAM_NOTIFY_ASSISTANT_REQUEST",  label: "Human Agent Requested",            value: "true", category: "Notifications" },
  { name: "TELEGRAM_NOTIFY_NEW_CONTACT",        label: "New Contact Form",                 value: "true", category: "Notifications" },
  { name: "TELEGRAM_NOTIFY_NEW_LEAD",           label: "New Lead",                         value: "true", category: "Notifications" },
  { name: "TELEGRAM_NOTIFY_BUG_REPORT",         label: "Bug Report",                       value: "true", category: "Notifications" },
  { name: "TELEGRAM_NOTIFY_TASK_CREATED",       label: "Task Created",                     value: "true", category: "Notifications" },
  { name: "TELEGRAM_NOTIFY_TASK_ASSIGNED",      label: "Task Assigned",                    value: "true", category: "Notifications" },
  { name: "TELEGRAM_NOTIFY_TASK_STATUS",        label: "Task Status Changed",              value: "true", category: "Notifications" },
  { name: "TELEGRAM_NOTIFY_TASK_COMMENT",       label: "Task Comment",                     value: "true", category: "Notifications" },
];

export async function seedTelegramDefaults(): Promise<void> {
  for (const row of TELEGRAM_DEFAULTS) {
    await db.execute(sql`
      INSERT INTO integrations (name, label, value, category)
      VALUES (${row.name}, ${row.label}, ${row.value}, ${row.category})
      ON CONFLICT (name) DO NOTHING
    `);
  }
  logger.info("Telegram notification defaults ensured");
}
