// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ZeroAddress, ZeroBytes32} from "../shared/DppErrors.sol";
import {REGISTRAR_ROLE} from "../shared/DppRoles.sol";
import {OrganizationStatus, PartyKind, ProductState, TransferState} from "../shared/DppTypes.sol";

/// @dev Cùng bố cục với `PartyRegistry.Organization` để giải mã kết quả của `organization()`.
struct TransferOrganization {
    bytes32 representativeId;
    OrganizationStatus status;
    bytes32 role;
    bytes32 profileHash;
}

/// @dev Cùng bố cục với `ProductPassport.Product` để giải mã kết quả của `product()`.
struct TransferProduct {
    bytes32 issuerId;
    bytes32 metadataHash;
    bytes32 custodianId;
    bytes32 pendingCustodianId;
    bytes32 ownerId;
    ProductState state;
    uint16 warrantyMonths;
}

interface ITransferPartyRegistry {
    function partyOf(address wallet) external view returns (bytes32);

    function kindOf(bytes32 partyId) external view returns (PartyKind);

    function organizationOf(bytes32 representativeId) external view returns (bytes32);

    function organization(bytes32 partyId) external view returns (TransferOrganization memory);

    function hasRole(bytes32 role, address account) external view returns (bool);
}

interface ITransferProductPassport {
    function product(bytes32 productId) external view returns (TransferProduct memory);

    function transferOwnership(bytes32 productId, bytes32 fromPartyId, bytes32 toPartyId) external;
}

interface ITransferServiceTickets {
    function openTicketOf(bytes32 productId) external view returns (bytes32);
}

/// @title OwnershipTransfer
/// @notice M9: chủ sở hữu tạo yêu cầu chuyển nhượng cho một tài khoản cá nhân hoặc tổ chức đã duyệt,
///         bên nhận chấp nhận hoặc từ chối bằng ví của mình, chủ sở hữu huỷ được, quá hạn thì ai
///         cũng đóng được. Chấp nhận gọi `ProductPassport.transferOwnership` (TRANSFER_CONTRACT_ROLE).
/// @dev Người đứng tên (chủ sở hữu, bên nhận) là Party cá nhân của ví, hoặc tổ chức đã duyệt mà ví
///      đó đại diện. Giấy phép EIP-712 của registrar chứng minh bên nhận là tài khoản có thật trong
///      hệ thống và thời hạn hợp lệ. Mỗi sản phẩm có tối đa một yêu cầu đang mở; bảo hành
///      (WarrantyManager) gắn với sản phẩm nên tự đi theo chủ mới. Đang có phiếu sửa thì không chuyển.
contract OwnershipTransfer is EIP712 {
    bytes32 public constant TRANSFER_AUTHORIZATION_TYPEHASH =
        keccak256(
            "TransferAuthorization(bytes32 productId,bytes32 fromPartyId,bytes32 toPartyId,uint64 expiresAt,uint256 deadline)"
        );

    /// @notice Thời hạn tối đa của một yêu cầu.
    uint64 public constant MAX_DURATION = 30 days;

    struct Request {
        bytes32 productId;
        bytes32 fromPartyId;
        bytes32 toPartyId;
        uint64 requestedAt;
        uint64 expiresAt;
        TransferState state;
    }

    ITransferPartyRegistry public immutable registry;
    ITransferProductPassport public immutable passport;
    ITransferServiceTickets public immutable serviceTickets;

    /// @notice Số yêu cầu đã tạo; requestId bắt đầu từ 1.
    uint256 public requestCount;
    mapping(uint256 requestId => Request) private _requests;
    mapping(bytes32 productId => uint256 requestId) private _activeRequestOf;

    event TransferRequested(
        uint256 indexed requestId,
        bytes32 indexed productId,
        bytes32 indexed fromPartyId,
        bytes32 toPartyId,
        uint64 expiresAt
    );
    event TransferCancelled(uint256 indexed requestId, bytes32 indexed productId);
    event TransferRejected(uint256 indexed requestId, bytes32 indexed productId);
    event TransferExpired(uint256 indexed requestId, bytes32 indexed productId);
    event TransferAccepted(
        uint256 indexed requestId,
        bytes32 indexed productId,
        bytes32 indexed fromPartyId,
        bytes32 toPartyId
    );

    error ProductNotSold(bytes32 productId, ProductState state);
    error NotProductOwner(bytes32 productId, address wallet);
    error InvalidRecipient(bytes32 toPartyId);
    error InvalidExpiry(uint64 expiresAt);
    error TransferAlreadyActive(bytes32 productId, uint256 requestId);
    error ProductUnderRepair(bytes32 productId, bytes32 ticketId);
    error RequestNotOpen(uint256 requestId, TransferState state);
    error NotSender(uint256 requestId, address wallet);
    error NotRecipient(uint256 requestId, address wallet);
    error RequestExpired(uint256 requestId, uint64 expiresAt);
    error RequestNotExpired(uint256 requestId, uint64 expiresAt);
    error AuthorizationExpired(uint256 deadline);
    error InvalidAuthorization();

    constructor(
        address partyRegistry,
        address productPassport,
        address serviceTicketManager
    ) EIP712("DPP OwnershipTransfer", "1") {
        if (
            partyRegistry == address(0) || productPassport == address(0) || serviceTicketManager == address(0)
        ) revert ZeroAddress();
        registry = ITransferPartyRegistry(partyRegistry);
        passport = ITransferProductPassport(productPassport);
        serviceTickets = ITransferServiceTickets(serviceTicketManager);
    }

    /// @notice TRF-01: chủ sở hữu tạo yêu cầu chuyển cho `toPartyId`, hết hạn lúc `expiresAt`.
    /// @dev Yêu cầu cũ đã quá hạn của sản phẩm được tự đóng (TransferExpired) trước khi tạo mới.
    /// @param authorization Chữ ký EIP-712 TransferAuthorization của khoá có REGISTRAR_ROLE.
    function createTransferRequest(
        bytes32 productId,
        bytes32 toPartyId,
        uint64 expiresAt,
        uint256 deadline,
        bytes calldata authorization
    ) external returns (uint256 requestId) {
        if (productId == bytes32(0) || toPartyId == bytes32(0)) revert ZeroBytes32();
        TransferProduct memory target = passport.product(productId);
        if (target.state != ProductState.SOLD) revert ProductNotSold(productId, target.state);
        if (!_actsFor(msg.sender, target.ownerId)) revert NotProductOwner(productId, msg.sender);
        if (toPartyId == target.ownerId || !_canReceive(toPartyId)) revert InvalidRecipient(toPartyId);
        if (expiresAt <= block.timestamp || expiresAt > block.timestamp + MAX_DURATION) {
            revert InvalidExpiry(expiresAt);
        }
        _requireNoOpenTicket(productId);
        uint256 active = _activeRequestOf[productId];
        if (active != 0) {
            if (block.timestamp <= _requests[active].expiresAt) revert TransferAlreadyActive(productId, active);
            _close(active, TransferState.EXPIRED);
        }
        if (block.timestamp > deadline) revert AuthorizationExpired(deadline);
        _requireRegistrarSignature(
            transferAuthorizationDigest(productId, target.ownerId, toPartyId, expiresAt, deadline),
            authorization
        );

        requestId = ++requestCount;
        _requests[requestId] = Request({
            productId: productId,
            fromPartyId: target.ownerId,
            toPartyId: toPartyId,
            requestedAt: uint64(block.timestamp),
            expiresAt: expiresAt,
            state: TransferState.REQUESTED
        });
        _activeRequestOf[productId] = requestId;
        emit TransferRequested(requestId, productId, target.ownerId, toPartyId, expiresAt);
    }

    /// @notice TRF-02: bên gửi huỷ yêu cầu đang mở.
    function cancelTransfer(uint256 requestId) external {
        Request storage stored = _open(requestId);
        if (!_actsFor(msg.sender, stored.fromPartyId)) revert NotSender(requestId, msg.sender);
        _close(requestId, TransferState.CANCELLED);
    }

    /// @notice TRF-03: bên nhận chấp nhận trước khi hết hạn; quyền sở hữu và custody đổi sang bên nhận.
    function acceptTransfer(uint256 requestId) external {
        Request storage stored = _open(requestId);
        if (!_actsFor(msg.sender, stored.toPartyId)) revert NotRecipient(requestId, msg.sender);
        if (block.timestamp > stored.expiresAt) revert RequestExpired(requestId, stored.expiresAt);
        _requireNoOpenTicket(stored.productId);
        bytes32 productId = stored.productId;
        bytes32 fromPartyId = stored.fromPartyId;
        bytes32 toPartyId = stored.toPartyId;
        _close(requestId, TransferState.COMPLETED);
        // ProductPassport kiểm tra lại sản phẩm còn SOLD và bên gửi vẫn là chủ sở hữu.
        passport.transferOwnership(productId, fromPartyId, toPartyId);
        emit TransferAccepted(requestId, productId, fromPartyId, toPartyId);
    }

    /// @notice TRF-04: bên nhận từ chối yêu cầu đang mở.
    function rejectTransfer(uint256 requestId) external {
        Request storage stored = _open(requestId);
        if (!_actsFor(msg.sender, stored.toPartyId)) revert NotRecipient(requestId, msg.sender);
        _close(requestId, TransferState.REJECTED);
    }

    /// @notice TRF-05: đóng yêu cầu đã quá hạn; ai gọi cũng được.
    function expireTransfer(uint256 requestId) external {
        Request storage stored = _open(requestId);
        if (block.timestamp <= stored.expiresAt) revert RequestNotExpired(requestId, stored.expiresAt);
        _close(requestId, TransferState.EXPIRED);
    }

    function request(uint256 requestId) external view returns (Request memory) {
        return _requests[requestId];
    }

    /// @notice Yêu cầu đang mở của sản phẩm (có thể đã quá hạn nhưng chưa đóng); 0 nếu không có.
    function activeRequestOf(bytes32 productId) external view returns (uint256) {
        return _activeRequestOf[productId];
    }

    /// @notice Digest EIP-712 của giấy phép tạo yêu cầu; backend và test đối chiếu với digest tự tính.
    function transferAuthorizationDigest(
        bytes32 productId,
        bytes32 fromPartyId,
        bytes32 toPartyId,
        uint64 expiresAt,
        uint256 deadline
    ) public view returns (bytes32) {
        return
            _hashTypedDataV4(
                keccak256(
                    abi.encode(TRANSFER_AUTHORIZATION_TYPEHASH, productId, fromPartyId, toPartyId, expiresAt, deadline)
                )
            );
    }

    /// @dev Ví đứng tên cho `partyId`: là Party cá nhân của ví, hoặc tổ chức đã duyệt mà ví đại diện.
    function _actsFor(address wallet, bytes32 partyId) private view returns (bool) {
        bytes32 user = registry.partyOf(wallet);
        if (user == bytes32(0) || partyId == bytes32(0)) {
            return false;
        }
        if (user == partyId) {
            return true;
        }
        return
            registry.organizationOf(user) == partyId &&
            registry.organization(partyId).status == OrganizationStatus.AUTHORIZED;
    }

    /// @dev Bên nhận: Party cá nhân (có thể chưa liên kết ví, sẽ liên kết trước khi chấp nhận) hoặc tổ
    ///      chức đã duyệt. Giấy phép của registrar đã xác nhận Party cá nhân có trong hệ thống.
    function _canReceive(bytes32 partyId) private view returns (bool) {
        PartyKind kind = registry.kindOf(partyId);
        if (kind == PartyKind.ORGANIZATION) {
            return registry.organization(partyId).status == OrganizationStatus.AUTHORIZED;
        }
        return true;
    }

    function _requireNoOpenTicket(bytes32 productId) private view {
        bytes32 ticketId = serviceTickets.openTicketOf(productId);
        if (ticketId != bytes32(0)) revert ProductUnderRepair(productId, ticketId);
    }

    function _open(uint256 requestId) private view returns (Request storage stored) {
        stored = _requests[requestId];
        if (stored.state != TransferState.REQUESTED) revert RequestNotOpen(requestId, stored.state);
    }

    function _close(uint256 requestId, TransferState state) private {
        Request storage stored = _requests[requestId];
        stored.state = state;
        delete _activeRequestOf[stored.productId];
        if (state == TransferState.CANCELLED) {
            emit TransferCancelled(requestId, stored.productId);
        } else if (state == TransferState.REJECTED) {
            emit TransferRejected(requestId, stored.productId);
        } else if (state == TransferState.EXPIRED) {
            emit TransferExpired(requestId, stored.productId);
        }
    }

    function _requireRegistrarSignature(bytes32 digest, bytes calldata authorization) private view {
        (address signer, ECDSA.RecoverError recoverError, ) = ECDSA.tryRecoverCalldata(digest, authorization);
        if (recoverError != ECDSA.RecoverError.NoError || !registry.hasRole(REGISTRAR_ROLE, signer)) {
            revert InvalidAuthorization();
        }
    }
}
