ALTER TABLE "inbox" ALTER COLUMN "issue_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "inbox" ADD COLUMN "event_id" uuid;--> statement-breakpoint
ALTER TABLE "inbox" ADD COLUMN "webhook_id" uuid;--> statement-breakpoint
ALTER TABLE "inbox" ADD CONSTRAINT "inbox_event_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox" ADD CONSTRAINT "inbox_webhook_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."webhooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox" ADD CONSTRAINT "inbox_has_subject" CHECK ("inbox"."issue_id" IS NOT NULL OR "inbox"."webhook_id" IS NOT NULL);