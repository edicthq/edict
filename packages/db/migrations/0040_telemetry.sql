ALTER TABLE "instance_settings" ADD COLUMN "telemetry" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "telemetry_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "telemetry_error" text;