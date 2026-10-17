CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"checksum" text NOT NULL,
	"creator_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attachments_size_positive" CHECK ("attachments"."size_bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"body" text NOT NULL,
	"creator_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comments_body_not_empty" CHECK ("comments"."body" <> '')
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_issue_fk" FOREIGN KEY ("org_id","issue_id") REFERENCES "public"."issues"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_creator_fk" FOREIGN KEY ("org_id","creator_id") REFERENCES "public"."members"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_issue_fk" FOREIGN KEY ("org_id","issue_id") REFERENCES "public"."issues"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_creator_fk" FOREIGN KEY ("org_id","creator_id") REFERENCES "public"."members"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_issue_id_idx" ON "attachments" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "comments_issue_id_idx" ON "comments" USING btree ("issue_id");