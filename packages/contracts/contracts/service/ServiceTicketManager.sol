// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ZeroAddress, ZeroBytes32} from "../shared/DppErrors.sol";
import {REGISTRAR_ROLE, SERVICE_CENTER_ROLE} from "../shared/DppRoles.sol";
import {ProductState, ServiceTicketState, WarrantyState} from "../shared/DppTypes.sol";

/// @dev Phần PartyRegistry mà contract cần: quyền tổ chức của ví gọi và role của khoá ký giấy phép.
interface IServicePartyRegistry {
    function authorizedOrganizationOf(address wallet, bytes32 role) external view returns (bytes32);

    function hasRole(bytes32 role, address account) external view returns (bool);
}

interface IServiceProductPassport {
    function stateOf(bytes32 productId) external view returns (ProductState);

    function ownerOf(bytes32 productId) external view returns (bytes32);
}

interface IServiceWarrantyManager {
    function effectiveWarrantyState(bytes32 productId) external view returns (WarrantyState);

    function suspendWarranty(bytes32 productId) external;

    function resumeWarranty(bytes32 productId) external;
}

/// @title ServiceTicketManager
/// @notice M7: phiếu sửa chữa do trung tâm bảo hành mở và đóng. Còn bảo hành thì tạm dừng bảo hành
///         trong lúc sửa và tiếp tục khi đóng phiếu; hết bảo hành vẫn mở được, ghi "ngoài bảo hành".
/// @dev Chủ sở hữu gửi yêu cầu off-chain (không cần ví). Giấy phép EIP-712 của registrar chứng minh
///      chủ sở hữu đã chọn đúng trung tâm này cho đúng sản phẩm, nên trung tâm không tự mở phiếu và
///      tạm dừng bảo hành của người khác được. Mỗi ticketId chỉ dùng một lần nên giấy phép không dùng
///      lại được. Contract cần SERVICE_CONTRACT_ROLE trên PartyRegistry để gọi WarrantyManager.
contract ServiceTicketManager is EIP712 {
    bytes32 public constant SERVICE_TICKET_OPENING_TYPEHASH =
        keccak256(
            "ServiceTicketOpening(bytes32 ticketId,bytes32 productId,bytes32 serviceCenterId,bytes32 requesterId,uint256 deadline)"
        );

    struct Ticket {
        bytes32 productId;
        bytes32 serviceCenterId;
        /// @dev Chủ sở hữu tại lúc mở phiếu.
        bytes32 requesterId;
        /// @dev Hash của biên bản (nội dung và file đính kèm) khi đóng phiếu.
        bytes32 evidenceHash;
        uint64 openedAt;
        uint64 closedAt;
        ServiceTicketState state;
        /// @dev Bảo hành ACTIVE lúc mở phiếu thì true (được bảo hành chi trả, đã tạm dừng bảo hành).
        bool warrantyCovered;
    }

    IServicePartyRegistry public immutable registry;
    IServiceProductPassport public immutable passport;
    IServiceWarrantyManager public immutable warranty;

    mapping(bytes32 ticketId => Ticket) private _tickets;
    /// @dev Phiếu đang mở của sản phẩm; mỗi sản phẩm tối đa một phiếu (khớp `ux_service_one_open`).
    mapping(bytes32 productId => bytes32 ticketId) private _openTicketOf;

    event ServiceTicketOpened(
        bytes32 indexed ticketId,
        bytes32 indexed productId,
        bytes32 indexed serviceCenterId,
        bytes32 requesterId,
        bool warrantyCovered
    );
    event ServiceTicketClosed(
        bytes32 indexed ticketId,
        bytes32 indexed productId,
        ServiceTicketState state,
        bytes32 evidenceHash
    );

    error NotAuthorizedServiceCenter(address wallet);
    error TicketAlreadyExists(bytes32 ticketId);
    error ProductHasOpenTicket(bytes32 productId, bytes32 ticketId);
    error ProductNotOwned(bytes32 productId, ProductState state);
    error RequesterNotOwner(bytes32 productId, bytes32 requesterId);
    error TicketNotOpen(bytes32 ticketId);
    error NotTicketServiceCenter(bytes32 ticketId, bytes32 partyId);
    error AuthorizationExpired(uint256 deadline);
    error InvalidAuthorization();

    constructor(address partyRegistry, address productPassport, address warrantyManager)
        EIP712("DPP ServiceTicketManager", "1")
    {
        if (partyRegistry == address(0) || productPassport == address(0) || warrantyManager == address(0)) {
            revert ZeroAddress();
        }
        registry = IServicePartyRegistry(partyRegistry);
        passport = IServiceProductPassport(productPassport);
        warranty = IServiceWarrantyManager(warrantyManager);
    }

    /// @notice SVC-03: trung tâm bảo hành tiếp nhận yêu cầu của chủ sở hữu và mở phiếu sửa.
    /// @param ticketId Mã phiếu do backend tính từ UUID của yêu cầu (service_requests).
    /// @param requesterId partyId của chủ sở hữu đã gửi yêu cầu.
    /// @param authorization Chữ ký EIP-712 ServiceTicketOpening của khoá có REGISTRAR_ROLE.
    function openTicket(
        bytes32 ticketId,
        bytes32 productId,
        bytes32 requesterId,
        uint256 deadline,
        bytes calldata authorization
    ) external {
        if (ticketId == bytes32(0) || productId == bytes32(0) || requesterId == bytes32(0)) revert ZeroBytes32();
        bytes32 center = _serviceCenterOf(msg.sender);
        if (_tickets[ticketId].state != ServiceTicketState.NONE) revert TicketAlreadyExists(ticketId);
        bytes32 open = _openTicketOf[productId];
        if (open != bytes32(0)) revert ProductHasOpenTicket(productId, open);
        ProductState state = passport.stateOf(productId);
        if (state != ProductState.SOLD) revert ProductNotOwned(productId, state);
        if (passport.ownerOf(productId) != requesterId) revert RequesterNotOwner(productId, requesterId);
        if (block.timestamp > deadline) revert AuthorizationExpired(deadline);
        _requireRegistrarSignature(
            serviceTicketOpeningDigest(ticketId, productId, center, requesterId, deadline),
            authorization
        );

        bool covered = warranty.effectiveWarrantyState(productId) == WarrantyState.ACTIVE;
        _tickets[ticketId] = Ticket({
            productId: productId,
            serviceCenterId: center,
            requesterId: requesterId,
            evidenceHash: bytes32(0),
            openedAt: uint64(block.timestamp),
            closedAt: 0,
            state: ServiceTicketState.IN_REPAIR,
            warrantyCovered: covered
        });
        _openTicketOf[productId] = ticketId;
        emit ServiceTicketOpened(ticketId, productId, center, requesterId, covered);
        if (covered) {
            warranty.suspendWarranty(productId);
        }
    }

    /// @notice SVC-04: trung tâm đã mở phiếu ghi kết quả (đã sửa hoặc không sửa được) và đóng phiếu.
    /// @param evidenceHash Hash của biên bản sửa chữa (nội dung và file đính kèm) lưu off-chain.
    function closeTicket(bytes32 ticketId, bool repaired, bytes32 evidenceHash) external {
        if (evidenceHash == bytes32(0)) revert ZeroBytes32();
        Ticket storage stored = _tickets[ticketId];
        if (stored.state != ServiceTicketState.IN_REPAIR) revert TicketNotOpen(ticketId);
        bytes32 center = _serviceCenterOf(msg.sender);
        if (center != stored.serviceCenterId) revert NotTicketServiceCenter(ticketId, center);

        ServiceTicketState result = repaired ? ServiceTicketState.REPAIRED : ServiceTicketState.REJECTED;
        stored.state = result;
        stored.evidenceHash = evidenceHash;
        stored.closedAt = uint64(block.timestamp);
        delete _openTicketOf[stored.productId];
        emit ServiceTicketClosed(ticketId, stored.productId, result, evidenceHash);
        // Hết hạn trong lúc sửa thì vẫn bỏ cờ tạm dừng; trạng thái hiệu lực vẫn là EXPIRED.
        if (stored.warrantyCovered) {
            warranty.resumeWarranty(stored.productId);
        }
    }

    function ticket(bytes32 ticketId) external view returns (Ticket memory) {
        return _tickets[ticketId];
    }

    /// @notice Phiếu đang mở của sản phẩm; bytes32(0) nếu không có.
    function openTicketOf(bytes32 productId) external view returns (bytes32) {
        return _openTicketOf[productId];
    }

    /// @notice Digest EIP-712 của giấy phép mở phiếu; backend và test đối chiếu với digest tự tính.
    function serviceTicketOpeningDigest(
        bytes32 ticketId,
        bytes32 productId,
        bytes32 serviceCenterId,
        bytes32 requesterId,
        uint256 deadline
    ) public view returns (bytes32) {
        return
            _hashTypedDataV4(
                keccak256(
                    abi.encode(
                        SERVICE_TICKET_OPENING_TYPEHASH,
                        ticketId,
                        productId,
                        serviceCenterId,
                        requesterId,
                        deadline
                    )
                )
            );
    }

    function _serviceCenterOf(address wallet) private view returns (bytes32 partyId) {
        partyId = registry.authorizedOrganizationOf(wallet, SERVICE_CENTER_ROLE);
        if (partyId == bytes32(0)) revert NotAuthorizedServiceCenter(wallet);
    }

    function _requireRegistrarSignature(bytes32 digest, bytes calldata authorization) private view {
        (address signer, ECDSA.RecoverError recoverError, ) = ECDSA.tryRecoverCalldata(digest, authorization);
        if (recoverError != ECDSA.RecoverError.NoError || !registry.hasRole(REGISTRAR_ROLE, signer)) {
            revert InvalidAuthorization();
        }
    }
}
