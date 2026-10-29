// Sinh tự động từ artifact ProductPassport bằng `pnpm --filter @dpp/contracts abi:export`. Không sửa tay.
export const PRODUCT_PASSPORT_ABI = [
  {
    inputs: [
      {
        internalType: 'address',
        name: 'partyRegistry',
        type: 'address',
      },
      {
        internalType: 'address',
        name: 'warranty',
        type: 'address',
      },
    ],
    stateMutability: 'nonpayable',
    type: 'constructor',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'deadline',
        type: 'uint256',
      },
    ],
    name: 'AuthorizationExpired',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'caller',
        type: 'address',
      },
    ],
    name: 'CallerNotAuthorized',
    type: 'error',
  },
  {
    inputs: [],
    name: 'InvalidAuthorization',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'size',
        type: 'uint256',
      },
    ],
    name: 'InvalidBatchSize',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'buyerId',
        type: 'bytes32',
      },
    ],
    name: 'InvalidBuyer',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'enum ProductState',
        name: 'state',
        type: 'uint8',
      },
    ],
    name: 'InvalidLifecycleState',
    type: 'error',
  },
  {
    inputs: [],
    name: 'InvalidShortString',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'uint8',
        name: 'current',
        type: 'uint8',
      },
      {
        internalType: 'uint8',
        name: 'next',
        type: 'uint8',
      },
    ],
    name: 'InvalidStateTransition',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'issuerOfSender',
        type: 'bytes32',
      },
      {
        internalType: 'bytes32',
        name: 'issuerId',
        type: 'bytes32',
      },
    ],
    name: 'IssuerMismatch',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'productIds',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: 'metadataHashes',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: 'warrantyMonths',
        type: 'uint256',
      },
    ],
    name: 'LengthMismatch',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'wallet',
        type: 'address',
      },
    ],
    name: 'NotAuthorizedManufacturer',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'wallet',
        type: 'address',
      },
    ],
    name: 'NotAuthorizedRetailer',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'productId',
        type: 'bytes32',
      },
      {
        internalType: 'bytes32',
        name: 'partyId',
        type: 'bytes32',
      },
    ],
    name: 'NotCustodian',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'productId',
        type: 'bytes32',
      },
      {
        internalType: 'bytes32',
        name: 'partyId',
        type: 'bytes32',
      },
    ],
    name: 'NotOwner',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'productId',
        type: 'bytes32',
      },
      {
        internalType: 'bytes32',
        name: 'partyId',
        type: 'bytes32',
      },
    ],
    name: 'NotPendingCustodian',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'productId',
        type: 'bytes32',
      },
    ],
    name: 'ProductAlreadyRegistered',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'productId',
        type: 'bytes32',
      },
    ],
    name: 'ProductNotFound',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'partyId',
        type: 'bytes32',
      },
    ],
    name: 'RecipientNotRetailer',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'string',
        name: 'str',
        type: 'string',
      },
    ],
    name: 'StringTooLong',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'uint16',
        name: 'months',
        type: 'uint16',
      },
    ],
    name: 'WarrantyTooLong',
    type: 'error',
  },
  {
    inputs: [],
    name: 'ZeroAddress',
    type: 'error',
  },
  {
    inputs: [],
    name: 'ZeroBytes32',
    type: 'error',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'bytes32',
        name: 'productId',
        type: 'bytes32',
      },
      {
        indexed: true,
        internalType: 'bytes32',
        name: 'fromPartyId',
        type: 'bytes32',
      },
      {
        indexed: true,
        internalType: 'bytes32',
        name: 'toPartyId',
        type: 'bytes32',
      },
    ],
    name: 'CustodyHandoverCancelled',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'bytes32',
        name: 'productId',
        type: 'bytes32',
      },
      {
        indexed: true,
        internalType: 'bytes32',
        name: 'fromPartyId',
        type: 'bytes32',
      },
      {
        indexed: true,
        internalType: 'bytes32',
        name: 'toPartyId',
        type: 'bytes32',
      },
    ],
    name: 'CustodyHandoverInitiated',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'bytes32',
        name: 'productId',
        type: 'bytes32',
      },
      {
        indexed: true,
        internalType: 'bytes32',
        name: 'fromPartyId',
        type: 'bytes32',
      },
      {
        indexed: true,
        internalType: 'bytes32',
        name: 'toPartyId',
        type: 'bytes32',
      },
    ],
    name: 'CustodyHandoverRejected',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'bytes32',
        name: 'productId',
        type: 'bytes32',
      },
      {
        indexed: true,
        internalType: 'bytes32',
        name: 'fromPartyId',
        type: 'bytes32',
      },
      {
        indexed: true,
        internalType: 'bytes32',
        name: 'toPartyId',
        type: 'bytes32',
      },
    ],
    name: 'CustodyTransferred',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [],
    name: 'EIP712DomainChanged',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'bytes32',
        name: 'productId',
        type: 'bytes32',
      },
      {
        indexed: true,
        internalType: 'bytes32',
        name: 'fromPartyId',
        type: 'bytes32',
      },
      {
        indexed: true,
        internalType: 'bytes32',
        name: 'toPartyId',
        type: 'bytes32',
      },
    ],
    name: 'OwnershipTransferred',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'bytes32',
        name: 'productId',
        type: 'bytes32',
      },
      {
        indexed: true,
        internalType: 'bytes32',
        name: 'issuerId',
        type: 'bytes32',
      },
      {
        indexed: false,
        internalType: 'bytes32',
        name: 'metadataHash',
        type: 'bytes32',
      },
      {
        indexed: false,
        internalType: 'uint16',
        name: 'warrantyMonths',
        type: 'uint16',
      },
    ],
    name: 'ProductRegistered',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'bytes32',
        name: 'productId',
        type: 'bytes32',
      },
      {
        indexed: false,
        internalType: 'enum ProductState',
        name: 'previousState',
        type: 'uint8',
      },
      {
        indexed: false,
        internalType: 'enum ProductState',
        name: 'newState',
        type: 'uint8',
      },
    ],
    name: 'ProductStateChanged',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'address',
        name: 'previousManager',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'address',
        name: 'newManager',
        type: 'address',
      },
    ],
    name: 'WarrantyManagerUpdated',
    type: 'event',
  },
  {
    inputs: [],
    name: 'MAX_BATCH_SIZE',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'MAX_WARRANTY_MONTHS',
    outputs: [
      {
        internalType: 'uint16',
        name: '',
        type: 'uint16',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'PRODUCT_REGISTRATION_TYPEHASH',
    outputs: [
      {
        internalType: 'bytes32',
        name: '',
        type: 'bytes32',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'PRODUCT_SALE_TYPEHASH',
    outputs: [
      {
        internalType: 'bytes32',
        name: '',
        type: 'bytes32',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'productId',
        type: 'bytes32',
      },
    ],
    name: 'cancelDispatch',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'productId',
        type: 'bytes32',
      },
    ],
    name: 'confirmCustodyReceipt',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'productId',
        type: 'bytes32',
      },
    ],
    name: 'custodianOf',
    outputs: [
      {
        internalType: 'bytes32',
        name: '',
        type: 'bytes32',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'productId',
        type: 'bytes32',
      },
      {
        internalType: 'bytes32',
        name: 'toPartyId',
        type: 'bytes32',
      },
    ],
    name: 'dispatchCustody',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'eip712Domain',
    outputs: [
      {
        internalType: 'bytes1',
        name: 'fields',
        type: 'bytes1',
      },
      {
        internalType: 'string',
        name: 'name',
        type: 'string',
      },
      {
        internalType: 'string',
        name: 'version',
        type: 'string',
      },
      {
        internalType: 'uint256',
        name: 'chainId',
        type: 'uint256',
      },
      {
        internalType: 'address',
        name: 'verifyingContract',
        type: 'address',
      },
      {
        internalType: 'bytes32',
        name: 'salt',
        type: 'bytes32',
      },
      {
        internalType: 'uint256[]',
        name: 'extensions',
        type: 'uint256[]',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'productId',
        type: 'bytes32',
      },
    ],
    name: 'ownerOf',
    outputs: [
      {
        internalType: 'bytes32',
        name: '',
        type: 'bytes32',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'productId',
        type: 'bytes32',
      },
    ],
    name: 'pendingCustodianOf',
    outputs: [
      {
        internalType: 'bytes32',
        name: '',
        type: 'bytes32',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'productId',
        type: 'bytes32',
      },
    ],
    name: 'product',
    outputs: [
      {
        components: [
          {
            internalType: 'bytes32',
            name: 'issuerId',
            type: 'bytes32',
          },
          {
            internalType: 'bytes32',
            name: 'metadataHash',
            type: 'bytes32',
          },
          {
            internalType: 'bytes32',
            name: 'custodianId',
            type: 'bytes32',
          },
          {
            internalType: 'bytes32',
            name: 'pendingCustodianId',
            type: 'bytes32',
          },
          {
            internalType: 'bytes32',
            name: 'ownerId',
            type: 'bytes32',
          },
          {
            internalType: 'enum ProductState',
            name: 'state',
            type: 'uint8',
          },
          {
            internalType: 'uint16',
            name: 'warrantyMonths',
            type: 'uint16',
          },
        ],
        internalType: 'struct ProductPassport.Product',
        name: 'result',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'issuerId',
        type: 'bytes32',
      },
      {
        internalType: 'bytes32[]',
        name: 'productIds',
        type: 'bytes32[]',
      },
      {
        internalType: 'bytes32[]',
        name: 'metadataHashes',
        type: 'bytes32[]',
      },
      {
        internalType: 'uint16[]',
        name: 'warrantyMonths',
        type: 'uint16[]',
      },
      {
        internalType: 'uint256',
        name: 'deadline',
        type: 'uint256',
      },
    ],
    name: 'productRegistrationDigest',
    outputs: [
      {
        internalType: 'bytes32',
        name: '',
        type: 'bytes32',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'productId',
        type: 'bytes32',
      },
      {
        internalType: 'bytes32',
        name: 'retailerId',
        type: 'bytes32',
      },
      {
        internalType: 'bytes32',
        name: 'buyerId',
        type: 'bytes32',
      },
      {
        internalType: 'uint256',
        name: 'deadline',
        type: 'uint256',
      },
    ],
    name: 'productSaleDigest',
    outputs: [
      {
        internalType: 'bytes32',
        name: '',
        type: 'bytes32',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'issuerId',
        type: 'bytes32',
      },
      {
        internalType: 'bytes32[]',
        name: 'productIds',
        type: 'bytes32[]',
      },
      {
        internalType: 'bytes32[]',
        name: 'metadataHashes',
        type: 'bytes32[]',
      },
      {
        internalType: 'uint16[]',
        name: 'warrantyMonths',
        type: 'uint16[]',
      },
      {
        internalType: 'uint256',
        name: 'deadline',
        type: 'uint256',
      },
      {
        internalType: 'bytes',
        name: 'authorization',
        type: 'bytes',
      },
    ],
    name: 'registerProducts',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'registry',
    outputs: [
      {
        internalType: 'contract IPartyRegistry',
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'productId',
        type: 'bytes32',
      },
    ],
    name: 'rejectCustodyReceipt',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'productId',
        type: 'bytes32',
      },
      {
        internalType: 'bytes32',
        name: 'buyerId',
        type: 'bytes32',
      },
      {
        internalType: 'uint256',
        name: 'deadline',
        type: 'uint256',
      },
      {
        internalType: 'bytes',
        name: 'authorization',
        type: 'bytes',
      },
    ],
    name: 'sellAndActivateWarranty',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'productId',
        type: 'bytes32',
      },
      {
        internalType: 'enum ProductState',
        name: 'newState',
        type: 'uint8',
      },
    ],
    name: 'setLifecycleState',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'newManager',
        type: 'address',
      },
    ],
    name: 'setWarrantyManager',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'productId',
        type: 'bytes32',
      },
    ],
    name: 'stateOf',
    outputs: [
      {
        internalType: 'enum ProductState',
        name: '',
        type: 'uint8',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'productId',
        type: 'bytes32',
      },
      {
        internalType: 'bytes32',
        name: 'fromPartyId',
        type: 'bytes32',
      },
      {
        internalType: 'bytes32',
        name: 'toPartyId',
        type: 'bytes32',
      },
    ],
    name: 'transferOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'warrantyManager',
    outputs: [
      {
        internalType: 'contract IWarrantyManager',
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;
