-- M5: giữ lại từng lần nộp đơn của tổ chức (kể cả lần bị từ chối) để Admin đối chiếu đầy đủ.

-- CreateTable
CREATE TABLE "organization_applications" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "round" INTEGER NOT NULL,
    "name" VARCHAR(255),
    "tax_code" VARCHAR(32),
    "contact_email" VARCHAR(255),
    "contact_phone" VARCHAR(32),
    "address" VARCHAR(500),
    "org_type" "org_type" NOT NULL,
    "profile_hash" CHAR(66) NOT NULL,
    "applicant_address" CHAR(42) NOT NULL,
    "applied_tx_hash" CHAR(66) NOT NULL,
    "applied_at" TIMESTAMPTZ(6) NOT NULL,
    "fee_payment_id" UUID,
    "status" "auth_status" NOT NULL DEFAULT 'PENDING',
    "decision_reason" VARCHAR(500),
    "decision_reason_hash" CHAR(66),
    "decided_by_address" CHAR(42),
    "decided_tx_hash" CHAR(66),
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organization_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organization_applications_applied_tx_hash_key" ON "organization_applications"("applied_tx_hash");

-- CreateIndex
CREATE UNIQUE INDEX "organization_applications_fee_payment_id_key" ON "organization_applications"("fee_payment_id");

-- CreateIndex
CREATE INDEX "organization_applications_status_idx" ON "organization_applications"("status");

-- CreateIndex
CREATE UNIQUE INDEX "organization_applications_organization_id_round_key" ON "organization_applications"("organization_id", "round");

-- CreateIndex
CREATE UNIQUE INDEX "ux_org_application_one_pending" ON "organization_applications"("organization_id") WHERE ("status" = 'PENDING');

-- AddForeignKey
ALTER TABLE "organization_applications" ADD CONSTRAINT "organization_applications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_applications" ADD CONSTRAINT "organization_applications_fee_payment_id_fkey" FOREIGN KEY ("fee_payment_id") REFERENCES "fee_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- BEGIN BACKFILL
-- Dữ liệu có từ M4: dựng lại các lần nộp từ event FINALIZED của PartyRegistry (on-chain là nguồn sự thật).
-- Bản chụp hồ sơ chỉ điền khi hash của lần nộp trùng hồ sơ đang lưu; lý do từ chối lấy từ audit_logs
-- (ADMIN_DECISION_PREPARED) theo đúng reasonHash đã gửi on-chain.
WITH applied AS (
  SELECT
    e.contract_address,
    e.correlation_key,
    substr(e.correlation_key, 35, 32)::uuid AS organization_id,
    e.payload -> 'args' ->> 'profileHash' AS profile_hash,
    e.payload -> 'args' ->> 'role' AS role,
    lower(e.actor_address) AS applicant_address,
    e.tx_hash,
    e.block_timestamp,
    e.block_number,
    e.log_index,
    row_number() OVER w AS round,
    lead(e.block_number) OVER w AS next_block,
    lead(e.log_index) OVER w AS next_log
  FROM "blockchain_events" e
  WHERE e.event_name = 'OrganizationApplied'
    AND e.finality_status = 'FINALIZED'
    AND e.actor_address IS NOT NULL
    AND e.correlation_key LIKE '0x00000000000000000000000000000000%'
  WINDOW w AS (PARTITION BY e.contract_address, e.correlation_key ORDER BY e.block_number, e.log_index)
)
INSERT INTO "organization_applications" (
  "id", "organization_id", "round", "name", "tax_code", "contact_email", "contact_phone", "address",
  "org_type", "profile_hash", "applicant_address", "applied_tx_hash", "applied_at", "fee_payment_id",
  "status", "decision_reason", "decision_reason_hash", "decided_by_address", "decided_tx_hash",
  "decided_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  a.organization_id,
  a.round,
  CASE WHEN o.profile_hash = a.profile_hash THEN o.name END,
  CASE WHEN o.profile_hash = a.profile_hash THEN o.tax_code END,
  CASE WHEN o.profile_hash = a.profile_hash THEN o.contact_email END,
  CASE WHEN o.profile_hash = a.profile_hash THEN o.contact_phone END,
  CASE WHEN o.profile_hash = a.profile_hash THEN o.address END,
  CASE a.role
    WHEN '0xeefb95e842a3287179d933b4460be539a1d5af11aa8b325bb45c5c8dc92de4ed' THEN 'MANUFACTURER'
    WHEN '0x2a5f906c256a5d799494fcd066e1f6c077689de1cdb65052a1624de4bace99bf' THEN 'RETAILER'
    WHEN '0xe00629f427c6136ae9b856b472ff74184d9d0bee21b9336d8fbb33b66079065a' THEN 'SERVICE_CENTER'
    WHEN '0x273dcf2136c7d8ef632bb8ef13dbca69a8f36fa620c7468671b3153d46a211c0' THEN 'INSPECTOR'
  END::"org_type",
  a.profile_hash,
  a.applicant_address,
  a.tx_hash,
  a.block_timestamp,
  f.id,
  CASE d.event_name
    WHEN 'OrganizationApproved' THEN 'AUTHORIZED'
    WHEN 'OrganizationRejected' THEN 'REJECTED'
    ELSE 'PENDING'
  END::"auth_status",
  CASE WHEN d.event_name = 'OrganizationRejected' THEN (
    SELECT l.metadata ->> 'reason'
    FROM "audit_logs" l
    WHERE l.action = 'ADMIN_DECISION_PREPARED'
      AND l.target_id = a.organization_id::text
      AND l.metadata ->> 'reasonHash' = d.payload -> 'args' ->> 'reasonHash'
    ORDER BY l.created_at DESC
    LIMIT 1
  ) END,
  CASE WHEN d.event_name = 'OrganizationRejected' THEN d.payload -> 'args' ->> 'reasonHash' END,
  lower(d.actor_address),
  d.tx_hash,
  d.block_timestamp,
  now()
FROM applied a
JOIN "organizations" o ON o.id = a.organization_id
LEFT JOIN "fee_payments" f ON f.paid_tx_hash = a.tx_hash
LEFT JOIN LATERAL (
  SELECT x.event_name, x.payload, x.actor_address, x.tx_hash, x.block_timestamp
  FROM "blockchain_events" x
  WHERE x.contract_address = a.contract_address
    AND x.correlation_key = a.correlation_key
    AND x.event_name IN ('OrganizationApproved', 'OrganizationRejected')
    AND x.finality_status = 'FINALIZED'
    AND x.actor_address IS NOT NULL
    AND (x.block_number, x.log_index) > (a.block_number, a.log_index)
    AND (a.next_block IS NULL OR (x.block_number, x.log_index) < (a.next_block, a.next_log))
  ORDER BY x.block_number, x.log_index
  LIMIT 1
) d ON TRUE
WHERE a.role IN (
  '0xeefb95e842a3287179d933b4460be539a1d5af11aa8b325bb45c5c8dc92de4ed',
  '0x2a5f906c256a5d799494fcd066e1f6c077689de1cdb65052a1624de4bace99bf',
  '0xe00629f427c6136ae9b856b472ff74184d9d0bee21b9336d8fbb33b66079065a',
  '0x273dcf2136c7d8ef632bb8ef13dbca69a8f36fa620c7468671b3153d46a211c0'
);
-- END BACKFILL

-- Ràng buộc bổ sung
ALTER TABLE "organization_applications"
  ADD CONSTRAINT "ck_org_applications_round_positive" CHECK ("round" >= 1),
  ADD CONSTRAINT "ck_org_applications_status" CHECK ("status" <> 'DISABLED'),
  ADD CONSTRAINT "ck_org_applications_hash_format" CHECK (
    "profile_hash" ~ '^0x[0-9a-f]{64}$'
    AND "applied_tx_hash" ~ '^0x[0-9a-f]{64}$'
    AND ("decided_tx_hash" IS NULL OR "decided_tx_hash" ~ '^0x[0-9a-f]{64}$')
    AND ("decision_reason_hash" IS NULL OR "decision_reason_hash" ~ '^0x[0-9a-f]{64}$')
  ),
  ADD CONSTRAINT "ck_org_applications_address_format" CHECK (
    "applicant_address" ~ '^0x[0-9a-f]{40}$'
    AND ("decided_by_address" IS NULL OR "decided_by_address" ~ '^0x[0-9a-f]{40}$')
  ),
  -- Chưa quyết định thì chưa có giao dịch quyết định; đã quyết định thì đủ giao dịch, thời điểm, ví ký.
  ADD CONSTRAINT "ck_org_applications_decision" CHECK (
    ("status" = 'PENDING' AND "decided_tx_hash" IS NULL AND "decided_at" IS NULL AND "decided_by_address" IS NULL)
    OR ("status" <> 'PENDING' AND "decided_tx_hash" IS NOT NULL AND "decided_at" IS NOT NULL AND "decided_by_address" IS NOT NULL)
  ),
  ADD CONSTRAINT "ck_org_applications_decided_after_applied" CHECK ("decided_at" IS NULL OR "decided_at" >= "applied_at"),
  -- Lý do chỉ thuộc đơn bị từ chối (hoặc đơn đang chờ Admin gửi giao dịch từ chối); hash on-chain có đúng khi REJECTED.
  ADD CONSTRAINT "ck_org_applications_reason" CHECK (
    ("decision_reason" IS NULL OR (btrim("decision_reason") <> '' AND "status" IN ('PENDING', 'REJECTED')))
    AND (("status" = 'REJECTED') = ("decision_reason_hash" IS NOT NULL))
  ),
  -- Bản chụp hồ sơ có đủ hoặc không có gì.
  ADD CONSTRAINT "ck_org_applications_snapshot" CHECK (
    ("name" IS NULL AND "tax_code" IS NULL AND "contact_email" IS NULL AND "contact_phone" IS NULL AND "address" IS NULL)
    OR ("name" IS NOT NULL AND btrim("name") <> ''
        AND "tax_code" ~ '^[0-9]{10}(-[0-9]{3})?$'
        AND "contact_email" IS NOT NULL AND "contact_email" = lower("contact_email"))
  );
