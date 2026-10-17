CREATE TYPE "public"."relation_type" AS ENUM('blocks', 'related', 'duplicate_of');--> statement-breakpoint
CREATE TABLE "issue_labels" (
	"org_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"label_id" uuid NOT NULL,
	CONSTRAINT "issue_labels_issue_id_label_id_pk" PRIMARY KEY("issue_id","label_id")
);
--> statement-breakpoint
CREATE TABLE "issue_relations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"type" "relation_type" NOT NULL,
	"issue_id" uuid NOT NULL,
	"related_issue_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issue_relations_pair_unique" UNIQUE("issue_id","related_issue_id","type"),
	CONSTRAINT "issue_relations_not_self" CHECK ("issue_relations"."issue_id" <> "issue_relations"."related_issue_id"),
	CONSTRAINT "issue_relations_related_ordered" CHECK ("issue_relations"."type" <> 'related' OR "issue_relations"."issue_id" < "issue_relations"."related_issue_id")
);
--> statement-breakpoint
CREATE TABLE "labels" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"team_id" uuid,
	"name" text NOT NULL,
	"hue" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "labels_org_id_id_unique" UNIQUE("org_id","id"),
	CONSTRAINT "labels_hue" CHECK ("labels"."hue" BETWEEN 0 AND 359)
);
--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "issue_labels" ADD CONSTRAINT "issue_labels_issue_fk" FOREIGN KEY ("org_id","issue_id") REFERENCES "public"."issues"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_labels" ADD CONSTRAINT "issue_labels_label_fk" FOREIGN KEY ("org_id","label_id") REFERENCES "public"."labels"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_relations" ADD CONSTRAINT "issue_relations_issue_fk" FOREIGN KEY ("org_id","issue_id") REFERENCES "public"."issues"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_relations" ADD CONSTRAINT "issue_relations_related_issue_fk" FOREIGN KEY ("org_id","related_issue_id") REFERENCES "public"."issues"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_relations" ADD CONSTRAINT "issue_relations_creator_fk" FOREIGN KEY ("org_id","creator_id") REFERENCES "public"."members"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_team_fk" FOREIGN KEY ("org_id","team_id") REFERENCES "public"."teams"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "issue_labels_label_id_idx" ON "issue_labels" USING btree ("label_id");--> statement-breakpoint
CREATE INDEX "issue_relations_related_issue_id_idx" ON "issue_relations" USING btree ("related_issue_id");--> statement-breakpoint
CREATE UNIQUE INDEX "labels_org_name_unique" ON "labels" USING btree ("org_id",lower("name")) WHERE "labels"."team_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "labels_team_name_unique" ON "labels" USING btree ("team_id",lower("name")) WHERE "labels"."team_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_parent_fk" FOREIGN KEY ("org_id","parent_id") REFERENCES "public"."issues"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "issues_parent_id_idx" ON "issues" USING btree ("parent_id");--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_not_own_parent" CHECK ("issues"."parent_id" <> "issues"."id");