// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {IncorrectFeeAmount, ZeroAddress, ZeroBytes32} from "../shared/DppErrors.sol";
import {INSPECTOR_ROLE, MANUFACTURER_ROLE, REGISTRAR_ROLE, RETAILER_ROLE, SERVICE_CENTER_ROLE} from "../shared/DppRoles.sol";
import {OrganizationStatus, PartyKind} from "../shared/DppTypes.sol";

/// @title PartyRegistry
/// @notice Định danh Party on-chain, ví cá nhân, tổ chức và phí đăng ký tổ chức.
/// @dev Mọi giao dịch do ví của chính người dùng ký và trả gas; backend chỉ cấp giấy phép EIP-712
///      bằng khoá có REGISTRAR_ROLE. Tổ chức không có ví riêng: tổ chức gắn với Party của người
///      đại diện, nên đổi ví cá nhân thì quyền thao tác cho tổ chức đi theo (quyết định D25, D26).
contract PartyRegistry is AccessControl, EIP712, ReentrancyGuard {
    bytes32 public constant WALLET_BINDING_TYPEHASH =
        keccak256("WalletBinding(bytes32 partyId,address wallet,address previousWallet,uint256 deadline)");
    bytes32 public constant ORGANIZATION_APPLICATION_TYPEHASH =
        keccak256(
            "OrganizationApplication(bytes32 partyId,bytes32 representativeId,bytes32 role,bytes32 profileHash,uint256 deadline)"
        );
    /// @notice Mã thao tác thu phí: đăng ký tổ chức (ORG-01).
    bytes32 public constant ORG_REGISTRATION = keccak256("ORG_REGISTRATION");

    struct Party {
        PartyKind kind;
        address wallet;
    }

    struct Organization {
        bytes32 representativeId;
        OrganizationStatus status;
        bytes32 role;
        bytes32 profileHash;
    }

    mapping(bytes32 partyId => Party) private _parties;
    mapping(address wallet => bytes32 partyId) private _partyOfWallet;
    /// @dev Ví đã từng gắn với bất kỳ Party nào thì không dùng lại, khớp UNIQUE(address) trong CSDL.
    mapping(address wallet => bool) private _usedWallets;

    mapping(bytes32 partyId => Organization) private _organizations;
    /// @dev Mỗi người đại diện tối đa một tổ chức.
    mapping(bytes32 representativeId => bytes32 partyId) private _organizationOf;
    /// @dev Phí của đơn đang chờ duyệt, contract giữ tới khi Admin duyệt hoặc từ chối.
    mapping(bytes32 partyId => uint256) private _escrowedFees;
    /// @dev Phí của các đơn bị từ chối, người đại diện tự rút (pull payment).
    mapping(bytes32 partyId => uint256) private _refundableFees;
    mapping(bytes32 action => uint256) private _fees;
    address private _treasury;

    event PartyRegistered(bytes32 indexed partyId, PartyKind kind, address indexed wallet);
    event WalletRotated(bytes32 indexed partyId, address indexed previousWallet, address indexed newWallet);
    event OrganizationApplied(
        bytes32 indexed partyId,
        bytes32 indexed representativeId,
        bytes32 role,
        bytes32 profileHash
    );
    event OrganizationApproved(bytes32 indexed partyId, bytes32 role);
    event OrganizationRejected(bytes32 indexed partyId, bytes32 reasonHash);
    event OrganizationDisabled(bytes32 indexed partyId, bytes32 reasonHash);
    event FeePaid(bytes32 indexed partyId, bytes32 indexed action, address indexed payer, uint256 amount);
    event FeeSettled(bytes32 indexed partyId, address indexed treasury, uint256 amount);
    event FeeRefunded(bytes32 indexed partyId, address indexed recipient, uint256 amount);
    event FeeUpdated(bytes32 indexed action, uint256 amount, address treasury);
    event TreasuryUpdated(address indexed previousTreasury, address indexed newTreasury);

    error PartyAlreadyRegistered(bytes32 partyId);
    error PartyNotRegistered(bytes32 partyId);
    error NotUserParty(bytes32 partyId);
    error WalletAlreadyUsed(address wallet);
    error StalePreviousWallet(bytes32 partyId, address currentWallet);
    error AuthorizationExpired(uint256 deadline);
    error InvalidAuthorization();
    error WalletNotLinked(address wallet);
    error UnknownOrganizationRole(bytes32 role);
    error UnknownFeeAction(bytes32 action);
    error RepresentativeHasOrganization(bytes32 representativeId, bytes32 organizationId);
    error NotRepresentative(bytes32 partyId, address wallet);
    error InvalidOrganizationStatus(bytes32 partyId, OrganizationStatus status);
    error NothingToRefund(bytes32 partyId);

    constructor(
        address admin,
        address registrar,
        address initialTreasury,
        uint256 registrationFee
    ) EIP712("DPP PartyRegistry", "1") {
        if (admin == address(0) || registrar == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REGISTRAR_ROLE, registrar);
        _setTreasury(initialTreasury);
        _setFee(ORG_REGISTRATION, registrationFee);
    }

    /// @notice ACC-03: ví gọi hàm (msg.sender) trở thành ví cá nhân của Party người dùng mới.
    /// @param partyId Định danh Party do backend cấp (UUID của bảng parties).
    /// @param deadline Hạn dùng giấy phép (giây Unix).
    /// @param authorization Chữ ký EIP-712 WalletBinding của khoá REGISTRAR_ROLE.
    function registerUser(bytes32 partyId, uint256 deadline, bytes calldata authorization) external {
        if (partyId == bytes32(0)) revert ZeroBytes32();
        if (_parties[partyId].kind != PartyKind.NONE) revert PartyAlreadyRegistered(partyId);
        _requireUnusedWallet(msg.sender);
        _requireDeadline(deadline);
        _requireRegistrarSignature(walletBindingDigest(partyId, msg.sender, address(0), deadline), authorization);

        _parties[partyId] = Party({kind: PartyKind.USER, wallet: msg.sender});
        _bindWallet(partyId, msg.sender);
        emit PartyRegistered(partyId, PartyKind.USER, msg.sender);
    }

    /// @notice ACC-04: ví gọi hàm (msg.sender) thay ví cá nhân hiện tại của Party người dùng.
    /// @dev Ví cũ có thể đã mất, nên chỉ ví mới ký giao dịch; quyền đổi ví đến từ giấy phép
    ///      mà backend chỉ cấp sau khi người dùng nhập lại mật khẩu.
    /// @param previousWallet Ví hiện tại theo backend; lệch với on-chain thì revert để không đè trạng thái mới hơn.
    function rotateWallet(
        bytes32 partyId,
        address previousWallet,
        uint256 deadline,
        bytes calldata authorization
    ) external {
        Party storage party = _parties[partyId];
        if (party.kind == PartyKind.NONE) revert PartyNotRegistered(partyId);
        if (party.kind != PartyKind.USER) revert NotUserParty(partyId);
        if (party.wallet != previousWallet) revert StalePreviousWallet(partyId, party.wallet);
        _requireUnusedWallet(msg.sender);
        _requireDeadline(deadline);
        _requireRegistrarSignature(walletBindingDigest(partyId, msg.sender, previousWallet, deadline), authorization);

        delete _partyOfWallet[previousWallet];
        party.wallet = msg.sender;
        _bindWallet(partyId, msg.sender);
        emit WalletRotated(partyId, previousWallet, msg.sender);
    }

    /// @notice ORG-01: người đại diện nộp đơn đăng ký tổ chức kèm phí, bằng ví cá nhân của mình.
    /// @dev Đơn bị từ chối được sửa và nộp lại với phí mới (D27); phí cũ vẫn rút được.
    /// @param partyId Định danh Party của tổ chức do backend cấp.
    /// @param role Role nghiệp vụ xin cấp (MANUFACTURER_ROLE, RETAILER_ROLE, ...).
    /// @param profileHash keccak256 của hồ sơ tổ chức lưu ở CSDL.
    function applyOrganization(
        bytes32 partyId,
        bytes32 role,
        bytes32 profileHash,
        uint256 deadline,
        bytes calldata authorization
    ) external payable {
        if (partyId == bytes32(0) || profileHash == bytes32(0)) revert ZeroBytes32();
        if (!_isOrganizationRole(role)) revert UnknownOrganizationRole(role);
        bytes32 representativeId = _userPartyOf(msg.sender);
        bool isNew = _parties[partyId].kind == PartyKind.NONE;
        if (isNew) {
            bytes32 existing = _organizationOf[representativeId];
            if (existing != bytes32(0)) revert RepresentativeHasOrganization(representativeId, existing);
        } else {
            Organization storage previous = _organizations[partyId];
            if (previous.representativeId != representativeId) revert NotRepresentative(partyId, msg.sender);
            if (previous.status != OrganizationStatus.REJECTED) {
                revert InvalidOrganizationStatus(partyId, previous.status);
            }
        }
        uint256 fee = _fees[ORG_REGISTRATION];
        if (msg.value != fee) revert IncorrectFeeAmount(fee, msg.value);
        _requireDeadline(deadline);
        _requireRegistrarSignature(
            organizationApplicationDigest(partyId, representativeId, role, profileHash, deadline),
            authorization
        );

        if (isNew) {
            _parties[partyId] = Party({kind: PartyKind.ORGANIZATION, wallet: address(0)});
            _organizationOf[representativeId] = partyId;
            emit PartyRegistered(partyId, PartyKind.ORGANIZATION, address(0));
        }
        _organizations[partyId] = Organization({
            representativeId: representativeId,
            status: OrganizationStatus.PENDING,
            role: role,
            profileHash: profileHash
        });
        _escrowedFees[partyId] = msg.value;
        emit OrganizationApplied(partyId, representativeId, role, profileHash);
        if (msg.value > 0) {
            emit FeePaid(partyId, ORG_REGISTRATION, msg.sender, msg.value);
        }
    }

    /// @notice ORG-02: Admin duyệt đơn; tổ chức có role nghiệp vụ, phí chuyển về Treasury.
    function approveOrganization(bytes32 partyId) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        Organization storage org = _requireStatus(partyId, OrganizationStatus.PENDING);
        org.status = OrganizationStatus.AUTHORIZED;
        uint256 fee = _escrowedFees[partyId];
        delete _escrowedFees[partyId];
        emit OrganizationApproved(partyId, org.role);
        if (fee > 0) {
            emit FeeSettled(partyId, _treasury, fee);
            Address.sendValue(payable(_treasury), fee);
        }
    }

    /// @notice ORG-03: Admin từ chối đơn; phí chuyển sang trạng thái chờ người đại diện rút lại.
    /// @param reasonHash keccak256 của lý do lưu ở CSDL.
    function rejectOrganization(bytes32 partyId, bytes32 reasonHash) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _requireStatus(partyId, OrganizationStatus.PENDING).status = OrganizationStatus.REJECTED;
        _refundableFees[partyId] += _escrowedFees[partyId];
        delete _escrowedFees[partyId];
        emit OrganizationRejected(partyId, reasonHash);
    }

    /// @notice ORG-03: người đại diện rút phí của đơn bị từ chối về ví cá nhân hiện tại.
    function withdrawRefund(bytes32 partyId) external nonReentrant {
        bytes32 representativeId = _organizations[partyId].representativeId;
        if (representativeId == bytes32(0) || representativeId != _partyOfWallet[msg.sender]) {
            revert NotRepresentative(partyId, msg.sender);
        }
        uint256 amount = _refundableFees[partyId];
        if (amount == 0) revert NothingToRefund(partyId);
        delete _refundableFees[partyId];
        emit FeeRefunded(partyId, msg.sender, amount);
        Address.sendValue(payable(msg.sender), amount);
    }

    /// @notice ORG-04: Admin khoá tổ chức; lịch sử đã ghi vẫn giữ nguyên.
    function disableOrganization(bytes32 partyId, bytes32 reasonHash) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _requireStatus(partyId, OrganizationStatus.AUTHORIZED).status = OrganizationStatus.DISABLED;
        emit OrganizationDisabled(partyId, reasonHash);
    }

    /// @notice ORG-06: đổi mức phí của một thao tác (wei). Đơn đang chờ giữ nguyên phí đã nộp.
    function setFee(bytes32 action, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setFee(action, amount);
    }

    /// @notice ORG-06: đổi ví nhận phí.
    function setTreasury(address newTreasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setTreasury(newTreasury);
    }

    /// @notice Party đang dùng ví này; bytes32(0) nếu ví chưa gắn hoặc đã bị xoay đi.
    function partyOf(address wallet) external view returns (bytes32) {
        return _partyOfWallet[wallet];
    }

    /// @notice Ví hiện tại của Party người dùng; address(0) nếu chưa đăng ký hoặc là tổ chức.
    function walletOf(bytes32 partyId) external view returns (address) {
        return _parties[partyId].wallet;
    }

    function kindOf(bytes32 partyId) external view returns (PartyKind) {
        return _parties[partyId].kind;
    }

    function isWalletUsed(address wallet) external view returns (bool) {
        return _usedWallets[wallet];
    }

    function organization(bytes32 partyId) external view returns (Organization memory) {
        return _organizations[partyId];
    }

    /// @notice Tổ chức do người dùng này đại diện; bytes32(0) nếu chưa có.
    function organizationOf(bytes32 representativeId) external view returns (bytes32) {
        return _organizationOf[representativeId];
    }

    /// @notice Tổ chức đã duyệt có role này mà ví đang đại diện; bytes32(0) nếu không có.
    /// @dev Contract nghiệp vụ (ProductPassport, ...) dùng để kiểm tra quyền của msg.sender.
    function authorizedOrganizationOf(address wallet, bytes32 role) external view returns (bytes32) {
        bytes32 partyId = _organizationOf[_partyOfWallet[wallet]];
        return hasPartyRole(partyId, role) ? partyId : bytes32(0);
    }

    function hasPartyRole(bytes32 partyId, bytes32 role) public view returns (bool) {
        Organization storage org = _organizations[partyId];
        return partyId != bytes32(0) && org.status == OrganizationStatus.AUTHORIZED && org.role == role;
    }

    function feeOf(bytes32 action) external view returns (uint256) {
        return _fees[action];
    }

    function treasury() external view returns (address) {
        return _treasury;
    }

    function escrowedFeeOf(bytes32 partyId) external view returns (uint256) {
        return _escrowedFees[partyId];
    }

    function refundableFeeOf(bytes32 partyId) external view returns (uint256) {
        return _refundableFees[partyId];
    }

    /// @notice Digest EIP-712 của giấy phép gắn ví; backend và test đối chiếu với digest tự tính.
    function walletBindingDigest(
        bytes32 partyId,
        address wallet,
        address previousWallet,
        uint256 deadline
    ) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(abi.encode(WALLET_BINDING_TYPEHASH, partyId, wallet, previousWallet, deadline))
        );
    }

    /// @notice Digest EIP-712 của giấy phép nộp đơn tổ chức.
    function organizationApplicationDigest(
        bytes32 partyId,
        bytes32 representativeId,
        bytes32 role,
        bytes32 profileHash,
        uint256 deadline
    ) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(ORGANIZATION_APPLICATION_TYPEHASH, partyId, representativeId, role, profileHash, deadline)
            )
        );
    }

    function _setFee(bytes32 action, uint256 amount) private {
        if (action != ORG_REGISTRATION) revert UnknownFeeAction(action);
        _fees[action] = amount;
        emit FeeUpdated(action, amount, _treasury);
    }

    function _setTreasury(address newTreasury) private {
        if (newTreasury == address(0)) revert ZeroAddress();
        emit TreasuryUpdated(_treasury, newTreasury);
        _treasury = newTreasury;
    }

    function _bindWallet(bytes32 partyId, address wallet) private {
        _partyOfWallet[wallet] = partyId;
        _usedWallets[wallet] = true;
    }

    function _requireUnusedWallet(address wallet) private view {
        if (_usedWallets[wallet]) revert WalletAlreadyUsed(wallet);
    }

    function _userPartyOf(address wallet) private view returns (bytes32 partyId) {
        partyId = _partyOfWallet[wallet];
        if (partyId == bytes32(0)) revert WalletNotLinked(wallet);
    }

    function _requireStatus(
        bytes32 partyId,
        OrganizationStatus expected
    ) private view returns (Organization storage org) {
        org = _organizations[partyId];
        if (org.status != expected) revert InvalidOrganizationStatus(partyId, org.status);
    }

    function _isOrganizationRole(bytes32 role) private pure returns (bool) {
        return role == MANUFACTURER_ROLE || role == RETAILER_ROLE || role == SERVICE_CENTER_ROLE || role == INSPECTOR_ROLE;
    }

    function _requireDeadline(uint256 deadline) private view {
        if (block.timestamp > deadline) revert AuthorizationExpired(deadline);
    }

    function _requireRegistrarSignature(bytes32 digest, bytes calldata authorization) private view {
        (address signer, ECDSA.RecoverError recoverError, ) = ECDSA.tryRecoverCalldata(digest, authorization);
        if (recoverError != ECDSA.RecoverError.NoError || !hasRole(REGISTRAR_ROLE, signer)) {
            revert InvalidAuthorization();
        }
    }
}
