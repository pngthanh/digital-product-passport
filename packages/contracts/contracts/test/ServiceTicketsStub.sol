// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Chỉ dùng trong test: giả lập `ServiceTicketManager.openTicketOf` để thử chặn chuyển nhượng
///         khi sản phẩm đang có phiếu sửa.
contract ServiceTicketsStub {
    mapping(bytes32 productId => bytes32 ticketId) public openTicketOf;

    function setOpenTicket(bytes32 productId, bytes32 ticketId) external {
        openTicketOf[productId] = ticketId;
    }
}
