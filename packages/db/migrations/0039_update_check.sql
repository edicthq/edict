ALTER TABLE "instance_settings" ADD COLUMN "update_check" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "latest_release" jsonb;--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "update_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "update_check_error" text;