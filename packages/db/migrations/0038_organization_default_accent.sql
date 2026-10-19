CREATE TYPE "public"."accent" AS ENUM('violet', 'blue', 'teal', 'pink', 'lime');--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "default_accent" "accent" DEFAULT 'violet' NOT NULL;