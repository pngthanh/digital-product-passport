// Sinh tự động từ artifact WarrantyManager bằng `pnpm --filter @dpp/contracts abi:export`. Không sửa tay.
export const WARRANTY_MANAGER_ABI = [
  {
    inputs: [
      {
        internalType: 'address',
        name: 'partyRegistry',
        type: 'address',
      },
    ],
    stateMutability: 'nonpayable',
    type: 'constructor',
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
    inputs: [
      {
        internalType: 'uint16',
        name: 'months',
        type: 'uint16',
      },
    ],
    name: 'InvalidWarrantyMonths',
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
    name: 'WarrantyAlreadyActivated',
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
    name: 'WarrantyNotActive',
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
    name: 'WarrantyNotSuspended',
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
        name: 'activatedBy',
        type: 'bytes32',
      },
      {
        indexed: false,
        internalType: 'uint64',
        name: 'activatedAt',
        type: 'uint64',
      },
      {
        indexed: false,
        internalType: 'uint64',
        name: 'expiresAt',
        type: 'uint64',
      },
      {
        indexed: false,
        internalType: 'uint16',
        name: 'months',
        type: 'uint16',
      },
    ],
    name: 'WarrantyActivated',
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
    ],
    name: 'WarrantyResumed',
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
    ],
    name: 'WarrantySuspended',
    type: 'event',
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
    inputs: [
      {
        internalType: 'bytes32',
        name: 'productId',
        type: 'bytes32',
      },
      {
        internalType: 'bytes32',
        name: 'activatedBy',
        type: 'bytes32',
      },
      {
        internalType: 'uint16',
        name: 'months',
        type: 'uint16',
      },
    ],
    name: 'activateWarranty',
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
    name: 'effectiveWarrantyState',
    outputs: [
      {
        internalType: 'enum WarrantyState',
        name: '',
        type: 'uint8',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'registry',
    outputs: [
      {
        internalType: 'contract IRoleRegistry',
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
    name: 'resumeWarranty',
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
    name: 'suspendWarranty',
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
    name: 'warrantyOf',
    outputs: [
      {
        components: [
          {
            internalType: 'bytes32',
            name: 'activatedBy',
            type: 'bytes32',
          },
          {
            internalType: 'uint64',
            name: 'activatedAt',
            type: 'uint64',
          },
          {
            internalType: 'uint64',
            name: 'expiresAt',
            type: 'uint64',
          },
          {
            internalType: 'uint16',
            name: 'months',
            type: 'uint16',
          },
          {
            internalType: 'bool',
            name: 'suspended',
            type: 'bool',
          },
        ],
        internalType: 'struct WarrantyManager.Warranty',
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;
