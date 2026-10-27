// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Kiểu dữ liệu on-chain dùng chung cho Registry, ProductPassport, Warranty, Transfer.
// Thứ tự giá trị phải khớp `packages/shared/src/domain/chain-enums.ts`.
// Giá trị 0 luôn là NONE: mặc định của mapping, nghĩa là "chưa tồn tại".

enum PartyKind {
    NONE,
    USER,
    ORGANIZATION
}

enum OrganizationStatus {
    NONE,
    PENDING,
    AUTHORIZED,
    REJECTED,
    DISABLED
}

enum FeeStatus {
    NONE,
    ESCROWED,
    SETTLED,
    REFUNDABLE,
    REFUNDED
}

enum ProductState {
    NONE,
    CREATED,
    IN_DISTRIBUTION,
    AT_RETAIL,
    SOLD,
    RECALLED,
    LOST_STOLEN,
    RETIRED
}

// EXPIRED không được lưu, chỉ được trả về từ hàm view khi block.timestamp vượt expiresAt.
enum WarrantyState {
    NONE,
    ACTIVE,
    SUSPENDED,
    EXPIRED
}

enum ServiceTicketState {
    NONE,
    IN_REPAIR,
    REPAIRED,
    REJECTED
}

enum InspectionResult {
    NONE,
    PASS,
    FAIL,
    CONDITIONAL
}

enum TransferState {
    NONE,
    REQUESTED,
    COMPLETED,
    REJECTED,
    CANCELLED,
    EXPIRED
}
