// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title VietnamCalendar
/// @notice Cộng tháng theo lịch Việt Nam (UTC+7) để hạn bảo hành rơi đúng ngày trên hoá đơn:
///         bán 15/10/2026, bảo hành 24 tháng thì hết hạn 15/10/2028, cùng giờ. Ngày không tồn tại
///         ở tháng đích thì lấy ngày cuối tháng (31/01 + 1 tháng = 28/02 hoặc 29/02).
/// @dev Chuyển đổi ngày ↔ (năm, tháng, ngày) theo thuật toán days_from_civil / civil_from_days
///      của Howard Hinnant, chỉ dùng số không âm vì mốc thời gian luôn sau năm 1970.
library VietnamCalendar {
    uint256 internal constant SECONDS_PER_DAY = 86_400;
    uint256 internal constant UTC_OFFSET_SECONDS = 7 hours;
    /// @dev Số ngày từ 0000-03-01 tới 1970-01-01 trong lịch Gregory kéo dài.
    uint256 private constant EPOCH_SHIFT_DAYS = 719_468;
    uint256 private constant DAYS_PER_ERA = 146_097;

    /// @notice `timestamp` cộng `months` tháng theo lịch UTC+7, giữ nguyên giờ trong ngày.
    function addMonths(uint256 timestamp, uint256 months) internal pure returns (uint256) {
        uint256 local = timestamp + UTC_OFFSET_SECONDS;
        uint256 secondsOfDay = local % SECONDS_PER_DAY;
        (uint256 year, uint256 month, uint256 day) = civilFromDays(local / SECONDS_PER_DAY);
        uint256 monthIndex = year * 12 + (month - 1) + months;
        uint256 newYear = monthIndex / 12;
        uint256 newMonth = (monthIndex % 12) + 1;
        uint256 lastDay = daysInMonth(newYear, newMonth);
        uint256 newDay = day < lastDay ? day : lastDay;
        return daysFromCivil(newYear, newMonth, newDay) * SECONDS_PER_DAY + secondsOfDay - UTC_OFFSET_SECONDS;
    }

    function daysInMonth(uint256 year, uint256 month) internal pure returns (uint256) {
        if (month == 2) {
            return isLeapYear(year) ? 29 : 28;
        }
        return month == 4 || month == 6 || month == 9 || month == 11 ? 30 : 31;
    }

    function isLeapYear(uint256 year) internal pure returns (bool) {
        return (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;
    }

    /// @notice Số ngày kể từ 1970-01-01 của ngày (năm, tháng, ngày).
    function daysFromCivil(uint256 year, uint256 month, uint256 day) internal pure returns (uint256) {
        uint256 y = month <= 2 ? year - 1 : year;
        uint256 era = y / 400;
        uint256 yearOfEra = y - era * 400;
        uint256 shiftedMonth = month > 2 ? month - 3 : month + 9;
        uint256 dayOfYear = (153 * shiftedMonth + 2) / 5 + day - 1;
        uint256 dayOfEra = yearOfEra * 365 + yearOfEra / 4 - yearOfEra / 100 + dayOfYear;
        return era * DAYS_PER_ERA + dayOfEra - EPOCH_SHIFT_DAYS;
    }

    /// @notice (năm, tháng, ngày) của ngày thứ `daysSinceEpoch` kể từ 1970-01-01.
    function civilFromDays(uint256 daysSinceEpoch) internal pure returns (uint256 year, uint256 month, uint256 day) {
        uint256 z = daysSinceEpoch + EPOCH_SHIFT_DAYS;
        uint256 era = z / DAYS_PER_ERA;
        uint256 dayOfEra = z - era * DAYS_PER_ERA;
        uint256 yearOfEra = (dayOfEra - dayOfEra / 1460 + dayOfEra / 36_524 - dayOfEra / 146_096) / 365;
        uint256 dayOfYear = dayOfEra - (365 * yearOfEra + yearOfEra / 4 - yearOfEra / 100);
        uint256 shiftedMonth = (5 * dayOfYear + 2) / 153;
        day = dayOfYear - (153 * shiftedMonth + 2) / 5 + 1;
        month = shiftedMonth < 10 ? shiftedMonth + 3 : shiftedMonth - 9;
        year = yearOfEra + era * 400 + (month <= 2 ? 1 : 0);
    }
}
