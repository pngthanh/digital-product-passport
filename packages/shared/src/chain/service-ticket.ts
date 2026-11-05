import { type TypedDataDomain, TypedDataEncoder, type TypedDataField } from 'ethers';

/*
 * Giấy phép (EIP-712) mở phiếu sửa chữa (M7). Phải khớp TYPEHASH và tên/phiên bản EIP-712 trong
 * `ServiceTicketManager.sol`.
 */

export const SERVICE_TICKET_MANAGER_CONTRACT_NAME = 'ServiceTicketManager';

export const SERVICE_TICKET_EIP712_NAME = 'DPP ServiceTicketManager';

export const SERVICE_TICKET_EIP712_VERSION = '1';

/** Hàm ghi của trung tâm bảo hành (SVC-03, SVC-04). */
export const SERVICE_CENTER_TICKET_METHODS = ['openTicket', 'closeTicket'] as const;

export type ServiceTicketMethod = (typeof SERVICE_CENTER_TICKET_METHODS)[number];

export const SERVICE_TICKET_OPENING_PRIMARY_TYPE = 'ServiceTicketOpening';

export const SERVICE_TICKET_OPENING_TYPES: Record<string, TypedDataField[]> = {
  [SERVICE_TICKET_OPENING_PRIMARY_TYPE]: [
    { name: 'ticketId', type: 'bytes32' },
    { name: 'productId', type: 'bytes32' },
    { name: 'serviceCenterId', type: 'bytes32' },
    { name: 'requesterId', type: 'bytes32' },
    { name: 'deadline', type: 'uint256' },
  ],
};

/**
 * Giấy phép SVC-03: chủ sở hữu `requesterId` đã gửi yêu cầu `ticketId` cho sản phẩm `productId`
 * tới trung tâm `serviceCenterId`. Mỗi ticketId chỉ mở được một lần.
 */
export interface ServiceTicketOpening {
  ticketId: string;
  productId: string;
  serviceCenterId: string;
  requesterId: string;
  deadline: bigint;
}

export function serviceTicketDomain(chainId: number, verifyingContract: string): TypedDataDomain {
  return {
    name: SERVICE_TICKET_EIP712_NAME,
    version: SERVICE_TICKET_EIP712_VERSION,
    chainId,
    verifyingContract,
  };
}

/** Digest EIP-712 của giấy phép mở phiếu, bằng đúng `serviceTicketOpeningDigest()` của contract. */
export function serviceTicketOpeningDigest(
  chainId: number,
  verifyingContract: string,
  opening: ServiceTicketOpening,
): string {
  return TypedDataEncoder.hash(
    serviceTicketDomain(chainId, verifyingContract),
    SERVICE_TICKET_OPENING_TYPES,
    { ...opening },
  );
}
