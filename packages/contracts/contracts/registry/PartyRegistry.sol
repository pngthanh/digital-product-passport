// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ZeroAddress, ZeroBytes32} from "../shared/DppErrors.sol";
import {REGISTRAR_ROLE} from "../shared/DppRoles.sol";
import {PartyKind} from "../shared/DppTypes.sol";

/// @title PartyRegistry
/// @notice Định danh Party on-chain và ví gắn với Party.
/// @dev M2 hiện thực phần người dùng: đăng ký Party và xoay ví cá nhân. Phần tổ chức,
///      phí và ví vận hành được bổ sung ở M4. Ví được gắn luôn là `msg.sender` và tự trả gas;
///      backend chỉ cấp giấy phép EIP-712 bằng khoá có REGISTRAR_ROLE.
contract PartyRegistry is AccessControl, EIP712 {
    bytes32 public constant WALLET_BINDING_TYPEHASH =
        keccak256("WalletBinding(bytes32 partyId,address wallet,address previousWallet,uint256 deadline)");

    struct Party {
        PartyKind kind;
        address wallet;
    }

    mapping(bytes32 partyId => Party) private _parties;
    mapping(address wallet => bytes32 partyId) private _partyOfWallet;
    /// @dev Ví đã từng gắn với bất kỳ Party nào thì không dùng lại, khớp UNIQUE(address) trong CSDL.
    mapping(address wallet => bool) private _usedWallets;

    event PartyRegistered(bytes32 indexed partyId, PartyKind kind, address indexed wallet);
    event WalletRotated(bytes32 indexed partyId, address indexed previousWallet, address indexed newWallet);

    error PartyAlreadyRegistered(bytes32 partyId);
    error PartyNotRegistered(bytes32 partyId);
    error NotUserParty(bytes32 partyId);
    error WalletAlreadyUsed(address wallet);
    error StalePreviousWallet(bytes32 partyId, address currentWallet);
    error AuthorizationExpired(uint256 deadline);
    error InvalidAuthorization();

    constructor(address admin, address registrar) EIP712("DPP PartyRegistry", "1") {
        if (admin == address(0) || registrar == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REGISTRAR_ROLE, registrar);
    }

    /// @notice ACC-03: ví gọi hàm (msg.sender) trở thành ví cá nhân của Party người dùng mới.
    /// @param partyId Định danh Party do backend cấp (UUID của bảng parties).
    /// @param deadline Hạn dùng giấy phép (giây Unix).
    /// @param authorization Chữ ký EIP-712 WalletBinding của khoá REGISTRAR_ROLE.
    function registerUser(bytes32 partyId, uint256 deadline, bytes calldata authorization) external {
        if (partyId == bytes32(0)) revert ZeroBytes32();
        if (_parties[partyId].kind != PartyKind.NONE) revert PartyAlreadyRegistered(partyId);
        _requireUnusedWallet(msg.sender);
        _requireAuthorization(partyId, msg.sender, address(0), deadline, authorization);

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
        _requireAuthorization(partyId, msg.sender, previousWallet, deadline, authorization);

        delete _partyOfWallet[previousWallet];
        party.wallet = msg.sender;
        _bindWallet(partyId, msg.sender);
        emit WalletRotated(partyId, previousWallet, msg.sender);
    }

    /// @notice Party đang dùng ví này; bytes32(0) nếu ví chưa gắn hoặc đã bị xoay đi.
    function partyOf(address wallet) external view returns (bytes32) {
        return _partyOfWallet[wallet];
    }

    /// @notice Ví hiện tại của Party; address(0) nếu Party chưa đăng ký.
    function walletOf(bytes32 partyId) external view returns (address) {
        return _parties[partyId].wallet;
    }

    function kindOf(bytes32 partyId) external view returns (PartyKind) {
        return _parties[partyId].kind;
    }

    function isWalletUsed(address wallet) external view returns (bool) {
        return _usedWallets[wallet];
    }

    /// @notice Digest EIP-712 của giấy phép; backend và test đối chiếu với digest tự tính.
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

    function _bindWallet(bytes32 partyId, address wallet) private {
        _partyOfWallet[wallet] = partyId;
        _usedWallets[wallet] = true;
    }

    function _requireUnusedWallet(address wallet) private view {
        if (_usedWallets[wallet]) revert WalletAlreadyUsed(wallet);
    }

    function _requireAuthorization(
        bytes32 partyId,
        address wallet,
        address previousWallet,
        uint256 deadline,
        bytes calldata authorization
    ) private view {
        if (block.timestamp > deadline) revert AuthorizationExpired(deadline);
        bytes32 digest = walletBindingDigest(partyId, wallet, previousWallet, deadline);
        (address signer, ECDSA.RecoverError recoverError, ) = ECDSA.tryRecoverCalldata(digest, authorization);
        if (recoverError != ECDSA.RecoverError.NoError || !hasRole(REGISTRAR_ROLE, signer)) {
            revert InvalidAuthorization();
        }
    }
}
