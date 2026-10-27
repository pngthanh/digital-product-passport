-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "system_role" AS ENUM ('ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('ACTIVE', 'LOCKED', 'DELETED');

-- CreateEnum
CREATE TYPE "org_type" AS ENUM ('MANUFACTURER', 'RETAILER', 'SERVICE_CENTER', 'INSPECTOR');

-- CreateEnum
CREATE TYPE "auth_status" AS ENUM ('PENDING', 'AUTHORIZED', 'REJECTED', 'DISABLED');

-- CreateEnum
CREATE TYPE "party_type" AS ENUM ('USER', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "custody_type" AS ENUM ('CUSTODIAL', 'NON_CUSTODIAL');

-- CreateEnum
CREATE TYPE "wallet_role" AS ENUM ('OWNER', 'OPERATIONAL', 'PERSONAL');

-- CreateEnum
CREATE TYPE "wallet_status" AS ENUM ('PENDING', 'ACTIVE', 'ROTATED', 'REVOKED');

-- CreateEnum
CREATE TYPE "fee_action" AS ENUM ('ORG_REGISTRATION');

-- CreateEnum
CREATE TYPE "fee_status" AS ENUM ('ESCROWED', 'SETTLED', 'REFUNDABLE', 'REFUNDED');

-- CreateEnum
CREATE TYPE "product_state" AS ENUM ('CREATED', 'IN_DISTRIBUTION', 'AT_RETAIL', 'SOLD', 'RECALLED', 'LOST_STOLEN', 'RETIRED');

-- CreateEnum
CREATE TYPE "warranty_state" AS ENUM ('ACTIVE', 'SUSPENDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "service_state" AS ENUM ('REQUESTED', 'IN_REPAIR', 'REPAIRED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "transfer_state" AS ENUM ('REQUESTED', 'COMPLETED', 'REJECTED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "inspection_result" AS ENUM ('PASS', 'FAIL', 'CONDITIONAL');

-- CreateEnum
CREATE TYPE "sync_status" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED');

-- CreateEnum
CREATE TYPE "tx_status" AS ENUM ('QUEUED', 'SUBMITTED', 'CONFIRMED', 'REVERTED', 'FAILED');

-- CreateEnum
CREATE TYPE "finality_status" AS ENUM ('PENDING', 'FINALIZED', 'ORPHANED');

-- CreateEnum
CREATE TYPE "notification_channel" AS ENUM ('IN_APP', 'EMAIL');

-- CreateEnum
CREATE TYPE "notification_status" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "anomaly_severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "alert_status" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'DISMISSED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "full_name" VARCHAR(255) NOT NULL,
    "system_role" "system_role" NOT NULL DEFAULT 'USER',
    "status" "user_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "tax_code" VARCHAR(32) NOT NULL,
    "org_type" "org_type" NOT NULL,
    "contact_email" VARCHAR(255) NOT NULL,
    "contact_phone" VARCHAR(32),
    "address" VARCHAR(500),
    "profile_hash" CHAR(66),
    "auth_status" "auth_status" NOT NULL DEFAULT 'PENDING',
    "applied_at" TIMESTAMPTZ(6),
    "approved_at" TIMESTAMPTZ(6),
    "rejected_at" TIMESTAMPTZ(6),
    "disabled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parties" (
    "id" UUID NOT NULL,
    "party_type" "party_type" NOT NULL,
    "user_id" UUID,
    "organization_id" UUID,
    "chain_party_id" CHAR(66),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "parties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "party_wallets" (
    "id" UUID NOT NULL,
    "party_id" UUID NOT NULL,
    "address" CHAR(42) NOT NULL,
    "custody_type" "custody_type" NOT NULL,
    "wallet_role" "wallet_role" NOT NULL,
    "status" "wallet_status" NOT NULL DEFAULT 'PENDING',
    "activated_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "link_tx_hash" CHAR(66),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "party_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custodial_keys" (
    "wallet_id" UUID NOT NULL,
    "ciphertext" BYTEA NOT NULL,
    "iv" BYTEA NOT NULL,
    "auth_tag" BYTEA NOT NULL,
    "key_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custodial_keys_pkey" PRIMARY KEY ("wallet_id")
);

-- CreateTable
CREATE TABLE "fee_policies" (
    "action" "fee_action" NOT NULL,
    "amount_wei" DECIMAL(78,0) NOT NULL,
    "treasury_address" CHAR(42) NOT NULL,
    "updated_tx_hash" CHAR(66) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "fee_policies_pkey" PRIMARY KEY ("action")
);

-- CreateTable
CREATE TABLE "fee_payments" (
    "id" UUID NOT NULL,
    "party_id" UUID NOT NULL,
    "action" "fee_action" NOT NULL,
    "amount_wei" DECIMAL(78,0) NOT NULL,
    "payer_address" CHAR(42) NOT NULL,
    "fee_status" "fee_status" NOT NULL,
    "paid_tx_hash" CHAR(66) NOT NULL,
    "settled_tx_hash" CHAR(66),
    "refund_tx_hash" CHAR(66),
    "paid_at" TIMESTAMPTZ(6) NOT NULL,
    "settled_at" TIMESTAMPTZ(6),
    "refunded_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "fee_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "chain_product_id" CHAR(66) NOT NULL,
    "serial_number" VARCHAR(100) NOT NULL,
    "public_code" VARCHAR(32) NOT NULL,
    "model_name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "metadata_hash" CHAR(66) NOT NULL,
    "issuer_org_id" UUID NOT NULL,
    "product_state" "product_state",
    "current_custodian_party_id" UUID,
    "pending_custodian_party_id" UUID,
    "current_owner_party_id" UUID,
    "created_tx_hash" CHAR(66),
    "sync_status" "sync_status" NOT NULL DEFAULT 'PENDING',
    "onchain_created_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custody_records" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "from_party_id" UUID,
    "to_party_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "transferred_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custody_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ownership_records" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "from_party_id" UUID,
    "to_party_id" UUID NOT NULL,
    "transfer_request_id" UUID,
    "event_id" UUID NOT NULL,
    "transferred_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ownership_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warranties" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "activated_by_party_id" UUID NOT NULL,
    "activated_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "warranty_state" "warranty_state" NOT NULL,
    "activation_tx_hash" CHAR(66) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "warranties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_requests" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "requested_by_party_id" UUID NOT NULL,
    "service_center_org_id" UUID NOT NULL,
    "issue_desc" TEXT NOT NULL,
    "service_state" "service_state" NOT NULL DEFAULT 'REQUESTED',
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMPTZ(6),
    "chain_ticket_id" CHAR(66),
    "warranty_covered" BOOLEAN,
    "opened_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "open_tx_hash" CHAR(66),
    "close_tx_hash" CHAR(66),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "service_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_records" (
    "id" UUID NOT NULL,
    "service_request_id" UUID NOT NULL,
    "action_code" VARCHAR(64) NOT NULL,
    "action_detail" TEXT,
    "evidence_url" VARCHAR(1000),
    "evidence_hash" CHAR(66) NOT NULL,
    "recorded_at" TIMESTAMPTZ(6),
    "tx_hash" CHAR(66),
    "sync_status" "sync_status" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "service_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspections" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "inspector_org_id" UUID NOT NULL,
    "result" "inspection_result" NOT NULL,
    "summary" TEXT,
    "report_url" VARCHAR(1000),
    "report_hash" CHAR(66) NOT NULL,
    "chain_inspection_id" CHAR(66),
    "inspected_at" TIMESTAMPTZ(6),
    "tx_hash" CHAR(66),
    "sync_status" "sync_status" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recalls" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "issuer_org_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "reason_hash" CHAR(66) NOT NULL,
    "recalled_at" TIMESTAMPTZ(6),
    "tx_hash" CHAR(66),
    "sync_status" "sync_status" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "recalls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfer_requests" (
    "id" UUID NOT NULL,
    "chain_request_id" BIGINT NOT NULL,
    "product_id" UUID NOT NULL,
    "from_party_id" UUID NOT NULL,
    "to_party_id" UUID NOT NULL,
    "transfer_state" "transfer_state" NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "requested_at" TIMESTAMPTZ(6) NOT NULL,
    "closed_at" TIMESTAMPTZ(6),
    "created_tx_hash" CHAR(66) NOT NULL,
    "closed_tx_hash" CHAR(66),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "transfer_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "recipient_party_id" UUID NOT NULL,
    "channel" "notification_channel" NOT NULL DEFAULT 'IN_APP',
    "notification_type" VARCHAR(64) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "notification_status" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),
    "read_at" TIMESTAMPTZ(6),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "action" VARCHAR(64) NOT NULL,
    "target_type" VARCHAR(64) NOT NULL,
    "target_id" VARCHAR(100),
    "metadata" JSONB,
    "ip_address" INET,
    "user_agent" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anomaly_alerts" (
    "id" UUID NOT NULL,
    "rule_code" VARCHAR(64) NOT NULL,
    "severity" "anomaly_severity" NOT NULL,
    "product_id" UUID,
    "party_id" UUID,
    "details" JSONB,
    "alert_status" "alert_status" NOT NULL DEFAULT 'OPEN',
    "detected_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "anomaly_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chain_transactions" (
    "id" UUID NOT NULL,
    "initiated_by_user_id" UUID,
    "chain_id" INTEGER NOT NULL,
    "from_address" CHAR(42) NOT NULL,
    "to_address" CHAR(42) NOT NULL,
    "contract_name" VARCHAR(64) NOT NULL,
    "method" VARCHAR(64) NOT NULL,
    "tx_hash" CHAR(66),
    "nonce" INTEGER,
    "gas_limit" BIGINT,
    "max_fee_per_gas" DECIMAL(78,0),
    "max_priority_fee_per_gas" DECIMAL(78,0),
    "value_wei" DECIMAL(78,0) NOT NULL DEFAULT 0,
    "tx_status" "tx_status" NOT NULL DEFAULT 'QUEUED',
    "error_reason" TEXT,
    "block_number" BIGINT,
    "gas_used" BIGINT,
    "effective_gas_price" DECIMAL(78,0),
    "submitted_at" TIMESTAMPTZ(6),
    "confirmed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "chain_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blockchain_events" (
    "id" UUID NOT NULL,
    "chain_id" INTEGER NOT NULL,
    "contract_address" CHAR(42) NOT NULL,
    "block_number" BIGINT NOT NULL,
    "block_hash" CHAR(66) NOT NULL,
    "block_timestamp" TIMESTAMPTZ(6) NOT NULL,
    "tx_hash" CHAR(66) NOT NULL,
    "tx_index" INTEGER NOT NULL,
    "log_index" INTEGER NOT NULL,
    "event_name" VARCHAR(100) NOT NULL,
    "chain_product_id" CHAR(66),
    "product_id" UUID,
    "correlation_key" VARCHAR(80),
    "actor_address" CHAR(42),
    "payload" JSONB NOT NULL,
    "finality_status" "finality_status" NOT NULL DEFAULT 'PENDING',
    "observed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalized_at" TIMESTAMPTZ(6),
    "orphaned_at" TIMESTAMPTZ(6),

    CONSTRAINT "blockchain_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "indexer_checkpoints" (
    "chain_id" INTEGER NOT NULL,
    "contract_address" CHAR(42) NOT NULL,
    "last_observed_block" BIGINT NOT NULL,
    "last_finalized_block" BIGINT NOT NULL,
    "last_finalized_block_hash" CHAR(66) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "indexer_checkpoints_pkey" PRIMARY KEY ("chain_id","contract_address")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_tax_code_key" ON "organizations"("tax_code");

-- CreateIndex
CREATE INDEX "organizations_org_type_auth_status_idx" ON "organizations"("org_type", "auth_status");

-- CreateIndex
CREATE UNIQUE INDEX "parties_user_id_key" ON "parties"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "parties_organization_id_key" ON "parties"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "parties_chain_party_id_key" ON "parties"("chain_party_id");

-- CreateIndex
CREATE UNIQUE INDEX "party_wallets_address_key" ON "party_wallets"("address");

-- CreateIndex
CREATE INDEX "party_wallets_party_id_status_idx" ON "party_wallets"("party_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ux_wallet_one_active_owner" ON "party_wallets"("party_id") WHERE ("wallet_role" = 'OWNER' AND "status" = 'ACTIVE');

-- CreateIndex
CREATE UNIQUE INDEX "ux_wallet_one_active_personal" ON "party_wallets"("party_id") WHERE ("wallet_role" = 'PERSONAL' AND "status" = 'ACTIVE');

-- CreateIndex
CREATE UNIQUE INDEX "fee_payments_paid_tx_hash_key" ON "fee_payments"("paid_tx_hash");

-- CreateIndex
CREATE INDEX "fee_payments_party_id_action_idx" ON "fee_payments"("party_id", "action");

-- CreateIndex
CREATE INDEX "fee_payments_fee_status_idx" ON "fee_payments"("fee_status");

-- CreateIndex
CREATE UNIQUE INDEX "products_chain_product_id_key" ON "products"("chain_product_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_serial_number_key" ON "products"("serial_number");

-- CreateIndex
CREATE UNIQUE INDEX "products_public_code_key" ON "products"("public_code");

-- CreateIndex
CREATE UNIQUE INDEX "products_created_tx_hash_key" ON "products"("created_tx_hash");

-- CreateIndex
CREATE INDEX "products_issuer_org_id_created_at_idx" ON "products"("issuer_org_id", "created_at");

-- CreateIndex
CREATE INDEX "products_product_state_idx" ON "products"("product_state");

-- CreateIndex
CREATE INDEX "products_current_owner_party_id_idx" ON "products"("current_owner_party_id");

-- CreateIndex
CREATE INDEX "products_current_custodian_party_id_idx" ON "products"("current_custodian_party_id");

-- CreateIndex
CREATE INDEX "products_sync_status_idx" ON "products"("sync_status");

-- CreateIndex
CREATE UNIQUE INDEX "custody_records_event_id_key" ON "custody_records"("event_id");

-- CreateIndex
CREATE INDEX "custody_records_product_id_transferred_at_idx" ON "custody_records"("product_id", "transferred_at");

-- CreateIndex
CREATE UNIQUE INDEX "ownership_records_event_id_key" ON "ownership_records"("event_id");

-- CreateIndex
CREATE INDEX "ownership_records_product_id_transferred_at_idx" ON "ownership_records"("product_id", "transferred_at");

-- CreateIndex
CREATE UNIQUE INDEX "warranties_product_id_key" ON "warranties"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "warranties_activation_tx_hash_key" ON "warranties"("activation_tx_hash");

-- CreateIndex
CREATE INDEX "warranties_warranty_state_expires_at_idx" ON "warranties"("warranty_state", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "service_requests_chain_ticket_id_key" ON "service_requests"("chain_ticket_id");

-- CreateIndex
CREATE INDEX "service_requests_service_center_org_id_service_state_idx" ON "service_requests"("service_center_org_id", "service_state");

-- CreateIndex
CREATE INDEX "service_requests_requested_by_party_id_idx" ON "service_requests"("requested_by_party_id");

-- CreateIndex
CREATE INDEX "service_requests_product_id_requested_at_idx" ON "service_requests"("product_id", "requested_at");

-- CreateIndex
CREATE UNIQUE INDEX "ux_service_one_open" ON "service_requests"("product_id") WHERE (service_state = ANY (ARRAY['REQUESTED'::service_state, 'IN_REPAIR'::service_state]));

-- CreateIndex
CREATE UNIQUE INDEX "service_records_tx_hash_key" ON "service_records"("tx_hash");

-- CreateIndex
CREATE INDEX "service_records_service_request_id_created_at_idx" ON "service_records"("service_request_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "inspections_chain_inspection_id_key" ON "inspections"("chain_inspection_id");

-- CreateIndex
CREATE UNIQUE INDEX "inspections_tx_hash_key" ON "inspections"("tx_hash");

-- CreateIndex
CREATE INDEX "inspections_product_id_created_at_idx" ON "inspections"("product_id", "created_at");

-- CreateIndex
CREATE INDEX "inspections_inspector_org_id_idx" ON "inspections"("inspector_org_id");

-- CreateIndex
CREATE UNIQUE INDEX "recalls_product_id_key" ON "recalls"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "recalls_tx_hash_key" ON "recalls"("tx_hash");

-- CreateIndex
CREATE INDEX "recalls_issuer_org_id_idx" ON "recalls"("issuer_org_id");

-- CreateIndex
CREATE UNIQUE INDEX "transfer_requests_chain_request_id_key" ON "transfer_requests"("chain_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "transfer_requests_created_tx_hash_key" ON "transfer_requests"("created_tx_hash");

-- CreateIndex
CREATE INDEX "transfer_requests_from_party_id_transfer_state_idx" ON "transfer_requests"("from_party_id", "transfer_state");

-- CreateIndex
CREATE INDEX "transfer_requests_to_party_id_transfer_state_idx" ON "transfer_requests"("to_party_id", "transfer_state");

-- CreateIndex
CREATE INDEX "transfer_requests_transfer_state_expires_at_idx" ON "transfer_requests"("transfer_state", "expires_at");

-- CreateIndex
CREATE INDEX "transfer_requests_product_id_requested_at_idx" ON "transfer_requests"("product_id", "requested_at");

-- CreateIndex
CREATE UNIQUE INDEX "ux_transfer_one_active" ON "transfer_requests"("product_id") WHERE ("transfer_state" = 'REQUESTED');

-- CreateIndex
CREATE INDEX "notifications_recipient_party_id_created_at_idx" ON "notifications"("recipient_party_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_status_idx" ON "notifications"("status");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_target_type_target_id_idx" ON "audit_logs"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "anomaly_alerts_alert_status_detected_at_idx" ON "anomaly_alerts"("alert_status", "detected_at");

-- CreateIndex
CREATE INDEX "anomaly_alerts_rule_code_idx" ON "anomaly_alerts"("rule_code");

-- CreateIndex
CREATE UNIQUE INDEX "chain_transactions_tx_hash_key" ON "chain_transactions"("tx_hash");

-- CreateIndex
CREATE INDEX "chain_transactions_tx_status_created_at_idx" ON "chain_transactions"("tx_status", "created_at");

-- CreateIndex
CREATE INDEX "chain_transactions_from_address_nonce_idx" ON "chain_transactions"("from_address", "nonce");

-- CreateIndex
CREATE INDEX "chain_transactions_contract_name_method_idx" ON "chain_transactions"("contract_name", "method");

-- CreateIndex
CREATE INDEX "blockchain_events_product_id_block_number_log_index_idx" ON "blockchain_events"("product_id", "block_number", "log_index");

-- CreateIndex
CREATE INDEX "blockchain_events_chain_product_id_block_number_log_index_idx" ON "blockchain_events"("chain_product_id", "block_number", "log_index");

-- CreateIndex
CREATE INDEX "blockchain_events_correlation_key_idx" ON "blockchain_events"("correlation_key");

-- CreateIndex
CREATE INDEX "blockchain_events_chain_id_block_number_idx" ON "blockchain_events"("chain_id", "block_number");

-- CreateIndex
CREATE INDEX "blockchain_events_finality_status_block_number_idx" ON "blockchain_events"("finality_status", "block_number");

-- CreateIndex
CREATE INDEX "blockchain_events_event_name_idx" ON "blockchain_events"("event_name");

-- CreateIndex
CREATE UNIQUE INDEX "ux_blockchain_events_identity" ON "blockchain_events"("chain_id", "tx_hash", "log_index");

-- AddForeignKey
ALTER TABLE "parties" ADD CONSTRAINT "parties_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parties" ADD CONSTRAINT "parties_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_wallets" ADD CONSTRAINT "party_wallets_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custodial_keys" ADD CONSTRAINT "custodial_keys_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "party_wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_issuer_org_id_fkey" FOREIGN KEY ("issuer_org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_current_custodian_party_id_fkey" FOREIGN KEY ("current_custodian_party_id") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_pending_custodian_party_id_fkey" FOREIGN KEY ("pending_custodian_party_id") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_current_owner_party_id_fkey" FOREIGN KEY ("current_owner_party_id") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_records" ADD CONSTRAINT "custody_records_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_records" ADD CONSTRAINT "custody_records_from_party_id_fkey" FOREIGN KEY ("from_party_id") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_records" ADD CONSTRAINT "custody_records_to_party_id_fkey" FOREIGN KEY ("to_party_id") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_records" ADD CONSTRAINT "custody_records_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "blockchain_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ownership_records" ADD CONSTRAINT "ownership_records_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ownership_records" ADD CONSTRAINT "ownership_records_from_party_id_fkey" FOREIGN KEY ("from_party_id") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ownership_records" ADD CONSTRAINT "ownership_records_to_party_id_fkey" FOREIGN KEY ("to_party_id") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ownership_records" ADD CONSTRAINT "ownership_records_transfer_request_id_fkey" FOREIGN KEY ("transfer_request_id") REFERENCES "transfer_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ownership_records" ADD CONSTRAINT "ownership_records_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "blockchain_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_activated_by_party_id_fkey" FOREIGN KEY ("activated_by_party_id") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_requested_by_party_id_fkey" FOREIGN KEY ("requested_by_party_id") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_service_center_org_id_fkey" FOREIGN KEY ("service_center_org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_service_request_id_fkey" FOREIGN KEY ("service_request_id") REFERENCES "service_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_inspector_org_id_fkey" FOREIGN KEY ("inspector_org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recalls" ADD CONSTRAINT "recalls_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recalls" ADD CONSTRAINT "recalls_issuer_org_id_fkey" FOREIGN KEY ("issuer_org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_from_party_id_fkey" FOREIGN KEY ("from_party_id") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_to_party_id_fkey" FOREIGN KEY ("to_party_id") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_party_id_fkey" FOREIGN KEY ("recipient_party_id") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomaly_alerts" ADD CONSTRAINT "anomaly_alerts_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomaly_alerts" ADD CONSTRAINT "anomaly_alerts_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomaly_alerts" ADD CONSTRAINT "anomaly_alerts_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chain_transactions" ADD CONSTRAINT "chain_transactions_initiated_by_user_id_fkey" FOREIGN KEY ("initiated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blockchain_events" ADD CONSTRAINT "blockchain_events_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================================================
-- Ràng buộc bổ sung — viết tay vì Prisma schema không mô tả được CHECK và trigger.
-- Prisma Migrate không xoá các đối tượng này ở những migration sau.
-- =============================================================================

-- users ----------------------------------------------------------------------
ALTER TABLE "users"
  ADD CONSTRAINT "ck_users_email_lowercase" CHECK ("email" = lower("email")),
  ADD CONSTRAINT "ck_users_password_hash_argon2id" CHECK ("password_hash" LIKE '$argon2id$%'),
  ADD CONSTRAINT "ck_users_full_name_not_blank" CHECK (btrim("full_name") <> ''),
  ADD CONSTRAINT "ck_users_soft_delete" CHECK (("status" = 'DELETED') = ("deleted_at" IS NOT NULL));

-- organizations --------------------------------------------------------------
ALTER TABLE "organizations"
  ADD CONSTRAINT "ck_organizations_name_not_blank" CHECK (btrim("name") <> ''),
  -- Mã số thuế Việt Nam: 10 chữ số, chi nhánh thêm "-xxx".
  ADD CONSTRAINT "ck_organizations_tax_code_format" CHECK ("tax_code" ~ '^[0-9]{10}(-[0-9]{3})?$'),
  ADD CONSTRAINT "ck_organizations_contact_email_lowercase" CHECK ("contact_email" = lower("contact_email")),
  ADD CONSTRAINT "ck_organizations_profile_hash_format" CHECK ("profile_hash" IS NULL OR "profile_hash" ~ '^0x[0-9a-f]{64}$'),
  ADD CONSTRAINT "ck_organizations_status_timestamps" CHECK (
    ("auth_status" <> 'AUTHORIZED' OR "approved_at" IS NOT NULL)
    AND ("auth_status" <> 'REJECTED' OR "rejected_at" IS NOT NULL)
    AND ("auth_status" <> 'DISABLED' OR "disabled_at" IS NOT NULL)
  );

-- parties: đúng một chủ thể, khớp loại ---------------------------------------
ALTER TABLE "parties"
  ADD CONSTRAINT "ck_parties_subject" CHECK (
    ("party_type" = 'USER' AND "user_id" IS NOT NULL AND "organization_id" IS NULL)
    OR ("party_type" = 'ORGANIZATION' AND "organization_id" IS NOT NULL AND "user_id" IS NULL)
  ),
  ADD CONSTRAINT "ck_parties_chain_party_id_format" CHECK ("chain_party_id" IS NULL OR "chain_party_id" ~ '^0x[0-9a-f]{64}$');

-- party_wallets --------------------------------------------------------------
ALTER TABLE "party_wallets"
  ADD CONSTRAINT "ck_party_wallets_address_format" CHECK ("address" ~ '^0x[0-9a-f]{40}$'),
  ADD CONSTRAINT "ck_party_wallets_link_tx_hash_format" CHECK ("link_tx_hash" IS NULL OR "link_tx_hash" ~ '^0x[0-9a-f]{64}$'),
  ADD CONSTRAINT "ck_party_wallets_activation" CHECK ("status" = 'PENDING' OR "activated_at" IS NOT NULL),
  ADD CONSTRAINT "ck_party_wallets_revocation" CHECK (("status" IN ('ROTATED', 'REVOKED')) = ("revoked_at" IS NOT NULL));

-- custodial_keys: AES-256-GCM ------------------------------------------------
ALTER TABLE "custodial_keys"
  ADD CONSTRAINT "ck_custodial_keys_iv_length" CHECK (octet_length("iv") = 12),
  ADD CONSTRAINT "ck_custodial_keys_auth_tag_length" CHECK (octet_length("auth_tag") = 16),
  ADD CONSTRAINT "ck_custodial_keys_key_version" CHECK ("key_version" >= 1);

-- fee_policies, fee_payments -------------------------------------------------
ALTER TABLE "fee_policies"
  ADD CONSTRAINT "ck_fee_policies_amount_non_negative" CHECK ("amount_wei" >= 0),
  ADD CONSTRAINT "ck_fee_policies_treasury_format" CHECK ("treasury_address" ~ '^0x[0-9a-f]{40}$'),
  ADD CONSTRAINT "ck_fee_policies_tx_hash_format" CHECK ("updated_tx_hash" ~ '^0x[0-9a-f]{64}$');

ALTER TABLE "fee_payments"
  ADD CONSTRAINT "ck_fee_payments_amount_positive" CHECK ("amount_wei" > 0),
  ADD CONSTRAINT "ck_fee_payments_payer_format" CHECK ("payer_address" ~ '^0x[0-9a-f]{40}$'),
  ADD CONSTRAINT "ck_fee_payments_tx_hash_format" CHECK (
    "paid_tx_hash" ~ '^0x[0-9a-f]{64}$'
    AND ("settled_tx_hash" IS NULL OR "settled_tx_hash" ~ '^0x[0-9a-f]{64}$')
    AND ("refund_tx_hash" IS NULL OR "refund_tx_hash" ~ '^0x[0-9a-f]{64}$')
  ),
  ADD CONSTRAINT "ck_fee_payments_status_consistency" CHECK (
    ("fee_status" <> 'SETTLED' OR ("settled_tx_hash" IS NOT NULL AND "settled_at" IS NOT NULL))
    AND ("fee_status" <> 'REFUNDED' OR ("refund_tx_hash" IS NOT NULL AND "refunded_at" IS NOT NULL))
  );

-- products: custody và ownership tách biệt -----------------------------------
ALTER TABLE "products"
  ADD CONSTRAINT "ck_products_serial_format" CHECK (btrim("serial_number") <> '' AND "serial_number" = btrim("serial_number")),
  ADD CONSTRAINT "ck_products_public_code_format" CHECK ("public_code" ~ '^[A-Za-z0-9_-]{8,32}$'),
  ADD CONSTRAINT "ck_products_hash_format" CHECK (
    "chain_product_id" ~ '^0x[0-9a-f]{64}$'
    AND "metadata_hash" ~ '^0x[0-9a-f]{64}$'
    AND ("created_tx_hash" IS NULL OR "created_tx_hash" ~ '^0x[0-9a-f]{64}$')
  ),
  -- Chưa bán thì chưa có owner; SOLD/LOST_STOLEN/RETIRED bắt buộc có owner.
  ADD CONSTRAINT "ck_products_owner_matches_state" CHECK (
    ("product_state" IN ('CREATED', 'IN_DISTRIBUTION', 'AT_RETAIL') AND "current_owner_party_id" IS NULL)
    OR ("product_state" IN ('SOLD', 'LOST_STOLEN', 'RETIRED') AND "current_owner_party_id" IS NOT NULL)
    OR "product_state" = 'RECALLED'
    OR "product_state" IS NULL
  ),
  -- Chỉ đang IN_DISTRIBUTION mới có bên nhận custody đang chờ.
  ADD CONSTRAINT "ck_products_pending_custodian" CHECK (
    ("product_state" = 'IN_DISTRIBUTION') = ("pending_custodian_party_id" IS NOT NULL)
  ),
  ADD CONSTRAINT "ck_products_confirmed_projection" CHECK (
    "sync_status" <> 'CONFIRMED'
    OR ("product_state" IS NOT NULL
        AND "current_custodian_party_id" IS NOT NULL
        AND "created_tx_hash" IS NOT NULL
        AND "onchain_created_at" IS NOT NULL)
  );

-- custody_records, ownership_records -----------------------------------------
ALTER TABLE "custody_records"
  ADD CONSTRAINT "ck_custody_records_distinct_parties" CHECK ("from_party_id" IS NULL OR "from_party_id" <> "to_party_id");

ALTER TABLE "ownership_records"
  ADD CONSTRAINT "ck_ownership_records_distinct_parties" CHECK ("from_party_id" IS NULL OR "from_party_id" <> "to_party_id");

-- warranties -----------------------------------------------------------------
ALTER TABLE "warranties"
  ADD CONSTRAINT "ck_warranties_period" CHECK ("expires_at" > "activated_at"),
  ADD CONSTRAINT "ck_warranties_tx_hash_format" CHECK ("activation_tx_hash" ~ '^0x[0-9a-f]{64}$');

-- service_requests, service_records ------------------------------------------
ALTER TABLE "service_requests"
  ADD CONSTRAINT "ck_service_requests_issue_not_blank" CHECK (btrim("issue_desc") <> ''),
  ADD CONSTRAINT "ck_service_requests_hash_format" CHECK (
    ("chain_ticket_id" IS NULL OR "chain_ticket_id" ~ '^0x[0-9a-f]{64}$')
    AND ("open_tx_hash" IS NULL OR "open_tx_hash" ~ '^0x[0-9a-f]{64}$')
    AND ("close_tx_hash" IS NULL OR "close_tx_hash" ~ '^0x[0-9a-f]{64}$')
  ),
  ADD CONSTRAINT "ck_service_requests_state_consistency" CHECK (
    ("service_state" NOT IN ('IN_REPAIR', 'REPAIRED', 'REJECTED')
      OR ("chain_ticket_id" IS NOT NULL AND "opened_at" IS NOT NULL AND "open_tx_hash" IS NOT NULL))
    AND ("service_state" NOT IN ('REPAIRED', 'REJECTED') OR ("closed_at" IS NOT NULL AND "close_tx_hash" IS NOT NULL))
    AND (("service_state" = 'CANCELLED') = ("cancelled_at" IS NOT NULL))
  ),
  ADD CONSTRAINT "ck_service_requests_closed_after_opened" CHECK (
    "closed_at" IS NULL OR "opened_at" IS NULL OR "closed_at" >= "opened_at"
  );

ALTER TABLE "service_records"
  ADD CONSTRAINT "ck_service_records_action_code_not_blank" CHECK (btrim("action_code") <> ''),
  ADD CONSTRAINT "ck_service_records_hash_format" CHECK (
    "evidence_hash" ~ '^0x[0-9a-f]{64}$' AND ("tx_hash" IS NULL OR "tx_hash" ~ '^0x[0-9a-f]{64}$')
  ),
  ADD CONSTRAINT "ck_service_records_confirmed" CHECK (
    "sync_status" <> 'CONFIRMED' OR ("tx_hash" IS NOT NULL AND "recorded_at" IS NOT NULL)
  );

-- inspections ----------------------------------------------------------------
ALTER TABLE "inspections"
  ADD CONSTRAINT "ck_inspections_hash_format" CHECK (
    "report_hash" ~ '^0x[0-9a-f]{64}$'
    AND ("chain_inspection_id" IS NULL OR "chain_inspection_id" ~ '^0x[0-9a-f]{64}$')
    AND ("tx_hash" IS NULL OR "tx_hash" ~ '^0x[0-9a-f]{64}$')
  ),
  ADD CONSTRAINT "ck_inspections_confirmed" CHECK (
    "sync_status" <> 'CONFIRMED'
    OR ("tx_hash" IS NOT NULL AND "inspected_at" IS NOT NULL AND "chain_inspection_id" IS NOT NULL)
  );

-- recalls --------------------------------------------------------------------
ALTER TABLE "recalls"
  ADD CONSTRAINT "ck_recalls_reason_not_blank" CHECK (btrim("reason") <> ''),
  ADD CONSTRAINT "ck_recalls_hash_format" CHECK (
    "reason_hash" ~ '^0x[0-9a-f]{64}$' AND ("tx_hash" IS NULL OR "tx_hash" ~ '^0x[0-9a-f]{64}$')
  ),
  ADD CONSTRAINT "ck_recalls_confirmed" CHECK (
    "sync_status" <> 'CONFIRMED' OR ("tx_hash" IS NOT NULL AND "recalled_at" IS NOT NULL)
  );

-- transfer_requests: REQUESTED là trạng thái mở duy nhất ----------------------
ALTER TABLE "transfer_requests"
  ADD CONSTRAINT "ck_transfer_requests_chain_request_id_positive" CHECK ("chain_request_id" > 0),
  ADD CONSTRAINT "ck_transfer_requests_distinct_parties" CHECK ("from_party_id" <> "to_party_id"),
  ADD CONSTRAINT "ck_transfer_requests_expiry" CHECK ("expires_at" > "requested_at"),
  ADD CONSTRAINT "ck_transfer_requests_hash_format" CHECK (
    "created_tx_hash" ~ '^0x[0-9a-f]{64}$' AND ("closed_tx_hash" IS NULL OR "closed_tx_hash" ~ '^0x[0-9a-f]{64}$')
  ),
  ADD CONSTRAINT "ck_transfer_requests_closure" CHECK (
    ("transfer_state" = 'REQUESTED') = ("closed_at" IS NULL)
    AND ("transfer_state" = 'REQUESTED') = ("closed_tx_hash" IS NULL)
  );

-- notifications --------------------------------------------------------------
ALTER TABLE "notifications"
  ADD CONSTRAINT "ck_notifications_type_not_blank" CHECK (btrim("notification_type") <> ''),
  ADD CONSTRAINT "ck_notifications_sent" CHECK ("status" <> 'SENT' OR "sent_at" IS NOT NULL);

-- audit_logs: chỉ cho phép INSERT --------------------------------------------
ALTER TABLE "audit_logs"
  ADD CONSTRAINT "ck_audit_logs_action_not_blank" CHECK (btrim("action") <> '');

CREATE FUNCTION "forbid_audit_log_mutation"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only: % is not allowed', TG_OP;
END;
$$;

CREATE TRIGGER "trg_audit_logs_append_only"
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "forbid_audit_log_mutation"();

-- anomaly_alerts -------------------------------------------------------------
ALTER TABLE "anomaly_alerts"
  ADD CONSTRAINT "ck_anomaly_alerts_review" CHECK (
    ("alert_status" = 'OPEN') = ("reviewed_at" IS NULL)
    AND ("alert_status" = 'OPEN' OR "reviewed_by_user_id" IS NOT NULL)
  );

-- chain_transactions ---------------------------------------------------------
ALTER TABLE "chain_transactions"
  ADD CONSTRAINT "ck_chain_transactions_chain_id_positive" CHECK ("chain_id" > 0),
  ADD CONSTRAINT "ck_chain_transactions_address_format" CHECK (
    "from_address" ~ '^0x[0-9a-f]{40}$' AND "to_address" ~ '^0x[0-9a-f]{40}$'
  ),
  ADD CONSTRAINT "ck_chain_transactions_tx_hash_format" CHECK ("tx_hash" IS NULL OR "tx_hash" ~ '^0x[0-9a-f]{64}$'),
  ADD CONSTRAINT "ck_chain_transactions_amounts" CHECK (
    "value_wei" >= 0
    AND ("nonce" IS NULL OR "nonce" >= 0)
    AND ("gas_limit" IS NULL OR "gas_limit" > 0)
  ),
  ADD CONSTRAINT "ck_chain_transactions_status_consistency" CHECK (
    ("tx_status" IN ('QUEUED', 'FAILED') OR "tx_hash" IS NOT NULL)
    AND ("tx_status" NOT IN ('CONFIRMED', 'REVERTED') OR ("block_number" IS NOT NULL AND "confirmed_at" IS NOT NULL))
  );

-- blockchain_events: dữ liệu phục vụ finality và reorg ------------------------
ALTER TABLE "blockchain_events"
  ADD CONSTRAINT "ck_blockchain_events_chain_id_positive" CHECK ("chain_id" > 0),
  ADD CONSTRAINT "ck_blockchain_events_position" CHECK ("block_number" >= 0 AND "tx_index" >= 0 AND "log_index" >= 0),
  ADD CONSTRAINT "ck_blockchain_events_address_format" CHECK (
    "contract_address" ~ '^0x[0-9a-f]{40}$'
    AND ("actor_address" IS NULL OR "actor_address" ~ '^0x[0-9a-f]{40}$')
  ),
  ADD CONSTRAINT "ck_blockchain_events_hash_format" CHECK (
    "block_hash" ~ '^0x[0-9a-f]{64}$'
    AND "tx_hash" ~ '^0x[0-9a-f]{64}$'
    AND ("chain_product_id" IS NULL OR "chain_product_id" ~ '^0x[0-9a-f]{64}$')
  ),
  -- Block đã FINALIZED không thể bị reorg nên không bao giờ thành ORPHANED.
  ADD CONSTRAINT "ck_blockchain_events_finality" CHECK (
    ("finality_status" = 'FINALIZED') = ("finalized_at" IS NOT NULL)
    AND ("finality_status" = 'ORPHANED') = ("orphaned_at" IS NOT NULL)
  );

-- indexer_checkpoints --------------------------------------------------------
ALTER TABLE "indexer_checkpoints"
  ADD CONSTRAINT "ck_indexer_checkpoints_address_format" CHECK ("contract_address" ~ '^0x[0-9a-f]{40}$'),
  ADD CONSTRAINT "ck_indexer_checkpoints_hash_format" CHECK ("last_finalized_block_hash" ~ '^0x[0-9a-f]{64}$'),
  ADD CONSTRAINT "ck_indexer_checkpoints_progress" CHECK (
    "last_finalized_block" >= 0 AND "last_finalized_block" <= "last_observed_block"
  );
