// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {
    FeeStatus,
    InspectionResult,
    OrganizationStatus,
    PartyKind,
    ProductState,
    ServiceTicketState,
    TransferState,
    WarrantyState
} from "../shared/DppTypes.sol";
import {
    INSPECTOR_ROLE,
    LIFECYCLE_CONTRACT_ROLE,
    MANUFACTURER_ROLE,
    PRODUCT_CONTRACT_ROLE,
    REGISTRAR_ROLE,
    RETAILER_ROLE,
    SERVICE_CENTER_ROLE,
    SERVICE_CONTRACT_ROLE,
    TRANSFER_CONTRACT_ROLE
} from "../shared/DppRoles.sol";

/// @notice Chỉ dùng trong test: lộ hằng số đã biên dịch để đối chiếu với @dpp/shared.
contract DppConstantsHarness {
    function roleIds() external pure returns (bytes32[9] memory) {
        return [
            REGISTRAR_ROLE,
            MANUFACTURER_ROLE,
            RETAILER_ROLE,
            SERVICE_CENTER_ROLE,
            INSPECTOR_ROLE,
            PRODUCT_CONTRACT_ROLE,
            TRANSFER_CONTRACT_ROLE,
            SERVICE_CONTRACT_ROLE,
            LIFECYCLE_CONTRACT_ROLE
        ];
    }

    function enumMaxima() external pure returns (uint8[8] memory) {
        return [
            uint8(type(PartyKind).max),
            uint8(type(OrganizationStatus).max),
            uint8(type(FeeStatus).max),
            uint8(type(ProductState).max),
            uint8(type(WarrantyState).max),
            uint8(type(ServiceTicketState).max),
            uint8(type(InspectionResult).max),
            uint8(type(TransferState).max)
        ];
    }
}
