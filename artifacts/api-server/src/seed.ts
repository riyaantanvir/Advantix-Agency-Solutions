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

  // Auth enhancements — Google OAuth, email verification, password reset
  await db.execute(sql`ALTER TABLE tool_users ALTER COLUMN password_hash DROP NOT NULL`);
  await db.execute(sql`
    ALTER TABLE tool_users
      ADD COLUMN IF NOT EXISTS google_id text,
      ADD COLUMN IF NOT EXISTS email_verified boolean DEFAULT true NOT NULL,
      ADD COLUMN IF NOT EXISTS verification_code text,
      ADD COLUMN IF NOT EXISTS verification_expires timestamp,
      ADD COLUMN IF NOT EXISTS reset_token text,
      ADD COLUMN IF NOT EXISTS reset_token_expires timestamp
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tool_users_google_id
    ON tool_users(google_id) WHERE google_id IS NOT NULL
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

  // ── page_events — ensure language column exists (added after initial release)
  await db.execute(sql`ALTER TABLE page_events ADD COLUMN IF NOT EXISTS language text`);

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
    CREATE TABLE IF NOT EXISTS user_tool_permissions (
      id serial PRIMARY KEY,
      user_id integer NOT NULL REFERENCES tool_users(id) ON DELETE CASCADE,
      tool_slug text NOT NULL,
      enabled boolean DEFAULT true NOT NULL,
      granted_at timestamp DEFAULT now() NOT NULL,
      UNIQUE(user_id, tool_slug)
    )
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

  // Custom pages feature
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS custom_pages (
      id SERIAL PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'content',
      description TEXT,
      content TEXT DEFAULT '',
      password_hash TEXT,
      is_published BOOLEAN NOT NULL DEFAULT false,
      is_public BOOLEAN NOT NULL DEFAULT false,
      meta_title TEXT,
      meta_description TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`ALTER TABLE custom_pages ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS gallery_folders (
      id SERIAL PRIMARY KEY,
      page_id INTEGER NOT NULL REFERENCES custom_pages(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      cover_image_url TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS gallery_images (
      id SERIAL PRIMARY KEY,
      folder_id INTEGER NOT NULL REFERENCES gallery_folders(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      caption TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS page_image_favorites (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES tool_users(id) ON DELETE CASCADE,
      image_id INTEGER NOT NULL REFERENCES gallery_images(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
      UNIQUE(user_id, image_id)
    )
  `);

  // Blob storage for gallery images — used when Replit Object Storage is unavailable (e.g. DigitalOcean)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS gallery_image_blobs (
      id SERIAL PRIMARY KEY,
      data bytea NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
      created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    )
  `);

  // ── PDF Books (AI TTS reader) ─────────────────────────────────────────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS tool_pdf_books (
      id serial PRIMARY KEY,
      user_id integer NOT NULL REFERENCES tool_users(id) ON DELETE CASCADE,
      title text NOT NULL,
      filename text NOT NULL,
      text text NOT NULL,
      num_pages integer NOT NULL DEFAULT 1,
      total_lines integer NOT NULL DEFAULT 0,
      last_line integer NOT NULL DEFAULT 0,
      created_at timestamp DEFAULT now() NOT NULL,
      updated_at timestamp DEFAULT now() NOT NULL
    )
  `);

  // ── Social Media Management — scheduled posts ─────────────────────────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS smm_scheduled_posts (
      id serial PRIMARY KEY,
      platforms text NOT NULL,
      content text NOT NULL,
      image_url text,
      scheduled_at timestamptz NOT NULL,
      status text NOT NULL DEFAULT 'pending',
      published_at timestamptz,
      error_message text,
      created_by text,
      created_at timestamptz DEFAULT now() NOT NULL
    )
  `);

  // Ensure index for efficient SMM queries
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_smm_scheduled_posts_scheduled_at
      ON smm_scheduled_posts (scheduled_at DESC)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_smm_scheduled_posts_status
      ON smm_scheduled_posts (status)
  `);

  // ── Advantix Assistant — local agent API keys + chat history ──────────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS agent_sessions (
      id               serial PRIMARY KEY,
      user_id          integer NOT NULL UNIQUE REFERENCES tool_users(id) ON DELETE CASCADE,
      api_key_hash     text NOT NULL UNIQUE,
      api_key_preview  text NOT NULL,
      created_at       timestamptz DEFAULT now() NOT NULL,
      last_connected_at timestamptz
    )
  `);
  /* Add is_online column if not present (idempotent) */
  await db.execute(sql`
    ALTER TABLE agent_sessions ADD COLUMN IF NOT EXISTS is_online boolean NOT NULL DEFAULT false
  `);
  /* On every server start, reset all agents to offline (they must reconnect) */
  await db.execute(sql`UPDATE agent_sessions SET is_online = false`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS agent_messages (
      id          serial PRIMARY KEY,
      user_id     integer NOT NULL REFERENCES tool_users(id) ON DELETE CASCADE,
      role        text NOT NULL,
      content     text NOT NULL DEFAULT '',
      tool_name   text,
      tool_input  text,
      tool_result text,
      created_at  timestamptz DEFAULT now() NOT NULL
    )
  `);

  // ── Admin permissions — per-admin page access control ─────────────────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS admin_permissions (
      id          SERIAL PRIMARY KEY,
      admin_id    INTEGER NOT NULL,
      page_slug   TEXT NOT NULL,
      enabled     BOOLEAN NOT NULL DEFAULT true,
      UNIQUE (admin_id, page_slug)
    )
  `);

  // ── Conversation threading ─────────────────────────────────────────────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS agent_conversations (
      id          serial PRIMARY KEY,
      user_id     integer NOT NULL REFERENCES tool_users(id) ON DELETE CASCADE,
      title       text NOT NULL DEFAULT 'New Chat',
      created_at  timestamptz DEFAULT now() NOT NULL,
      updated_at  timestamptz DEFAULT now() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_agent_conversations_user_id ON agent_conversations (user_id)
  `);
  await db.execute(sql`
    ALTER TABLE agent_messages ADD COLUMN IF NOT EXISTS conversation_id integer REFERENCES agent_conversations(id) ON DELETE SET NULL
  `);

  // ── AI usage tracking ──────────────────────────────────────────────────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS agent_usage (
      id                  serial PRIMARY KEY,
      user_id             integer NOT NULL REFERENCES tool_users(id) ON DELETE CASCADE,
      provider            text NOT NULL DEFAULT 'anthropic',
      model               text NOT NULL DEFAULT '',
      input_tokens        integer NOT NULL DEFAULT 0,
      output_tokens       integer NOT NULL DEFAULT 0,
      total_tokens        integer NOT NULL DEFAULT 0,
      estimated_cost_usd  numeric(10,6) NOT NULL DEFAULT 0,
      tool_calls          integer NOT NULL DEFAULT 0,
      created_at          timestamptz DEFAULT now() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_agent_usage_user_id ON agent_usage (user_id)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_agent_usage_created_at ON agent_usage (created_at)
  `);

  // ── SMM — per-user API keys (Social Media Manager tool) ───────────────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS smm_user_keys (
      id           serial PRIMARY KEY,
      tool_user_id integer NOT NULL REFERENCES tool_users(id) ON DELETE CASCADE,
      key_name     text NOT NULL,
      key_value    text,
      updated_at   timestamptz NOT NULL DEFAULT now(),
      UNIQUE (tool_user_id, key_name)
    )
  `);

  // Add tool_user_id to scheduled posts so each user sees only their own posts
  await db.execute(sql`
    ALTER TABLE smm_scheduled_posts
      ADD COLUMN IF NOT EXISTS tool_user_id integer REFERENCES tool_users(id) ON DELETE SET NULL
  `);

  // ── Facebook Auto-Reply ───────────────────────────────────────────────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS facebook_pages (
      id               serial PRIMARY KEY,
      tool_user_id     integer NOT NULL REFERENCES tool_users(id) ON DELETE CASCADE,
      page_id          text NOT NULL,
      page_name        text NOT NULL,
      page_access_token text NOT NULL,
      user_access_token text,
      is_active        boolean NOT NULL DEFAULT true,
      connected_at     timestamptz NOT NULL DEFAULT now(),
      last_checked_at  timestamptz
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS facebook_messages (
      id               serial PRIMARY KEY,
      facebook_page_id integer NOT NULL REFERENCES facebook_pages(id) ON DELETE CASCADE,
      message_id       text NOT NULL UNIQUE,
      sender_id        text NOT NULL,
      sender_name      text,
      message_text     text NOT NULL,
      received_at      timestamptz NOT NULL,
      is_replied       boolean NOT NULL DEFAULT false,
      reply_text       text,
      replied_at       timestamptz,
      reply_type       text,
      rule_id          integer,
      error            text,
      created_at       timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS facebook_auto_reply_rules (
      id               serial PRIMARY KEY,
      facebook_page_id integer NOT NULL REFERENCES facebook_pages(id) ON DELETE CASCADE,
      rule_name        text NOT NULL,
      trigger_type     text NOT NULL DEFAULT 'all',
      trigger_keywords text,
      reply_mode       text NOT NULL DEFAULT 'template',
      reply_template   text,
      ai_instructions  text,
      priority         integer NOT NULL DEFAULT 0,
      is_active        boolean NOT NULL DEFAULT true,
      created_at       timestamptz NOT NULL DEFAULT now(),
      updated_at       timestamptz NOT NULL DEFAULT now()
    )
  `);

  // Seed Facebook webhook base URL default
  await db.execute(sql`
    INSERT INTO integrations (name, label, value, category)
    VALUES ('FACEBOOK_WEBHOOK_BASE_URL', 'App Base URL', 'https://advantix.digital', 'Facebook')
    ON CONFLICT (name) DO NOTHING
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
  { name: "TELEGRAM_TOOL_USER_ID",              label: "Telegram Bot Tool User ID",        value: "1",    category: "Notifications" },
  { name: "TELEGRAM_NOTIFICATIONS_ENABLED",     label: "Telegram Notifications Enabled",   value: "true", category: "Notifications" },
  { name: "TELEGRAM_NOTIFY_ASSISTANT_REQUEST",  label: "Human Agent Requested",            value: "true", category: "Notifications" },
  { name: "TELEGRAM_NOTIFY_NEW_CONTACT",        label: "New Contact Form",                 value: "true", category: "Notifications" },
  { name: "TELEGRAM_NOTIFY_CONTACT_ASSIGNED",   label: "Contact Assigned",                 value: "true", category: "Notifications" },
  { name: "TELEGRAM_NOTIFY_NEW_LEAD",           label: "New Lead",                         value: "true", category: "Notifications" },
  { name: "TELEGRAM_NOTIFY_BUG_REPORT",         label: "Bug Report",                       value: "true", category: "Notifications" },
  { name: "TELEGRAM_NOTIFY_TASK_CREATED",       label: "Task Created",                     value: "true", category: "Notifications" },
  { name: "TELEGRAM_NOTIFY_TASK_ASSIGNED",      label: "Task Assigned",                    value: "true", category: "Notifications" },
  { name: "TELEGRAM_NOTIFY_TASK_STATUS",        label: "Task Status Changed",              value: "true", category: "Notifications" },
  { name: "TELEGRAM_NOTIFY_TASK_COMMENT",       label: "Task Comment",                     value: "true", category: "Notifications" },
];

export async function seedPrivacyPolicy(): Promise<void> {
  const content = `
<style>
  .pp-wrap{font-family:inherit;color:inherit;max-width:780px;margin:0 auto;padding:2rem 1rem 4rem}
  .pp-hero{text-align:center;margin-bottom:2.5rem}
  .pp-hero h1{font-size:2.5rem;font-weight:800;margin-bottom:.75rem}
  .pp-hero p{color:#9ca3af;font-size:1.05rem;max-width:520px;margin:0 auto}
  .pp-scope{background:rgba(99,102,241,.07);border:1px solid rgba(99,102,241,.2);border-radius:14px;padding:1.1rem 1.4rem;margin-bottom:2.5rem;font-size:.9rem;color:#9ca3af;text-align:center;line-height:1.6}
  .pp-scope strong{color:#e5e7eb}
  .pp-section{border:1px solid rgba(255,255,255,.08);border-radius:16px;overflow:hidden;margin-bottom:1.5rem}
  .pp-section-header{padding:1rem 1.4rem;background:rgba(255,255,255,.03);border-bottom:1px solid rgba(255,255,255,.07)}
  .pp-section-header h2{font-size:1.05rem;font-weight:600;margin:0}
  .pp-section-body{padding:1.4rem 1.6rem}
  .pp-block{margin-bottom:1.4rem}
  .pp-block:last-child{margin-bottom:0}
  .pp-block h3{font-size:.88rem;font-weight:600;margin:0 0 .6rem;color:#e5e7eb}
  .pp-block ul{list-style:none;padding:0;margin:0}
  .pp-block ul li{display:flex;gap:.6rem;align-items:flex-start;font-size:.875rem;color:#9ca3af;margin-bottom:.45rem;line-height:1.55}
  .pp-block ul li::before{content:"›";color:#6366f1;flex-shrink:0;margin-top:1px;font-weight:700}
  .pp-contact{border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:2rem;text-align:center;margin-top:1.5rem}
  .pp-contact h2{font-size:1.2rem;font-weight:600;margin:.75rem 0 .5rem}
  .pp-contact p{color:#9ca3af;font-size:.875rem;margin-bottom:1.1rem}
  .pp-contact a{color:#818cf8;text-decoration:none;font-weight:500}
  .pp-footer{text-align:center;font-size:.75rem;color:#6b7280;margin-top:2rem}
</style>
<div class="pp-wrap">
  <div class="pp-hero">
    <h1>Privacy Policy</h1>
    <p>At Advantix Digital, your privacy matters. This policy explains exactly what information we collect, how we use it, and how we keep it safe.</p>
  </div>
  <div class="pp-scope">
    This Privacy Policy applies to <strong>advantix.digital</strong> and all services and tools operated by <strong>Advantix Digital</strong>, including the Facebook Auto-Reply tool, URL Shortener, Social Media Scheduler, and AI Assistant.
  </div>

  <div class="pp-section">
    <div class="pp-section-header"><h2>1. Information We Collect</h2></div>
    <div class="pp-section-body">
      <div class="pp-block">
        <h3>Information You Provide to Us</h3>
        <ul>
          <li>Name, email address, phone number, and message — when you submit the contact form or request a service.</li>
          <li>Email address and password — when you create an account on our Tools platform. Passwords are never stored in plain text; they are hashed using bcrypt.</li>
          <li>Service requirements, project details, or budget — when you request a specific service (used only to respond to you).</li>
        </ul>
      </div>
      <div class="pp-block">
        <h3>Data From Facebook (Facebook Auto-Reply Tool)</h3>
        <ul>
          <li>When you connect your Facebook Page to our Auto-Reply tool, we receive and store your Facebook Page access token and basic page information (page name, page ID) to enable automated messaging on your behalf.</li>
          <li>Incoming messages sent to your Facebook Page are temporarily processed to match auto-reply rules you set. We do not read, sell, or share these messages.</li>
          <li>We only request the minimum Facebook permissions required for the auto-reply feature to work.</li>
        </ul>
      </div>
      <div class="pp-block">
        <h3>Data From Other Tools</h3>
        <ul>
          <li>URL Shortener: The original URL you shorten and the number of times the short link is clicked.</li>
          <li>Social Media Scheduler: Post content and scheduling details you provide to schedule posts on your behalf.</li>
          <li>AI Assistant: Queries you send are processed in real time to generate responses. We do not store your conversation history beyond your current session.</li>
        </ul>
      </div>
      <div class="pp-block">
        <h3>Analytics (Optional)</h3>
        <ul>
          <li>If Google Analytics is enabled on the site, it may collect standard web analytics data (pages visited, session duration) as described in <a href="https://policies.google.com/privacy" target="_blank" rel="noopener">Google's Privacy Policy</a>. You can opt out using the Google Analytics Opt-out Browser Add-on.</li>
          <li>We use session cookies only to keep you logged in to our Tools platform.</li>
        </ul>
      </div>
    </div>
  </div>

  <div class="pp-section">
    <div class="pp-section-header"><h2>2. How We Use Your Information</h2></div>
    <div class="pp-section-body">
      <div class="pp-block">
        <ul>
          <li>To respond to your contact form submissions and service inquiries.</li>
          <li>To manage your account on our Tools platform.</li>
          <li>To operate the Facebook Auto-Reply tool — sending automated replies on your behalf using the rules you configure.</li>
          <li>To shorten URLs and track click counts for your short links.</li>
          <li>To schedule and publish social media content at the times you specify.</li>
          <li>To improve our services based on usage patterns (aggregate, non-personal data only).</li>
        </ul>
      </div>
    </div>
  </div>

  <div class="pp-section">
    <div class="pp-section-header"><h2>3. Sharing of Information</h2></div>
    <div class="pp-section-body">
      <div class="pp-block">
        <ul>
          <li>We do <strong>not</strong> sell, rent, or trade your personal information to any third party.</li>
          <li>Facebook Auto-Reply: To send automated replies, we communicate with Facebook's API on your behalf using the access token you provide. This is governed by <a href="https://www.facebook.com/policy" target="_blank" rel="noopener">Facebook's Data Policy</a>.</li>
          <li>We use trusted infrastructure providers (cloud hosting, database hosting) who process data only to provide the service and are bound by confidentiality.</li>
          <li>We may disclose data if required by law or a valid legal order.</li>
        </ul>
      </div>
    </div>
  </div>

  <div class="pp-section">
    <div class="pp-section-header"><h2>4. Data Security &amp; Retention</h2></div>
    <div class="pp-section-body">
      <div class="pp-block">
        <h3>Security</h3>
        <ul>
          <li>All data is transmitted over HTTPS.</li>
          <li>Passwords are hashed and never stored in readable form.</li>
          <li>Access to user data within our team is limited to what is necessary to operate the service.</li>
        </ul>
      </div>
      <div class="pp-block">
        <h3>Retention</h3>
        <ul>
          <li>Account data is retained while your account is active. You may request deletion at any time.</li>
          <li>Facebook page tokens and message logs are kept only as long as you have an active connection. Disconnecting your page removes your data from our system.</li>
          <li>Contact form submissions are retained to allow us to respond and follow up on your inquiry.</li>
        </ul>
      </div>
    </div>
  </div>

  <div class="pp-section">
    <div class="pp-section-header"><h2>5. Your Rights</h2></div>
    <div class="pp-section-body">
      <div class="pp-block">
        <ul>
          <li>You may request access to, correction of, or deletion of any personal data we hold about you.</li>
          <li>You may disconnect your Facebook Page from our Auto-Reply tool at any time through your account settings, which removes all associated data.</li>
          <li>You may delete your Tools account at any time by contacting us.</li>
          <li>To exercise any of these rights, contact us at <a href="mailto:hello@advantix.digital">hello@advantix.digital</a>.</li>
        </ul>
      </div>
    </div>
  </div>

  <div class="pp-section">
    <div class="pp-section-header"><h2>6. Changes to This Policy</h2></div>
    <div class="pp-section-body">
      <div class="pp-block">
        <ul>
          <li>We may update this policy when our services change. Material updates will be announced on our website.</li>
          <li>Continued use of our services after an update means you accept the revised policy.</li>
        </ul>
      </div>
    </div>
  </div>

  <div class="pp-contact">
    <h2>Contact Us</h2>
    <p>For any privacy-related questions or requests, please reach out.</p>
    <p><strong>Advantix Digital</strong> &nbsp;|&nbsp; <a href="https://advantix.digital">advantix.digital</a> &nbsp;|&nbsp; <a href="mailto:hello@advantix.digital">hello@advantix.digital</a></p>
  </div>
  <p class="pp-footer">© ${new Date().getFullYear()} Advantix Digital. All rights reserved.</p>
</div>
`;
  await db.execute(sql`
    INSERT INTO custom_pages (slug, title, type, description, content, is_published, is_public, meta_title, meta_description)
    VALUES (
      'privacy-policy',
      'Privacy Policy',
      'content',
      'Privacy Policy for Advantix Digital',
      ${content},
      true,
      true,
      'Privacy Policy — Advantix Digital',
      'Learn how Advantix Digital collects, uses, and protects your personal information.'
    )
    ON CONFLICT (slug) DO UPDATE SET content = EXCLUDED.content
  `);
  await db.execute(sql`UPDATE custom_pages SET is_public = true, is_published = true WHERE slug = 'privacy-policy'`);
  logger.info("Privacy policy page ensured");
}

export async function seedTermsOfService(): Promise<void> {
  const content = `
<style>
  .tos-wrap{font-family:inherit;color:inherit;max-width:780px;margin:0 auto;padding:2rem 1rem 4rem}
  .tos-hero{text-align:center;margin-bottom:2.5rem}
  .tos-hero h1{font-size:2.5rem;font-weight:800;margin-bottom:.75rem}
  .tos-hero p{color:#9ca3af;font-size:1.05rem;max-width:520px;margin:0 auto}
  .tos-scope{background:rgba(99,102,241,.07);border:1px solid rgba(99,102,241,.2);border-radius:14px;padding:1.1rem 1.4rem;margin-bottom:2.5rem;font-size:.9rem;color:#9ca3af;text-align:center;line-height:1.6}
  .tos-scope strong{color:#e5e7eb}
  .tos-section{border:1px solid rgba(255,255,255,.08);border-radius:16px;overflow:hidden;margin-bottom:1.5rem}
  .tos-section-header{padding:1rem 1.4rem;background:rgba(255,255,255,.03);border-bottom:1px solid rgba(255,255,255,.07)}
  .tos-section-header h2{font-size:1.05rem;font-weight:600;margin:0}
  .tos-section-body{padding:1.4rem 1.6rem}
  .tos-block{margin-bottom:1.4rem}
  .tos-block:last-child{margin-bottom:0}
  .tos-block h3{font-size:.88rem;font-weight:600;margin:0 0 .6rem;color:#e5e7eb}
  .tos-block ul{list-style:none;padding:0;margin:0}
  .tos-block ul li{display:flex;gap:.6rem;align-items:flex-start;font-size:.875rem;color:#9ca3af;margin-bottom:.45rem;line-height:1.55}
  .tos-block ul li::before{content:"›";color:#6366f1;flex-shrink:0;margin-top:1px;font-weight:700}
  .tos-contact{border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:2rem;text-align:center;margin-top:1.5rem}
  .tos-contact h2{font-size:1.2rem;font-weight:600;margin:.75rem 0 .5rem}
  .tos-contact p{color:#9ca3af;font-size:.875rem;margin-bottom:1.1rem}
  .tos-contact a{color:#818cf8;text-decoration:none;font-weight:500}
  .tos-footer{text-align:center;font-size:.75rem;color:#6b7280;margin-top:2rem}
</style>
<div class="tos-wrap">
  <div class="tos-hero">
    <h1>Terms of Service</h1>
    <p>Please read these terms carefully before using Advantix Digital's website or tools.</p>
  </div>
  <div class="tos-scope">
    These Terms of Service apply to <strong>advantix.digital</strong> and all tools and services operated by <strong>Advantix Digital</strong>. By using our services, you agree to these terms.
  </div>

  <div class="tos-section">
    <div class="tos-section-header"><h2>1. Acceptance of Terms</h2></div>
    <div class="tos-section-body">
      <div class="tos-block">
        <ul>
          <li>By accessing or using any part of advantix.digital or our tools platform, you agree to be bound by these Terms of Service.</li>
          <li>If you do not agree to these terms, please do not use our services.</li>
          <li>We reserve the right to update these terms at any time. Continued use of our services after changes means you accept the updated terms.</li>
        </ul>
      </div>
    </div>
  </div>

  <div class="tos-section">
    <div class="tos-section-header"><h2>2. Services Provided</h2></div>
    <div class="tos-section-body">
      <div class="tos-block">
        <ul>
          <li>Advantix Digital provides digital marketing services including Facebook marketing, social media management, website development, graphics &amp; branding, CRM integration, automation, and related services.</li>
          <li>We also provide a Tools platform including a Facebook Auto-Reply tool, URL Shortener, Social Media Scheduler, and AI Assistant.</li>
          <li>Services are provided as described on our website and in individual project agreements. We reserve the right to modify or discontinue any service at any time.</li>
        </ul>
      </div>
    </div>
  </div>

  <div class="tos-section">
    <div class="tos-section-header"><h2>3. User Responsibilities</h2></div>
    <div class="tos-section-body">
      <div class="tos-block">
        <h3>Acceptable Use</h3>
        <ul>
          <li>You agree to use our services only for lawful purposes and in accordance with these terms.</li>
          <li>You must not use our services to send spam, misleading content, or any material that violates applicable laws or Facebook's Platform Policies.</li>
          <li>You are responsible for maintaining the confidentiality of your account credentials.</li>
        </ul>
      </div>
      <div class="tos-block">
        <h3>Facebook Auto-Reply Tool</h3>
        <ul>
          <li>When using the Facebook Auto-Reply tool, you confirm that you are the authorized administrator of the Facebook Page you connect.</li>
          <li>You are solely responsible for the auto-reply messages you configure. These messages must comply with Facebook's Messaging Policies.</li>
          <li>You may disconnect your Facebook Page from our tool at any time through your account settings.</li>
        </ul>
      </div>
    </div>
  </div>

  <div class="tos-section">
    <div class="tos-section-header"><h2>4. Intellectual Property</h2></div>
    <div class="tos-section-body">
      <div class="tos-block">
        <ul>
          <li>All content, branding, and software on advantix.digital is the property of Advantix Digital unless otherwise stated.</li>
          <li>Deliverables created for clients (e.g., graphics, websites, content) are transferred to the client upon full payment as agreed in the project contract.</li>
          <li>You may not copy, reproduce, or redistribute any part of our platform or tools without written permission.</li>
        </ul>
      </div>
    </div>
  </div>

  <div class="tos-section">
    <div class="tos-section-header"><h2>5. Limitation of Liability</h2></div>
    <div class="tos-section-body">
      <div class="tos-block">
        <ul>
          <li>Advantix Digital provides its services "as is." We do not guarantee uninterrupted or error-free operation of our tools or platform.</li>
          <li>We are not responsible for any indirect, incidental, or consequential damages arising from use of our services.</li>
          <li>Our total liability for any claim related to our services shall not exceed the amount you paid us for the relevant service in the 30 days prior to the claim.</li>
        </ul>
      </div>
    </div>
  </div>

  <div class="tos-section">
    <div class="tos-section-header"><h2>6. Termination</h2></div>
    <div class="tos-section-body">
      <div class="tos-block">
        <ul>
          <li>We reserve the right to suspend or terminate your access to our tools if you violate these Terms of Service.</li>
          <li>You may close your account at any time by contacting us at <a href="mailto:hello@advantix.digital">hello@advantix.digital</a>.</li>
        </ul>
      </div>
    </div>
  </div>

  <div class="tos-section">
    <div class="tos-section-header"><h2>7. Governing Law</h2></div>
    <div class="tos-section-body">
      <div class="tos-block">
        <ul>
          <li>These Terms of Service are governed by applicable law. Any disputes will be resolved through good-faith negotiation first.</li>
        </ul>
      </div>
    </div>
  </div>

  <div class="tos-contact">
    <h2>Questions?</h2>
    <p>If you have any questions about these Terms of Service, please contact us.</p>
    <p><strong>Advantix Digital</strong> &nbsp;|&nbsp; <a href="https://advantix.digital">advantix.digital</a> &nbsp;|&nbsp; <a href="mailto:hello@advantix.digital">hello@advantix.digital</a></p>
  </div>
  <p class="tos-footer">© ${new Date().getFullYear()} Advantix Digital. All rights reserved.</p>
</div>
`;
  await db.execute(sql`
    INSERT INTO custom_pages (slug, title, type, description, content, is_published, is_public, meta_title, meta_description)
    VALUES (
      'terms-of-service',
      'Terms of Service',
      'content',
      'Terms of Service for Advantix Digital',
      ${content},
      true,
      true,
      'Terms of Service — Advantix Digital',
      'Read the Terms of Service for Advantix Digital and our tools platform.'
    )
    ON CONFLICT (slug) DO UPDATE SET content = EXCLUDED.content, type = EXCLUDED.type
  `);
  await db.execute(sql`UPDATE custom_pages SET is_public = true, is_published = true WHERE slug = 'terms-of-service'`);
  logger.info("Terms of service page ensured");
}

export async function seedDataDeletion(): Promise<void> {
  const content = `
<style>
  .dd-wrap{font-family:inherit;color:inherit;max-width:780px;margin:0 auto;padding:2rem 1rem 4rem}
  .dd-hero{text-align:center;margin-bottom:2.5rem}
  .dd-hero h1{font-size:2.5rem;font-weight:800;margin-bottom:.75rem}
  .dd-hero p{color:#9ca3af;font-size:1.05rem;max-width:520px;margin:0 auto}
  .dd-card{border:1px solid rgba(99,102,241,.3);border-radius:16px;padding:2rem;margin-bottom:1.5rem;background:rgba(99,102,241,.05)}
  .dd-card h2{font-size:1.15rem;font-weight:700;margin:0 0 1rem}
  .dd-card ul{list-style:none;padding:0;margin:0}
  .dd-card ul li{display:flex;gap:.6rem;align-items:flex-start;font-size:.9rem;color:#9ca3af;margin-bottom:.6rem;line-height:1.6}
  .dd-card ul li::before{content:"›";color:#6366f1;flex-shrink:0;margin-top:2px;font-weight:700}
  .dd-steps{border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:2rem;margin-bottom:1.5rem}
  .dd-steps h2{font-size:1.15rem;font-weight:700;margin:0 0 1.2rem}
  .dd-step{display:flex;gap:1rem;margin-bottom:1.2rem;align-items:flex-start}
  .dd-step:last-child{margin-bottom:0}
  .dd-step-num{background:#6366f1;color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:.8rem;font-weight:700;flex-shrink:0;margin-top:1px}
  .dd-step-text{font-size:.9rem;color:#9ca3af;line-height:1.6}
  .dd-step-text strong{color:#e5e7eb}
  .dd-contact{border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:2rem;text-align:center;margin-top:1.5rem}
  .dd-contact h2{font-size:1.15rem;font-weight:600;margin:.5rem 0 .5rem}
  .dd-contact p{color:#9ca3af;font-size:.875rem;margin-bottom:1rem}
  .dd-contact a{color:#818cf8;text-decoration:none;font-weight:500}
  .dd-footer{text-align:center;font-size:.75rem;color:#6b7280;margin-top:2rem}
</style>
<div class="dd-wrap">
  <div class="dd-hero">
    <h1>Data Deletion Request</h1>
    <p>You have the right to request deletion of your personal data from Advantix Digital's systems at any time.</p>
  </div>

  <div class="dd-card">
    <h2>What Data We Hold</h2>
    <ul>
      <li>Contact form submissions (name, email, phone, message)</li>
      <li>Tool platform account data (email, hashed password)</li>
      <li>Facebook Page access token and page info (if you connected a Facebook Page)</li>
      <li>Auto-reply rules you created</li>
      <li>Shortened URLs you created and their click counts</li>
      <li>Scheduled social media posts</li>
    </ul>
  </div>

  <div class="dd-steps">
    <h2>How to Request Data Deletion</h2>
    <div class="dd-step">
      <div class="dd-step-num">1</div>
      <div class="dd-step-text">Send an email to <strong><a href="mailto:hello@advantix.digital">hello@advantix.digital</a></strong> with the subject line <strong>"Data Deletion Request"</strong>.</div>
    </div>
    <div class="dd-step">
      <div class="dd-step-num">2</div>
      <div class="dd-step-text">Include the email address associated with your account or the Facebook Page ID you connected, so we can locate your data.</div>
    </div>
    <div class="dd-step">
      <div class="dd-step-num">3</div>
      <div class="dd-step-text">We will confirm receipt within <strong>48 hours</strong> and complete the deletion within <strong>30 days</strong>.</div>
    </div>
    <div class="dd-step">
      <div class="dd-step-num">4</div>
      <div class="dd-step-text">You will receive a confirmation email once your data has been permanently removed from our systems.</div>
    </div>
  </div>

  <div class="dd-card">
    <h2>Facebook Users</h2>
    <ul>
      <li>If you used Facebook Login or connected your Facebook Page to our Auto-Reply tool, you can also remove our app's access directly from your Facebook account: go to <strong>Facebook Settings → Apps and Websites → Advantix Digital → Remove</strong>.</li>
      <li>After removing app access from Facebook, your Facebook access token is automatically invalidated. To also remove stored data from our servers, please send us a deletion request as described above.</li>
    </ul>
  </div>

  <div class="dd-contact">
    <h2>Contact Us</h2>
    <p>For data deletion requests or any privacy concerns, reach out to us directly.</p>
    <p><strong>Advantix Digital</strong> &nbsp;|&nbsp; <a href="mailto:hello@advantix.digital">hello@advantix.digital</a></p>
  </div>
  <p class="dd-footer">© ${new Date().getFullYear()} Advantix Digital. All rights reserved.</p>
</div>
`;
  await db.execute(sql`
    INSERT INTO custom_pages (slug, title, type, description, content, is_published, is_public, meta_title, meta_description)
    VALUES (
      'data-deletion',
      'Data Deletion Request',
      'content',
      'How to request deletion of your personal data from Advantix Digital',
      ${content},
      true,
      true,
      'Data Deletion Request — Advantix Digital',
      'Learn how to request deletion of your personal data from Advantix Digital.'
    )
    ON CONFLICT (slug) DO UPDATE SET content = EXCLUDED.content, type = EXCLUDED.type
  `);
  await db.execute(sql`UPDATE custom_pages SET is_public = true, is_published = true WHERE slug = 'data-deletion'`);
  logger.info("Data deletion page ensured");
}

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
