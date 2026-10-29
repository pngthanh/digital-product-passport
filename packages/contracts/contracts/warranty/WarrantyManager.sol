// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ZeroAddress, ZeroBytes32} from "../shared/DppErrors.sol";
import {PRODUCT_CONTRACT_ROLE, SERVICE_CONTRACT_ROLE} from "../shared/DppRoles.sol";
import {WarrantyState} from "../shared/DppTypes.sol";
import {VietnamCalendar} from "../shared/VietnamCalendar.sol";

/// @dev Phần PartyRegistry mà WarrantyManager cần: role của contract gọi tới.
interface IRoleRegistry {
    function hasRole(bytes32 role, address account) external view returns (bool);
}

/// @title WarrantyManager
/// @notice Bảo hành của từng sản phẩm. M6: kích hoạt khi bán (DST-03), do ProductPassport gọi.
/// @dev Role của contract gọi tới đọc từ PartyRegistry (Admin cấp): PRODUCT_CONTRACT_ROLE cho
///      ProductPassport, SERVICE_CONTRACT_ROLE cho contract phiếu dịch vụ ở M7. Hết hạn không cần
///      giao dịch: `effectiveWarrantyState` suy ra từ thời gian (D10).
contract WarrantyManager {
    uint16 public constant MAX_WARRANTY_MONTHS = 120;

    struct Warranty {
        /// @dev partyId của bên kích hoạt (nhà bán lẻ).
        bytes32 activatedBy;
        uint64 activatedAt;
        uint64 expiresAt;
        uint16 months;
        bool suspended;
    }

    IRoleRegistry public immutable registry;

    mapping(bytes32 productId => Warranty) private _warranties;

    event WarrantyActivated(
        bytes32 indexed productId,
        bytes32 indexed activatedBy,
        uint64 activatedAt,
        uint64 expiresAt,
        uint16 months
    );
    event WarrantySuspended(bytes32 indexed productId);
    event WarrantyResumed(bytes32 indexed productId);

    error CallerNotAuthorized(address caller);
    error InvalidWarrantyMonths(uint16 months);
    error WarrantyAlreadyActivated(bytes32 productId);
    error WarrantyNotActive(bytes32 productId);
    error WarrantyNotSuspended(bytes32 productId);

    modifier onlyRole(bytes32 role) {
        if (!registry.hasRole(role, msg.sender)) revert CallerNotAuthorized(msg.sender);
        _;
    }

    constructor(address partyRegistry) {
        if (partyRegistry == address(0)) revert ZeroAddress();
        registry = IRoleRegistry(partyRegistry);
    }

    /// @notice DST-03: bảo hành bắt đầu từ lúc bán, kéo dài `months` tháng theo lịch Việt Nam.
    function activateWarranty(
        bytes32 productId,
        bytes32 activatedBy,
        uint16 months
    ) external onlyRole(PRODUCT_CONTRACT_ROLE) {
        if (productId == bytes32(0) || activatedBy == bytes32(0)) revert ZeroBytes32();
        if (months == 0 || months > MAX_WARRANTY_MONTHS) revert InvalidWarrantyMonths(months);
        if (_warranties[productId].activatedAt != 0) revert WarrantyAlreadyActivated(productId);
        uint64 activatedAt = uint64(block.timestamp);
        uint64 expiresAt = uint64(VietnamCalendar.addMonths(block.timestamp, months));
        _warranties[productId] = Warranty({
            activatedBy: activatedBy,
            activatedAt: activatedAt,
            expiresAt: expiresAt,
            months: months,
            suspended: false
        });
        emit WarrantyActivated(productId, activatedBy, activatedAt, expiresAt, months);
    }

    /// @notice M7: tạm dừng bảo hành khi sản phẩm đang được sửa.
    function suspendWarranty(bytes32 productId) external onlyRole(SERVICE_CONTRACT_ROLE) {
        if (effectiveWarrantyState(productId) != WarrantyState.ACTIVE) revert WarrantyNotActive(productId);
        _warranties[productId].suspended = true;
        emit WarrantySuspended(productId);
    }

    /// @notice M7: tiếp tục bảo hành khi đóng phiếu sửa.
    function resumeWarranty(bytes32 productId) external onlyRole(SERVICE_CONTRACT_ROLE) {
        if (!_warranties[productId].suspended) revert WarrantyNotSuspended(productId);
        _warranties[productId].suspended = false;
        emit WarrantyResumed(productId);
    }

    function warrantyOf(bytes32 productId) external view returns (Warranty memory) {
        return _warranties[productId];
    }

    /// @notice NONE (chưa kích hoạt), ACTIVE, SUSPENDED (đang sửa) hoặc EXPIRED (từ `expiresAt`).
    function effectiveWarrantyState(bytes32 productId) public view returns (WarrantyState) {
        Warranty storage warranty = _warranties[productId];
        if (warranty.activatedAt == 0) {
            return WarrantyState.NONE;
        }
        // Hết hạn theo thời gian kể cả khi đang tạm dừng (bảng chuyển trạng thái Warranty của M0).
        if (block.timestamp >= warranty.expiresAt) {
            return WarrantyState.EXPIRED;
        }
        return warranty.suspended ? WarrantyState.SUSPENDED : WarrantyState.ACTIVE;
    }
}
