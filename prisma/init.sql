-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'PIMPINAN', 'STAFF');

-- CreateEnum
CREATE TYPE "SourceStatusCategory" AS ENUM ('BARU', 'PROSES', 'SELESAI', 'DIBATALKAN', 'LAINNYA');

-- CreateEnum
CREATE TYPE "MonitoringStatus" AS ENUM ('BELUM_SELESAI', 'SELESAI', 'DIBATALKAN');

-- CreateEnum
CREATE TYPE "StatusSource" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "ProcessType" AS ENUM ('DAILY_SCRAPE', 'STATUS_SYNC', 'MONTHLY_REVIEW');

-- CreateEnum
CREATE TYPE "ProcessStatus" AS ENUM ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'DONE', 'SKIPPED');

-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('SCRAPE_SUCCESS', 'SCRAPE_FAILED', 'DEADLINE_TOMORROW', 'ORDER_OVERDUE', 'MONTHLY_REVIEW_DONE', 'REVIEW_PENDING', 'STALE_ORDER', 'SYNC_ERROR');

-- CreateEnum
CREATE TYPE "MonthlyReviewStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'STAFF',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "session_token_hash" TEXT NOT NULL,
    "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "branch_name" TEXT NOT NULL,
    "branch_code" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "source_order_id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "customer_phone" TEXT,
    "product_name" TEXT NOT NULL,
    "order_date" DATE NOT NULL,
    "deadline_date" DATE,
    "source_status" TEXT NOT NULL,
    "source_status_category" "SourceStatusCategory" NOT NULL DEFAULT 'LAINNYA',
    "monitoring_status" "MonitoringStatus" NOT NULL DEFAULT 'BELUM_SELESAI',
    "monitoring_status_source" "StatusSource",
    "monitoring_status_changed_at" TIMESTAMP(3),
    "manual_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "manual_confirmed_by" TEXT,
    "manual_confirmed_at" TIMESTAMP(3),
    "last_scraped_at" TIMESTAMP(3),
    "source_url" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_snapshots" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "source_data" JSONB NOT NULL,
    "source_status" TEXT NOT NULL,
    "scraped_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scraping_logs" (
    "id" TEXT NOT NULL,
    "process_type" "ProcessType" NOT NULL,
    "status" "ProcessStatus" NOT NULL DEFAULT 'RUNNING',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "total_found" INTEGER NOT NULL DEFAULT 0,
    "total_created" INTEGER NOT NULL DEFAULT 0,
    "total_updated" INTEGER NOT NULL DEFAULT 0,
    "total_skipped" INTEGER NOT NULL DEFAULT 0,
    "total_failed" INTEGER NOT NULL DEFAULT 0,
    "target_date" DATE,
    "retry_of_id" TEXT,
    "triggered_by" TEXT,
    "error_message" TEXT,
    "detail" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scraping_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_reviews" (
    "id" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "status" "MonthlyReviewStatus" NOT NULL DEFAULT 'RUNNING',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "total_orders" INTEGER NOT NULL DEFAULT 0,
    "total_checked" INTEGER NOT NULL DEFAULT 0,
    "total_pending" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT,
    "scraping_log_id" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monthly_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_items" (
    "id" TEXT NOT NULL,
    "monthly_review_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "review_status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "checked_by" TEXT,
    "checked_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "description" TEXT,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "related_url" TEXT,
    "dedupe_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_is_active_idx" ON "users"("role", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_session_token_hash_key" ON "user_sessions"("session_token_hash");

-- CreateIndex
CREATE INDEX "user_sessions_user_id_revoked_at_idx" ON "user_sessions"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "user_sessions_expires_at_idx" ON "user_sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "branches_branch_code_key" ON "branches"("branch_code");

-- CreateIndex
CREATE INDEX "orders_order_date_idx" ON "orders"("order_date");

-- CreateIndex
CREATE INDEX "orders_deadline_date_idx" ON "orders"("deadline_date");

-- CreateIndex
CREATE INDEX "orders_branch_id_order_date_idx" ON "orders"("branch_id", "order_date");

-- CreateIndex
CREATE INDEX "orders_monitoring_status_deadline_date_idx" ON "orders"("monitoring_status", "deadline_date");

-- CreateIndex
CREATE INDEX "orders_source_status_category_idx" ON "orders"("source_status_category");

-- CreateIndex
CREATE INDEX "orders_order_number_idx" ON "orders"("order_number");

-- CreateIndex
CREATE INDEX "orders_customer_name_idx" ON "orders"("customer_name");

-- CreateIndex
CREATE UNIQUE INDEX "orders_branch_id_source_order_id_key" ON "orders"("branch_id", "source_order_id");

-- CreateIndex
CREATE INDEX "order_snapshots_order_id_scraped_at_idx" ON "order_snapshots"("order_id", "scraped_at");

-- CreateIndex
CREATE INDEX "scraping_logs_process_type_started_at_idx" ON "scraping_logs"("process_type", "started_at");

-- CreateIndex
CREATE INDEX "scraping_logs_status_idx" ON "scraping_logs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_reviews_year_month_key" ON "monthly_reviews"("year", "month");

-- CreateIndex
CREATE INDEX "review_items_branch_id_review_status_idx" ON "review_items"("branch_id", "review_status");

-- CreateIndex
CREATE UNIQUE INDEX "review_items_monthly_review_id_order_id_key" ON "review_items"("monthly_review_id", "order_id");

-- CreateIndex
CREATE INDEX "activity_logs_user_id_created_at_idx" ON "activity_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "activity_logs_entity_type_entity_id_idx" ON "activity_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedupe_key_key" ON "notifications"("dedupe_key");

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_created_at_idx" ON "notifications"("user_id", "is_read", "created_at");

-- CreateIndex
CREATE INDEX "notifications_type_created_at_idx" ON "notifications"("type", "created_at");

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_manual_confirmed_by_fkey" FOREIGN KEY ("manual_confirmed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_snapshots" ADD CONSTRAINT "order_snapshots_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_reviews" ADD CONSTRAINT "monthly_reviews_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_items" ADD CONSTRAINT "review_items_monthly_review_id_fkey" FOREIGN KEY ("monthly_review_id") REFERENCES "monthly_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_items" ADD CONSTRAINT "review_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_items" ADD CONSTRAINT "review_items_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_items" ADD CONSTRAINT "review_items_checked_by_fkey" FOREIGN KEY ("checked_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

