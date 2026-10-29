// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Role theo quy ước OpenZeppelin AccessControl: keccak256("<TÊN>_ROLE").
// Khớp `packages/shared/src/domain/roles.ts`.

// Khoá ký giấy phép gắn ví của backend; chỉ ký EIP-712, không gửi giao dịch.
bytes32 constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");

// Role nghiệp vụ, gắn với partyId của tổ chức trong PartyRegistry.
bytes32 constant MANUFACTURER_ROLE = keccak256("MANUFACTURER_ROLE");
bytes32 constant RETAILER_ROLE = keccak256("RETAILER_ROLE");
bytes32 constant SERVICE_CENTER_ROLE = keccak256("SERVICE_CENTER_ROLE");
bytes32 constant INSPECTOR_ROLE = keccak256("INSPECTOR_ROLE");

// Role cho lời gọi chéo giữa các contract, gắn với địa chỉ contract.
bytes32 constant PRODUCT_CONTRACT_ROLE = keccak256("PRODUCT_CONTRACT_ROLE");
bytes32 constant TRANSFER_CONTRACT_ROLE = keccak256("TRANSFER_CONTRACT_ROLE");
// M6: contract dịch vụ bảo hành (M7) tạm dừng/tiếp tục bảo hành; contract vòng đời (M10) thu hồi,
// báo mất, ngừng sử dụng. Admin cấp role cho địa chỉ contract khi deploy module đó.
bytes32 constant SERVICE_CONTRACT_ROLE = keccak256("SERVICE_CONTRACT_ROLE");
bytes32 constant LIFECYCLE_CONTRACT_ROLE = keccak256("LIFECYCLE_CONTRACT_ROLE");
