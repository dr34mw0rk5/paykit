CREATE TABLE "paykit_customer" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text,
	"name" text,
	"metadata" jsonb,
	"provider" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"deleted_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paykit_entitlement" (
	"id" text PRIMARY KEY NOT NULL,
	"subscription_id" text,
	"customer_id" text NOT NULL,
	"feature_id" text NOT NULL,
	"limit" integer,
	"balance" integer,
	"next_reset_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paykit_feature" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paykit_invoice" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"subscription_id" text,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text NOT NULL,
	"description" text,
	"hosted_url" text,
	"provider_id" text NOT NULL,
	"provider_data" jsonb NOT NULL,
	"period_start_at" timestamp,
	"period_end_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paykit_metadata" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"type" text NOT NULL,
	"data" jsonb NOT NULL,
	"provider_checkout_session_id" text,
	"expires_at" timestamp,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paykit_payment_method" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"provider_data" jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paykit_product" (
	"internal_id" text PRIMARY KEY NOT NULL,
	"id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"group" text DEFAULT '' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"price_amount" integer,
	"price_interval" text,
	"provider" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paykit_product_feature" (
	"product_internal_id" text NOT NULL,
	"feature_id" text NOT NULL,
	"limit" integer,
	"reset_interval" text,
	"config" jsonb,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "paykit_product_feature_product_internal_id_feature_id_pk" PRIMARY KEY("product_internal_id","feature_id")
);
--> statement-breakpoint
CREATE TABLE "paykit_subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"product_internal_id" text NOT NULL,
	"provider_id" text,
	"provider_data" jsonb,
	"status" text NOT NULL,
	"canceled" boolean DEFAULT false NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"started_at" timestamp,
	"trial_ends_at" timestamp,
	"current_period_start_at" timestamp,
	"current_period_end_at" timestamp,
	"canceled_at" timestamp,
	"ended_at" timestamp,
	"scheduled_product_id" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paykit_webhook_event" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"trace_id" text,
	"received_at" timestamp NOT NULL,
	"processed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "paykit_entitlement" ADD CONSTRAINT "paykit_entitlement_subscription_id_paykit_subscription_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."paykit_subscription"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paykit_entitlement" ADD CONSTRAINT "paykit_entitlement_customer_id_paykit_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."paykit_customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paykit_entitlement" ADD CONSTRAINT "paykit_entitlement_feature_id_paykit_feature_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."paykit_feature"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paykit_invoice" ADD CONSTRAINT "paykit_invoice_customer_id_paykit_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."paykit_customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paykit_invoice" ADD CONSTRAINT "paykit_invoice_subscription_id_paykit_subscription_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."paykit_subscription"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paykit_payment_method" ADD CONSTRAINT "paykit_payment_method_customer_id_paykit_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."paykit_customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paykit_product_feature" ADD CONSTRAINT "paykit_product_feature_product_internal_id_paykit_product_internal_id_fk" FOREIGN KEY ("product_internal_id") REFERENCES "public"."paykit_product"("internal_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paykit_product_feature" ADD CONSTRAINT "paykit_product_feature_feature_id_paykit_feature_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."paykit_feature"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paykit_subscription" ADD CONSTRAINT "paykit_subscription_customer_id_paykit_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."paykit_customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paykit_subscription" ADD CONSTRAINT "paykit_subscription_product_internal_id_paykit_product_internal_id_fk" FOREIGN KEY ("product_internal_id") REFERENCES "public"."paykit_product"("internal_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "paykit_customer_deleted_at_idx" ON "paykit_customer" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "paykit_entitlement_subscription_idx" ON "paykit_entitlement" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "paykit_entitlement_customer_feature_idx" ON "paykit_entitlement" USING btree ("customer_id","feature_id");--> statement-breakpoint
CREATE INDEX "paykit_entitlement_next_reset_idx" ON "paykit_entitlement" USING btree ("next_reset_at");--> statement-breakpoint
CREATE INDEX "paykit_invoice_customer_idx" ON "paykit_invoice" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE INDEX "paykit_invoice_subscription_idx" ON "paykit_invoice" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "paykit_invoice_provider_idx" ON "paykit_invoice" USING btree ("provider_id");--> statement-breakpoint
CREATE UNIQUE INDEX "paykit_metadata_checkout_session_unique" ON "paykit_metadata" USING btree ("provider_id","provider_checkout_session_id");--> statement-breakpoint
CREATE INDEX "paykit_payment_method_customer_idx" ON "paykit_payment_method" USING btree ("customer_id","deleted_at");--> statement-breakpoint
CREATE INDEX "paykit_payment_method_provider_idx" ON "paykit_payment_method" USING btree ("provider_id");--> statement-breakpoint
CREATE UNIQUE INDEX "paykit_product_id_version_unique" ON "paykit_product" USING btree ("id","version");--> statement-breakpoint
CREATE INDEX "paykit_product_default_idx" ON "paykit_product" USING btree ("is_default");--> statement-breakpoint
CREATE INDEX "paykit_product_feature_feature_idx" ON "paykit_product_feature" USING btree ("feature_id");--> statement-breakpoint
CREATE INDEX "paykit_subscription_customer_status_idx" ON "paykit_subscription" USING btree ("customer_id","status","ended_at");--> statement-breakpoint
CREATE INDEX "paykit_subscription_product_idx" ON "paykit_subscription" USING btree ("product_internal_id");--> statement-breakpoint
CREATE INDEX "paykit_subscription_provider_idx" ON "paykit_subscription" USING btree ("provider_id");--> statement-breakpoint
CREATE UNIQUE INDEX "paykit_webhook_event_provider_unique" ON "paykit_webhook_event" USING btree ("provider_id","provider_event_id");--> statement-breakpoint
CREATE INDEX "paykit_webhook_event_status_idx" ON "paykit_webhook_event" USING btree ("provider_id","status");