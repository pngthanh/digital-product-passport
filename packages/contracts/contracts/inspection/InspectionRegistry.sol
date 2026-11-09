// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ZeroAddress, ZeroBytes32} from "../shared/DppErrors.sol";
import {INSPECTOR_ROLE, REGISTRAR_ROLE} from "../shared/DppRoles.sol";
import {InspectionResult, ProductState} from "../shared/DppTypes.sol";

/// @dev Phần PartyRegistry mà contract cần: quyền tổ chức của ví gọi và role của khoá ký giấy phép.
interface IInspectionPartyRegistry {
    function authorizedOrganizationOf(address wallet, bytes32 role) external view returns (bytes32);

    function hasRole(bytes32 role, address account) external view returns (bool);
}

/// @dev Cùng bố cục với `ProductPassport.Product` để giải mã kết quả của `product()`.
struct InspectedProduct {
    bytes32 issuerId;
    bytes32 metadataHash;
    bytes32 custodianId;
    bytes32 pendingCustodianId;
    bytes32 ownerId;
    ProductState state;
    uint16 warrantyMonths;
}

interface IInspectionProductPassport {
    function product(bytes32 productId) external view returns (InspectedProduct memory);
}

/// @title InspectionRegistry
/// @notice M8: đơn vị kiểm định ghi kết quả kiểm định (Đạt, Không đạt, Đạt có điều kiện) kèm hash
///         biên bản. Kết quả chỉ được ghi nhận, không đổi trạng thái sản phẩm (thu hồi ở M10).
/// @dev Nhà sản xuất hoặc chủ sở hữu gửi yêu cầu off-chain. Giấy phép EIP-712 của registrar chứng
///      minh yêu cầu đó tồn tại và khoá luôn kết quả cùng hash biên bản mà máy chủ đã lưu, nên đơn vị
///      kiểm định không tự ghi cho sản phẩm không ai yêu cầu, cũng không đổi kết quả sau khi lưu.
///      Contract kiểm tra lại người yêu cầu (nhà phát hành, hoặc chủ sở hữu khi đã bán). Mỗi
///      inspectionId chỉ ghi một lần nên giấy phép không dùng lại được.
contract InspectionRegistry is EIP712 {
    bytes32 public constant INSPECTION_RECORD_TYPEHASH =
        keccak256(
            "InspectionRecord(bytes32 inspectionId,bytes32 productId,bytes32 inspectorId,bytes32 requesterId,uint8 result,bytes32 reportHash,uint256 deadline)"
        );

    struct Inspection {
        bytes32 productId;
        bytes32 inspectorId;
        /// @dev Nhà phát hành hoặc chủ sở hữu đã gửi yêu cầu.
        bytes32 requesterId;
        /// @dev Hash biên bản kiểm định (kết quả, tóm tắt, file đính kèm) lưu off-chain.
        bytes32 reportHash;
        uint64 inspectedAt;
        InspectionResult result;
    }

    IInspectionPartyRegistry public immutable registry;
    IInspectionProductPassport public immutable passport;

    mapping(bytes32 inspectionId => Inspection) private _inspections;
    mapping(bytes32 productId => bytes32 inspectionId) private _latestOf;

    event InspectionRecorded(
        bytes32 indexed inspectionId,
        bytes32 indexed productId,
        bytes32 indexed inspectorId,
        bytes32 requesterId,
        InspectionResult result,
        bytes32 reportHash
    );

    error NotAuthorizedInspector(address wallet);
    error InspectionAlreadyRecorded(bytes32 inspectionId);
    error InvalidInspectionResult();
    error ProductNotInspectable(bytes32 productId, ProductState state);
    error RequesterNotAllowed(bytes32 productId, bytes32 requesterId);
    error AuthorizationExpired(uint256 deadline);
    error InvalidAuthorization();

    constructor(address partyRegistry, address productPassport) EIP712("DPP InspectionRegistry", "1") {
        if (partyRegistry == address(0) || productPassport == address(0)) revert ZeroAddress();
        registry = IInspectionPartyRegistry(partyRegistry);
        passport = IInspectionProductPassport(productPassport);
    }

    /// @notice INS-01: đơn vị kiểm định ghi kết quả cho một yêu cầu kiểm định.
    /// @param inspectionId Mã do backend tính từ UUID của yêu cầu (inspection_requests).
    /// @param requesterId partyId của nhà phát hành hoặc chủ sở hữu đã gửi yêu cầu.
    /// @param reportHash Hash biên bản kiểm định mà máy chủ đã lưu.
    /// @param authorization Chữ ký EIP-712 InspectionRecord của khoá có REGISTRAR_ROLE.
    function recordInspection(
        bytes32 inspectionId,
        bytes32 productId,
        bytes32 requesterId,
        InspectionResult result,
        bytes32 reportHash,
        uint256 deadline,
        bytes calldata authorization
    ) external {
        if (
            inspectionId == bytes32(0) ||
            productId == bytes32(0) ||
            requesterId == bytes32(0) ||
            reportHash == bytes32(0)
        ) revert ZeroBytes32();
        if (result == InspectionResult.NONE) revert InvalidInspectionResult();
        bytes32 inspector = registry.authorizedOrganizationOf(msg.sender, INSPECTOR_ROLE);
        if (inspector == bytes32(0)) revert NotAuthorizedInspector(msg.sender);
        if (_inspections[inspectionId].result != InspectionResult.NONE) {
            revert InspectionAlreadyRecorded(inspectionId);
        }
        InspectedProduct memory target = passport.product(productId);
        if (
            target.state == ProductState.NONE ||
            target.state == ProductState.RECALLED ||
            target.state == ProductState.LOST_STOLEN ||
            target.state == ProductState.RETIRED
        ) {
            revert ProductNotInspectable(productId, target.state);
        }
        // Nhà phát hành gửi được ở mọi trạng thái còn hoạt động; chủ sở hữu chỉ khi đã bán.
        bool isOwner = target.state == ProductState.SOLD && target.ownerId == requesterId;
        if (requesterId != target.issuerId && !isOwner) revert RequesterNotAllowed(productId, requesterId);
        if (block.timestamp > deadline) revert AuthorizationExpired(deadline);
        _requireRegistrarSignature(
            inspectionRecordDigest(inspectionId, productId, inspector, requesterId, result, reportHash, deadline),
            authorization
        );

        _inspections[inspectionId] = Inspection({
            productId: productId,
            inspectorId: inspector,
            requesterId: requesterId,
            reportHash: reportHash,
            inspectedAt: uint64(block.timestamp),
            result: result
        });
        _latestOf[productId] = inspectionId;
        emit InspectionRecorded(inspectionId, productId, inspector, requesterId, result, reportHash);
    }

    function inspection(bytes32 inspectionId) external view returns (Inspection memory) {
        return _inspections[inspectionId];
    }

    /// @notice Lần kiểm định gần nhất của sản phẩm; bytes32(0) nếu chưa có.
    function latestInspectionOf(bytes32 productId) external view returns (bytes32) {
        return _latestOf[productId];
    }

    /// @notice Digest EIP-712 của giấy phép ghi kết quả; backend và test đối chiếu với digest tự tính.
    function inspectionRecordDigest(
        bytes32 inspectionId,
        bytes32 productId,
        bytes32 inspectorId,
        bytes32 requesterId,
        InspectionResult result,
        bytes32 reportHash,
        uint256 deadline
    ) public view returns (bytes32) {
        return
            _hashTypedDataV4(
                keccak256(
                    abi.encode(
                        INSPECTION_RECORD_TYPEHASH,
                        inspectionId,
                        productId,
                        inspectorId,
                        requesterId,
                        uint8(result),
                        reportHash,
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
