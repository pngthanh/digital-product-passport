// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ZeroAddress, ZeroBytes32} from "../shared/DppErrors.sol";
import {MANUFACTURER_ROLE, REGISTRAR_ROLE} from "../shared/DppRoles.sol";
import {OrganizationStatus, ProductState} from "../shared/DppTypes.sol";

/// @dev Cùng bố cục với `PartyRegistry.Organization` để giải mã kết quả của `organization()`.
struct LifecycleOrganization {
    bytes32 representativeId;
    OrganizationStatus status;
    bytes32 role;
    bytes32 profileHash;
}

/// @dev Cùng bố cục với `ProductPassport.Product` để giải mã kết quả của `product()`.
struct LifecycleProduct {
    bytes32 issuerId;
    bytes32 metadataHash;
    bytes32 custodianId;
    bytes32 pendingCustodianId;
    bytes32 ownerId;
    ProductState state;
    uint16 warrantyMonths;
}

interface ILifecyclePartyRegistry {
    function authorizedOrganizationOf(address wallet, bytes32 role) external view returns (bytes32);

    function partyOf(address wallet) external view returns (bytes32);

    function organizationOf(bytes32 representativeId) external view returns (bytes32);

    function organization(bytes32 partyId) external view returns (LifecycleOrganization memory);

    function hasRole(bytes32 role, address account) external view returns (bool);
}

interface ILifecycleProductPassport {
    function product(bytes32 productId) external view returns (LifecycleProduct memory);

    function setLifecycleState(bytes32 productId, ProductState newState) external;
}

interface ILifecycleServiceTickets {
    function openTicketOf(bytes32 productId) external view returns (bytes32);
}

/// @title ProductLifecycle
/// @notice M10: nhà sản xuất thu hồi một lô sản phẩm do mình phát hành (RCL-01); chủ sở hữu báo mất
///         hoặc bị trộm (LIF-01) và ngừng sử dụng (LIF-02). Cả ba là trạng thái cuối, gọi
///         `ProductPassport.setLifecycleState` qua LIFECYCLE_CONTRACT_ROLE.
/// @dev Lý do thu hồi lưu off-chain, on-chain giữ keccak256 của lý do; giấy phép EIP-712 của registrar
///      chứng minh lý do đã được lưu trong hệ thống trước khi ký. Báo mất và ngừng sử dụng không cần
///      giấy phép vì contract tự kiểm tra được chủ sở hữu. Event của contract này phát trước event đổi
///      trạng thái của ProductPassport để bên đọc còn thấy bên giữ hàng lúc thu hồi.
contract ProductLifecycle is EIP712 {
    bytes32 public constant RECALL_AUTHORIZATION_TYPEHASH =
        keccak256("RecallAuthorization(bytes32 issuerId,bytes32[] productIds,bytes32 reasonHash,uint256 deadline)");

    /// @notice Số sản phẩm tối đa mỗi lần thu hồi, bằng giới hạn một lô đăng ký của ProductPassport.
    uint256 public constant MAX_BATCH_SIZE = 50;

    ILifecyclePartyRegistry public immutable registry;
    ILifecycleProductPassport public immutable passport;
    ILifecycleServiceTickets public immutable serviceTickets;

    /// @notice keccak256 lý do thu hồi của từng sản phẩm; 0 nếu chưa thu hồi.
    mapping(bytes32 productId => bytes32 reasonHash) public recallReasonOf;

    event ProductRecalled(bytes32 indexed productId, bytes32 indexed issuerId, bytes32 reasonHash);
    event ProductReportedLostStolen(bytes32 indexed productId, bytes32 indexed ownerId);
    event ProductRetired(bytes32 indexed productId, bytes32 indexed ownerId);

    error NotAuthorizedManufacturer(address wallet);
    error InvalidBatchSize(uint256 size);
    error NotIssuer(bytes32 productId, bytes32 issuerId);
    error ProductNotRecallable(bytes32 productId, ProductState state);
    error ProductNotSold(bytes32 productId, ProductState state);
    error NotProductOwner(bytes32 productId, address wallet);
    error ProductUnderRepair(bytes32 productId, bytes32 ticketId);
    error AuthorizationExpired(uint256 deadline);
    error InvalidAuthorization();

    constructor(
        address partyRegistry,
        address productPassport,
        address serviceTicketManager
    ) EIP712("DPP ProductLifecycle", "1") {
        if (
            partyRegistry == address(0) || productPassport == address(0) || serviceTicketManager == address(0)
        ) revert ZeroAddress();
        registry = ILifecyclePartyRegistry(partyRegistry);
        passport = ILifecycleProductPassport(productPassport);
        serviceTickets = ILifecycleServiceTickets(serviceTicketManager);
    }

    /// @notice RCL-01: nhà sản xuất thu hồi các sản phẩm mình phát hành, chung một lý do. Sản phẩm
    ///         đang giao, đang ở cửa hàng hay đã bán đều thu hồi được; hàng đang giao tự huỷ bàn giao.
    /// @param authorization Chữ ký EIP-712 RecallAuthorization của khoá có REGISTRAR_ROLE.
    function recallProducts(
        bytes32[] calldata productIds,
        bytes32 reasonHash,
        uint256 deadline,
        bytes calldata authorization
    ) external {
        bytes32 issuerId = registry.authorizedOrganizationOf(msg.sender, MANUFACTURER_ROLE);
        if (issuerId == bytes32(0)) revert NotAuthorizedManufacturer(msg.sender);
        if (productIds.length == 0 || productIds.length > MAX_BATCH_SIZE) revert InvalidBatchSize(productIds.length);
        if (reasonHash == bytes32(0)) revert ZeroBytes32();
        if (block.timestamp > deadline) revert AuthorizationExpired(deadline);
        _requireRegistrarSignature(recallAuthorizationDigest(issuerId, productIds, reasonHash, deadline), authorization);

        for (uint256 i = 0; i < productIds.length; ++i) {
            bytes32 productId = productIds[i];
            LifecycleProduct memory target = passport.product(productId);
            if (target.issuerId != issuerId) revert NotIssuer(productId, issuerId);
            if (!_isRecallable(target.state)) revert ProductNotRecallable(productId, target.state);
            recallReasonOf[productId] = reasonHash;
            emit ProductRecalled(productId, issuerId, reasonHash);
            passport.setLifecycleState(productId, ProductState.RECALLED);
        }
    }

    /// @notice LIF-01: chủ sở hữu báo sản phẩm bị mất hoặc bị trộm. Không hoàn tác được.
    function reportLostStolen(bytes32 productId) external {
        bytes32 ownerId = _requireOwnerAction(productId);
        emit ProductReportedLostStolen(productId, ownerId);
        passport.setLifecycleState(productId, ProductState.LOST_STOLEN);
    }

    /// @notice LIF-02: chủ sở hữu ngừng sử dụng sản phẩm (thanh lý, tiêu huỷ). Không hoàn tác được.
    function retireProduct(bytes32 productId) external {
        bytes32 ownerId = _requireOwnerAction(productId);
        emit ProductRetired(productId, ownerId);
        passport.setLifecycleState(productId, ProductState.RETIRED);
    }

    /// @notice Digest EIP-712 của giấy phép thu hồi; backend và test đối chiếu với digest tự tính.
    function recallAuthorizationDigest(
        bytes32 issuerId,
        bytes32[] calldata productIds,
        bytes32 reasonHash,
        uint256 deadline
    ) public view returns (bytes32) {
        return
            _hashTypedDataV4(
                keccak256(
                    abi.encode(
                        RECALL_AUTHORIZATION_TYPEHASH,
                        issuerId,
                        keccak256(abi.encodePacked(productIds)),
                        reasonHash,
                        deadline
                    )
                )
            );
    }

    /// @dev Sản phẩm đang có chủ, ví gọi hàm đứng tên chủ sở hữu và sản phẩm không nằm ở trung tâm
    ///      bảo hành; trả partyId của chủ sở hữu.
    function _requireOwnerAction(bytes32 productId) private view returns (bytes32 ownerId) {
        if (productId == bytes32(0)) revert ZeroBytes32();
        LifecycleProduct memory target = passport.product(productId);
        if (target.state != ProductState.SOLD) revert ProductNotSold(productId, target.state);
        ownerId = target.ownerId;
        if (!_actsFor(msg.sender, ownerId)) revert NotProductOwner(productId, msg.sender);
        bytes32 ticketId = serviceTickets.openTicketOf(productId);
        if (ticketId != bytes32(0)) revert ProductUnderRepair(productId, ticketId);
    }

    function _isRecallable(ProductState state) private pure returns (bool) {
        return
            state == ProductState.CREATED ||
            state == ProductState.IN_DISTRIBUTION ||
            state == ProductState.AT_RETAIL ||
            state == ProductState.SOLD;
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

    function _requireRegistrarSignature(bytes32 digest, bytes calldata authorization) private view {
        (address signer, ECDSA.RecoverError recoverError, ) = ECDSA.tryRecoverCalldata(digest, authorization);
        if (recoverError != ECDSA.RecoverError.NoError || !registry.hasRole(REGISTRAR_ROLE, signer)) {
            revert InvalidAuthorization();
        }
    }
}
