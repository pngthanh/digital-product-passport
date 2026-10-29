// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {InvalidStateTransition, ZeroAddress, ZeroBytes32} from "../shared/DppErrors.sol";
import {
    LIFECYCLE_CONTRACT_ROLE,
    MANUFACTURER_ROLE,
    REGISTRAR_ROLE,
    RETAILER_ROLE,
    TRANSFER_CONTRACT_ROLE
} from "../shared/DppRoles.sol";
import {PartyKind, ProductState} from "../shared/DppTypes.sol";

/// @dev Phần PartyRegistry mà ProductPassport cần: quyền tổ chức, loại Party và role.
interface IPartyRegistry {
    function authorizedOrganizationOf(address wallet, bytes32 role) external view returns (bytes32);

    function hasPartyRole(bytes32 partyId, bytes32 role) external view returns (bool);

    function kindOf(bytes32 partyId) external view returns (PartyKind);

    function hasRole(bytes32 role, address account) external view returns (bool);
}

interface IWarrantyManager {
    function activateWarranty(bytes32 productId, bytes32 activatedBy, uint16 months) external;
}

/// @title ProductPassport (phiên bản 2)
/// @notice Hộ chiếu số của từng sản phẩm: định danh, trạng thái, bên giữ hàng (custody) và chủ sở
///         hữu (ownership) tách riêng. M5: đăng ký. M6: giao hàng 2 bước nhà sản xuất → nhà bán lẻ
///         (D7), bán và kích hoạt bảo hành.
/// @dev Ví cá nhân của người đại diện ký và trả gas; quyền tổ chức lấy từ PartyRegistry (D26).
///      Backend ký giấy phép EIP-712 cho hai bước cần dữ liệu off-chain: hồ sơ sản phẩm khi đăng ký
///      và tài khoản người mua khi bán. Các bước còn lại contract tự kiểm tra hết.
///      Chuyển nhượng (M9) và thu hồi, báo mất, ngừng sử dụng (M10) do contract riêng gọi vào qua
///      TRANSFER_CONTRACT_ROLE, LIFECYCLE_CONTRACT_ROLE nên không phải deploy lại ProductPassport.
contract ProductPassport is EIP712 {
    bytes32 public constant PRODUCT_REGISTRATION_TYPEHASH =
        keccak256(
            "ProductRegistration(bytes32 issuerId,bytes32[] productIds,bytes32[] metadataHashes,uint16[] warrantyMonths,uint256 deadline)"
        );
    bytes32 public constant PRODUCT_SALE_TYPEHASH =
        keccak256("ProductSale(bytes32 productId,bytes32 retailerId,bytes32 buyerId,uint256 deadline)");
    /// @notice Số sản phẩm tối đa mỗi giao dịch (một lô CSV), giữ gas dưới giới hạn mỗi giao dịch.
    uint256 public constant MAX_BATCH_SIZE = 50;
    uint16 public constant MAX_WARRANTY_MONTHS = 120;
    bytes32 private constant DEFAULT_ADMIN_ROLE = 0x00;

    struct Product {
        bytes32 issuerId;
        bytes32 metadataHash;
        /// @dev Bên đang giữ hàng; lưu 0 khi nhà sản xuất còn giữ để đăng ký rẻ hơn, hàm view trả issuerId.
        bytes32 custodianId;
        /// @dev Nhà bán lẻ đang được giao tới, chỉ khác 0 khi IN_DISTRIBUTION.
        bytes32 pendingCustodianId;
        /// @dev Chủ sở hữu, chỉ khác 0 từ lúc bán.
        bytes32 ownerId;
        ProductState state;
        uint16 warrantyMonths;
    }

    IPartyRegistry public immutable registry;
    IWarrantyManager public warrantyManager;

    mapping(bytes32 productId => Product) private _products;

    event ProductRegistered(
        bytes32 indexed productId,
        bytes32 indexed issuerId,
        bytes32 metadataHash,
        uint16 warrantyMonths
    );
    event ProductStateChanged(bytes32 indexed productId, ProductState previousState, ProductState newState);
    event CustodyHandoverInitiated(bytes32 indexed productId, bytes32 indexed fromPartyId, bytes32 indexed toPartyId);
    event CustodyHandoverCancelled(bytes32 indexed productId, bytes32 indexed fromPartyId, bytes32 indexed toPartyId);
    event CustodyHandoverRejected(bytes32 indexed productId, bytes32 indexed fromPartyId, bytes32 indexed toPartyId);
    event CustodyTransferred(bytes32 indexed productId, bytes32 indexed fromPartyId, bytes32 indexed toPartyId);
    event OwnershipTransferred(bytes32 indexed productId, bytes32 indexed fromPartyId, bytes32 indexed toPartyId);
    event WarrantyManagerUpdated(address previousManager, address newManager);

    error NotAuthorizedManufacturer(address wallet);
    error NotAuthorizedRetailer(address wallet);
    error IssuerMismatch(bytes32 issuerOfSender, bytes32 issuerId);
    error InvalidBatchSize(uint256 size);
    error LengthMismatch(uint256 productIds, uint256 metadataHashes, uint256 warrantyMonths);
    error WarrantyTooLong(uint16 months);
    error ProductAlreadyRegistered(bytes32 productId);
    error ProductNotFound(bytes32 productId);
    error NotCustodian(bytes32 productId, bytes32 partyId);
    error NotPendingCustodian(bytes32 productId, bytes32 partyId);
    error RecipientNotRetailer(bytes32 partyId);
    error InvalidBuyer(bytes32 buyerId);
    error NotOwner(bytes32 productId, bytes32 partyId);
    error CallerNotAuthorized(address caller);
    error InvalidLifecycleState(ProductState state);
    error AuthorizationExpired(uint256 deadline);
    error InvalidAuthorization();

    modifier onlyContractRole(bytes32 role) {
        if (!registry.hasRole(role, msg.sender)) revert CallerNotAuthorized(msg.sender);
        _;
    }

    constructor(address partyRegistry, address warranty) EIP712("DPP ProductPassport", "2") {
        if (partyRegistry == address(0) || warranty == address(0)) revert ZeroAddress();
        registry = IPartyRegistry(partyRegistry);
        warrantyManager = IWarrantyManager(warranty);
    }

    // ----- PRD-01, PRD-02: đăng ký -------------------------------------------------------------

    /// @notice Nhà sản xuất đăng ký một hoặc nhiều sản phẩm trong một giao dịch.
    /// @param issuerId partyId của nhà sản xuất mà ví gọi hàm đang đại diện.
    /// @param productIds Mã sản phẩm on-chain do backend tính từ (nhà sản xuất, serial).
    /// @param metadataHashes keccak256 hồ sơ của từng sản phẩm, cùng thứ tự với `productIds`.
    /// @param warrantyMonths Số tháng bảo hành đã khoá trong hồ sơ; nhà bán lẻ không đổi được.
    /// @param authorization Chữ ký EIP-712 ProductRegistration của khoá có REGISTRAR_ROLE.
    function registerProducts(
        bytes32 issuerId,
        bytes32[] calldata productIds,
        bytes32[] calldata metadataHashes,
        uint16[] calldata warrantyMonths,
        uint256 deadline,
        bytes calldata authorization
    ) external {
        uint256 count = productIds.length;
        if (count == 0 || count > MAX_BATCH_SIZE) revert InvalidBatchSize(count);
        if (metadataHashes.length != count || warrantyMonths.length != count) {
            revert LengthMismatch(count, metadataHashes.length, warrantyMonths.length);
        }
        bytes32 issuerOfSender = registry.authorizedOrganizationOf(msg.sender, MANUFACTURER_ROLE);
        if (issuerOfSender == bytes32(0)) revert NotAuthorizedManufacturer(msg.sender);
        if (issuerOfSender != issuerId) revert IssuerMismatch(issuerOfSender, issuerId);
        _requireDeadline(deadline);
        _requireRegistrarSignature(
            productRegistrationDigest(issuerId, productIds, metadataHashes, warrantyMonths, deadline),
            authorization
        );

        for (uint256 i = 0; i < count; ++i) {
            _register(issuerId, productIds[i], metadataHashes[i], warrantyMonths[i]);
        }
    }

    // ----- DST-01, DST-02: giao hàng 2 bước (D7) -----------------------------------------------

    /// @notice DST-01: nhà sản xuất đang giữ hàng gửi sản phẩm cho một nhà bán lẻ đã được duyệt.
    function dispatchCustody(bytes32 productId, bytes32 toPartyId) external {
        Product storage stored = _existing(productId);
        _requireState(stored, ProductState.CREATED, ProductState.IN_DISTRIBUTION);
        bytes32 sender = _manufacturerOf(msg.sender);
        bytes32 custodian = _custodianOf(stored);
        if (sender != custodian) revert NotCustodian(productId, sender);
        if (!registry.hasPartyRole(toPartyId, RETAILER_ROLE)) revert RecipientNotRetailer(toPartyId);

        stored.pendingCustodianId = toPartyId;
        emit CustodyHandoverInitiated(productId, custodian, toPartyId);
        _setState(productId, stored, ProductState.IN_DISTRIBUTION);
    }

    /// @notice Nhà sản xuất huỷ lô gửi khi nhà bán lẻ chưa nhận (gửi nhầm), hàng vẫn ở nhà sản xuất.
    function cancelDispatch(bytes32 productId) external {
        Product storage stored = _existing(productId);
        _requireState(stored, ProductState.IN_DISTRIBUTION, ProductState.CREATED);
        bytes32 sender = _manufacturerOf(msg.sender);
        bytes32 custodian = _custodianOf(stored);
        if (sender != custodian) revert NotCustodian(productId, sender);

        bytes32 recipient = stored.pendingCustodianId;
        stored.pendingCustodianId = bytes32(0);
        emit CustodyHandoverCancelled(productId, custodian, recipient);
        _setState(productId, stored, ProductState.CREATED);
    }

    /// @notice DST-02: nhà bán lẻ được giao xác nhận đã nhận hàng; từ đây nhà bán lẻ giữ hàng.
    function confirmCustodyReceipt(bytes32 productId) external {
        Product storage stored = _existing(productId);
        _requireState(stored, ProductState.IN_DISTRIBUTION, ProductState.AT_RETAIL);
        bytes32 retailer = _pendingRetailerOf(productId, stored);

        bytes32 previous = _custodianOf(stored);
        stored.custodianId = retailer;
        stored.pendingCustodianId = bytes32(0);
        emit CustodyTransferred(productId, previous, retailer);
        _setState(productId, stored, ProductState.AT_RETAIL);
    }

    /// @notice Nhà bán lẻ được giao từ chối nhận (không đúng hàng); hàng về lại nhà sản xuất.
    function rejectCustodyReceipt(bytes32 productId) external {
        Product storage stored = _existing(productId);
        _requireState(stored, ProductState.IN_DISTRIBUTION, ProductState.CREATED);
        bytes32 retailer = _pendingRetailerOf(productId, stored);

        stored.pendingCustodianId = bytes32(0);
        emit CustodyHandoverRejected(productId, _custodianOf(stored), retailer);
        _setState(productId, stored, ProductState.CREATED);
    }

    // ----- DST-03: bán và kích hoạt bảo hành ---------------------------------------------------

    /// @notice Nhà bán lẻ đang giữ hàng bán cho người mua: người mua thành chủ sở hữu và giữ hàng,
    ///         bảo hành bắt đầu theo số tháng đã đăng ký (0 tháng thì không kích hoạt).
    /// @param buyerId partyId của tài khoản người mua; người mua chưa cần liên kết ví.
    /// @param authorization Chữ ký EIP-712 ProductSale của registrar: backend xác nhận đúng tài khoản người mua.
    function sellAndActivateWarranty(
        bytes32 productId,
        bytes32 buyerId,
        uint256 deadline,
        bytes calldata authorization
    ) external {
        Product storage stored = _existing(productId);
        _requireState(stored, ProductState.AT_RETAIL, ProductState.SOLD);
        bytes32 retailer = registry.authorizedOrganizationOf(msg.sender, RETAILER_ROLE);
        if (retailer == bytes32(0)) revert NotAuthorizedRetailer(msg.sender);
        if (retailer != stored.custodianId) revert NotCustodian(productId, retailer);
        if (buyerId == bytes32(0) || registry.kindOf(buyerId) == PartyKind.ORGANIZATION) {
            revert InvalidBuyer(buyerId);
        }
        _requireDeadline(deadline);
        _requireRegistrarSignature(productSaleDigest(productId, retailer, buyerId, deadline), authorization);

        stored.ownerId = buyerId;
        stored.custodianId = buyerId;
        emit OwnershipTransferred(productId, bytes32(0), buyerId);
        emit CustodyTransferred(productId, retailer, buyerId);
        _setState(productId, stored, ProductState.SOLD);
        if (stored.warrantyMonths > 0) {
            warrantyManager.activateWarranty(productId, retailer, stored.warrantyMonths);
        }
    }

    // ----- Điểm nối cho module sau --------------------------------------------------------------

    /// @notice M9: contract chuyển nhượng (TRANSFER_CONTRACT_ROLE) đổi chủ sở hữu sau khi bên nhận đồng ý.
    function transferOwnership(
        bytes32 productId,
        bytes32 fromPartyId,
        bytes32 toPartyId
    ) external onlyContractRole(TRANSFER_CONTRACT_ROLE) {
        Product storage stored = _existing(productId);
        if (stored.state != ProductState.SOLD) {
            revert InvalidStateTransition(uint8(stored.state), uint8(ProductState.SOLD));
        }
        if (stored.ownerId != fromPartyId) revert NotOwner(productId, fromPartyId);
        if (toPartyId == bytes32(0) || toPartyId == fromPartyId) revert InvalidBuyer(toPartyId);

        bytes32 previousCustodian = stored.custodianId;
        stored.ownerId = toPartyId;
        stored.custodianId = toPartyId;
        emit OwnershipTransferred(productId, fromPartyId, toPartyId);
        emit CustodyTransferred(productId, previousCustodian, toPartyId);
    }

    /// @notice M10: contract vòng đời (LIFECYCLE_CONTRACT_ROLE) chuyển sang RECALLED, LOST_STOLEN
    ///         hoặc RETIRED. Báo mất và ngừng sử dụng chỉ áp dụng cho sản phẩm đã có chủ.
    function setLifecycleState(
        bytes32 productId,
        ProductState newState
    ) external onlyContractRole(LIFECYCLE_CONTRACT_ROLE) {
        Product storage stored = _existing(productId);
        if (
            newState != ProductState.RECALLED &&
            newState != ProductState.LOST_STOLEN &&
            newState != ProductState.RETIRED
        ) {
            revert InvalidLifecycleState(newState);
        }
        if (stored.state == newState || (newState != ProductState.RECALLED && stored.ownerId == bytes32(0))) {
            revert InvalidStateTransition(uint8(stored.state), uint8(newState));
        }
        if (stored.state == ProductState.IN_DISTRIBUTION) {
            bytes32 recipient = stored.pendingCustodianId;
            stored.pendingCustodianId = bytes32(0);
            emit CustodyHandoverCancelled(productId, _custodianOf(stored), recipient);
        }
        _setState(productId, stored, newState);
    }

    /// @notice Admin đổi WarrantyManager khi phải deploy bản mới (M7); sản phẩm đã bán giữ bảo hành cũ.
    function setWarrantyManager(address newManager) external onlyContractRole(DEFAULT_ADMIN_ROLE) {
        if (newManager == address(0)) revert ZeroAddress();
        emit WarrantyManagerUpdated(address(warrantyManager), newManager);
        warrantyManager = IWarrantyManager(newManager);
    }

    // ----- View -------------------------------------------------------------------------------

    /// @notice Hồ sơ on-chain của sản phẩm; `state == NONE` nghĩa là chưa đăng ký.
    function product(bytes32 productId) external view returns (Product memory result) {
        result = _products[productId];
        if (result.state != ProductState.NONE && result.custodianId == bytes32(0)) {
            result.custodianId = result.issuerId;
        }
    }

    function stateOf(bytes32 productId) external view returns (ProductState) {
        return _products[productId].state;
    }

    /// @notice Bên đang giữ hàng (nhà sản xuất, nhà bán lẻ hoặc người mua); bytes32(0) nếu chưa đăng ký.
    function custodianOf(bytes32 productId) external view returns (bytes32) {
        Product storage stored = _products[productId];
        return stored.state == ProductState.NONE ? bytes32(0) : _custodianOf(stored);
    }

    function pendingCustodianOf(bytes32 productId) external view returns (bytes32) {
        return _products[productId].pendingCustodianId;
    }

    function ownerOf(bytes32 productId) external view returns (bytes32) {
        return _products[productId].ownerId;
    }

    /// @notice Digest EIP-712 của giấy phép đăng ký; backend và test đối chiếu với digest tự tính.
    function productRegistrationDigest(
        bytes32 issuerId,
        bytes32[] calldata productIds,
        bytes32[] calldata metadataHashes,
        uint16[] calldata warrantyMonths,
        uint256 deadline
    ) public view returns (bytes32) {
        return
            _hashTypedDataV4(
                keccak256(
                    abi.encode(
                        PRODUCT_REGISTRATION_TYPEHASH,
                        issuerId,
                        keccak256(abi.encodePacked(productIds)),
                        keccak256(abi.encodePacked(metadataHashes)),
                        _hashUint16Array(warrantyMonths),
                        deadline
                    )
                )
            );
    }

    /// @notice Digest EIP-712 của giấy phép bán cho người mua `buyerId`.
    function productSaleDigest(
        bytes32 productId,
        bytes32 retailerId,
        bytes32 buyerId,
        uint256 deadline
    ) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(PRODUCT_SALE_TYPEHASH, productId, retailerId, buyerId, deadline)));
    }

    // ----- Nội bộ -----------------------------------------------------------------------------

    function _register(bytes32 issuerId, bytes32 productId, bytes32 metadataHash, uint16 months) private {
        if (productId == bytes32(0) || metadataHash == bytes32(0)) revert ZeroBytes32();
        if (months > MAX_WARRANTY_MONTHS) revert WarrantyTooLong(months);
        Product storage stored = _products[productId];
        if (stored.state != ProductState.NONE) revert ProductAlreadyRegistered(productId);
        stored.issuerId = issuerId;
        stored.metadataHash = metadataHash;
        stored.state = ProductState.CREATED;
        stored.warrantyMonths = months;
        emit ProductRegistered(productId, issuerId, metadataHash, months);
    }

    function _existing(bytes32 productId) private view returns (Product storage stored) {
        stored = _products[productId];
        if (stored.state == ProductState.NONE) revert ProductNotFound(productId);
    }

    function _custodianOf(Product storage stored) private view returns (bytes32) {
        bytes32 custodian = stored.custodianId;
        return custodian == bytes32(0) ? stored.issuerId : custodian;
    }

    function _manufacturerOf(address wallet) private view returns (bytes32 partyId) {
        partyId = registry.authorizedOrganizationOf(wallet, MANUFACTURER_ROLE);
        if (partyId == bytes32(0)) revert NotAuthorizedManufacturer(wallet);
    }

    function _pendingRetailerOf(bytes32 productId, Product storage stored) private view returns (bytes32 retailer) {
        retailer = registry.authorizedOrganizationOf(msg.sender, RETAILER_ROLE);
        if (retailer == bytes32(0)) revert NotAuthorizedRetailer(msg.sender);
        if (retailer != stored.pendingCustodianId) revert NotPendingCustodian(productId, retailer);
    }

    function _requireState(Product storage stored, ProductState expected, ProductState next) private view {
        if (stored.state != expected) revert InvalidStateTransition(uint8(stored.state), uint8(next));
    }

    /// @dev Phát ProductStateChanged sau các event custody/ownership của cùng bước để Indexer đối chiếu.
    function _setState(bytes32 productId, Product storage stored, ProductState newState) private {
        ProductState previous = stored.state;
        stored.state = newState;
        emit ProductStateChanged(productId, previous, newState);
    }

    function _requireDeadline(uint256 deadline) private view {
        if (block.timestamp > deadline) revert AuthorizationExpired(deadline);
    }

    function _requireRegistrarSignature(bytes32 digest, bytes calldata authorization) private view {
        (address signer, ECDSA.RecoverError recoverError, ) = ECDSA.tryRecoverCalldata(digest, authorization);
        if (recoverError != ECDSA.RecoverError.NoError || !registry.hasRole(REGISTRAR_ROLE, signer)) {
            revert InvalidAuthorization();
        }
    }

    /// @dev EIP-712 băm mảng giá trị nguyên tố bằng keccak256 của các phần tử đã mã hoá 32 byte.
    function _hashUint16Array(uint16[] calldata values) private pure returns (bytes32) {
        uint256[] memory widened = new uint256[](values.length);
        for (uint256 i = 0; i < values.length; ++i) {
            widened[i] = values[i];
        }
        return keccak256(abi.encodePacked(widened));
    }
}
