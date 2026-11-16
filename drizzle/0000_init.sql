CREATE TYPE "public"."audit_action" AS ENUM('setup.token_printed', 'setup.claim_attempted', 'setup.owner_created', 'setup.first_run_completed');--> statement-breakpoint
CREATE TYPE "public"."audit_actor" AS ENUM('owner', 'nobody', 'app');--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "owner" (
	"id" smallint PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "owner_one_row" CHECK ("owner"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"action" "audit_action" NOT NULL,
	"actor" "audit_actor" NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"client_address" text,
	"user_agent" text,
	"request_id" text
);
--> statement-breakpoint
CREATE INDEX "audit_log_at" ON "audit_log" USING btree ("at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_log_action_at" ON "audit_log" USING btree ("action","at" DESC NULLS LAST);
