// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ZeroAddress, ZeroBytes32} from "../shared/DppErrors.sol";
import {MANUFACTURER_ROLE, REGISTRAR_ROLE} from "../shared/DppRoles.sol";
import {ProductState} from "../shared/DppTypes.sol";

/// @dev Phần PartyRegistry mà ProductPassport cần: quyền tổ chức và khoá ký giấy phép.
interface IPartyRegistry {
    function authorizedOrganizationOf(address wallet, bytes32 role) external view returns (bytes32);

    function hasRole(bytes32 role, address account) external view returns (bool);
}

/// @title ProductPassport
/// @notice Hộ chiếu số của từng sản phẩm. M5: nhà sản xuất đã được duyệt đăng ký sản phẩm.
/// @dev Ví cá nhân của người đại diện ký và trả gas; quyền nhà sản xuất lấy từ PartyRegistry
///      (D26). Backend cấp giấy phép EIP-712 sau khi đã lưu hồ sơ sản phẩm, nên mọi sản phẩm
///      on-chain đều có hồ sơ off-chain khớp `metadataHash`. Mã QR không ghi lên chain để không
///      ai liệt kê được mã của mọi sản phẩm.
contract ProductPassport is EIP712 {
    bytes32 public constant PRODUCT_REGISTRATION_TYPEHASH =
        keccak256(
            "ProductRegistration(bytes32 issuerId,bytes32[] productIds,bytes32[] metadataHashes,uint256 deadline)"
        );
    /// @notice Số sản phẩm tối đa mỗi giao dịch (một lô CSV), giữ gas dưới giới hạn mỗi giao dịch.
    uint256 public constant MAX_BATCH_SIZE = 50;

    struct Product {
        bytes32 issuerId;
        bytes32 metadataHash;
        ProductState state;
    }

    IPartyRegistry public immutable registry;

    mapping(bytes32 productId => Product) private _products;

    event ProductRegistered(bytes32 indexed productId, bytes32 indexed issuerId, bytes32 metadataHash);

    error NotAuthorizedManufacturer(address wallet);
    error IssuerMismatch(bytes32 issuerOfSender, bytes32 issuerId);
    error InvalidBatchSize(uint256 size);
    error LengthMismatch(uint256 productIds, uint256 metadataHashes);
    error ProductAlreadyRegistered(bytes32 productId);
    error AuthorizationExpired(uint256 deadline);
    error InvalidAuthorization();

    constructor(address partyRegistry) EIP712("DPP ProductPassport", "1") {
        if (partyRegistry == address(0)) revert ZeroAddress();
        registry = IPartyRegistry(partyRegistry);
    }

    /// @notice PRD-01, PRD-02: nhà sản xuất đăng ký một hoặc nhiều sản phẩm trong một giao dịch.
    /// @param issuerId partyId của nhà sản xuất mà ví gọi hàm đang đại diện.
    /// @param productIds Mã sản phẩm on-chain do backend tính từ (nhà sản xuất, serial).
    /// @param metadataHashes keccak256 hồ sơ của từng sản phẩm, cùng thứ tự với `productIds`.
    /// @param authorization Chữ ký EIP-712 ProductRegistration của khoá có REGISTRAR_ROLE.
    function registerProducts(
        bytes32 issuerId,
        bytes32[] calldata productIds,
        bytes32[] calldata metadataHashes,
        uint256 deadline,
        bytes calldata authorization
    ) external {
        uint256 count = productIds.length;
        if (count == 0 || count > MAX_BATCH_SIZE) revert InvalidBatchSize(count);
        if (metadataHashes.length != count) revert LengthMismatch(count, metadataHashes.length);
        bytes32 issuerOfSender = registry.authorizedOrganizationOf(msg.sender, MANUFACTURER_ROLE);
        if (issuerOfSender == bytes32(0)) revert NotAuthorizedManufacturer(msg.sender);
        if (issuerOfSender != issuerId) revert IssuerMismatch(issuerOfSender, issuerId);
        if (block.timestamp > deadline) revert AuthorizationExpired(deadline);
        _requireRegistrarSignature(
            productRegistrationDigest(issuerId, productIds, metadataHashes, deadline),
            authorization
        );

        for (uint256 i = 0; i < count; ++i) {
            bytes32 productId = productIds[i];
            bytes32 metadataHash = metadataHashes[i];
            if (productId == bytes32(0) || metadataHash == bytes32(0)) revert ZeroBytes32();
            if (_products[productId].state != ProductState.NONE) revert ProductAlreadyRegistered(productId);
            _products[productId] = Product({
                issuerId: issuerId,
                metadataHash: metadataHash,
                state: ProductState.CREATED
            });
            emit ProductRegistered(productId, issuerId, metadataHash);
        }
    }

    /// @notice Hồ sơ on-chain của sản phẩm; `state == NONE` nghĩa là chưa đăng ký.
    function product(bytes32 productId) external view returns (Product memory) {
        return _products[productId];
    }

    function stateOf(bytes32 productId) external view returns (ProductState) {
        return _products[productId].state;
    }

    /// @notice Bên đang giữ hàng. Mới đăng ký thì nhà sản xuất giữ; module phân phối sẽ ghi bên giữ mới.
    function custodianOf(bytes32 productId) external view returns (bytes32) {
        return _products[productId].issuerId;
    }

    /// @notice Digest EIP-712 của giấy phép đăng ký sản phẩm; backend và test đối chiếu với digest tự tính.
    function productRegistrationDigest(
        bytes32 issuerId,
        bytes32[] calldata productIds,
        bytes32[] calldata metadataHashes,
        uint256 deadline
    ) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    PRODUCT_REGISTRATION_TYPEHASH,
                    issuerId,
                    keccak256(abi.encodePacked(productIds)),
                    keccak256(abi.encodePacked(metadataHashes)),
                    deadline
                )
            )
        );
    }

    function _requireRegistrarSignature(bytes32 digest, bytes calldata authorization) private view {
        (address signer, ECDSA.RecoverError recoverError, ) = ECDSA.tryRecoverCalldata(digest, authorization);
        if (recoverError != ECDSA.RecoverError.NoError || !registry.hasRole(REGISTRAR_ROLE, signer)) {
            revert InvalidAuthorization();
        }
    }
}
