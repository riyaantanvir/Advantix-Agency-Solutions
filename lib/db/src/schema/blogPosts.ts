import { pgTable, serial, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const blogPostsTable = pgTable("blog_posts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  excerpt: text("excerpt"),
  content: text("content").notNull().default(""),
  coverImageUrl: text("cover_image_url"),
  author: text("author").notNull().default("Advantix Team"),
  category: text("category").notNull().default("General"),
  tags: text("tags"),
  status: text("status").notNull().default("draft"),
  readingTime: text("reading_time"),
  seoTitle: text("seo_title"),
  seoDescription: text("seo_description"),
  featured: boolean("featured").notNull().default(false),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertBlogPostSchema = createInsertSchema(blogPostsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type BlogPost = typeof blogPostsTable.$inferSelect;
export type InsertBlogPost = z.infer<typeof insertBlogPostSchema>;
