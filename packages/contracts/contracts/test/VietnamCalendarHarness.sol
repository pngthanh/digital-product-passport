// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {VietnamCalendar} from "../shared/VietnamCalendar.sol";

/// @notice Chỉ dùng trong test: lộ thư viện cộng tháng để đối chiếu với `addWarrantyMonths` của @dpp/shared.
contract VietnamCalendarHarness {
    function addMonths(uint256 timestamp, uint256 months) external pure returns (uint256) {
        return VietnamCalendar.addMonths(timestamp, months);
    }
}
