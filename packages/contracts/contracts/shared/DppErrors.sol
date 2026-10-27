// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Lỗi dùng chung giữa các contract. Lỗi riêng của từng nghiệp vụ khai báo trong contract đó.

error ZeroAddress();
error ZeroBytes32();
error PartyNotActive(bytes32 partyId);
error MissingPartyRole(bytes32 partyId, bytes32 role);
error InvalidStateTransition(uint8 current, uint8 next);
error IncorrectFeeAmount(uint256 expected, uint256 received);
