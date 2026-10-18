CREATE TABLE "inbox" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"actor_id" uuid,
	"issue_id" uuid NOT NULL,
	"comment_id" uuid,
	"type" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inbox" ADD CONSTRAINT "inbox_org_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox" ADD CONSTRAINT "inbox_recipient_fk" FOREIGN KEY ("org_id","recipient_id") REFERENCES "public"."members"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox" ADD CONSTRAINT "inbox_actor_fk" FOREIGN KEY ("org_id","actor_id") REFERENCES "public"."members"("org_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox" ADD CONSTRAINT "inbox_issue_fk" FOREIGN KEY ("org_id","issue_id") REFERENCES "public"."issues"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox" ADD CONSTRAINT "inbox_comment_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inbox_org_recipient_read_idx" ON "inbox" USING btree ("org_id","recipient_id","read_at");--> statement-breakpoint
CREATE INDEX "inbox_org_recipient_created_idx" ON "inbox" USING btree ("org_id","recipient_id","created_at");--> statement-breakpoint
CREATE INDEX "inbox_issue_idx" ON "inbox" USING btree ("issue_id");
