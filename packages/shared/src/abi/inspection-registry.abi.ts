// Sinh tự động từ artifact InspectionRegistry bằng `pnpm --filter @dpp/contracts abi:export`. Không sửa tay.
export const INSPECTION_REGISTRY_ABI = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "partyRegistry",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "productPassport",
        "type": "address"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "deadline",
        "type": "uint256"
      }
    ],
    "name": "AuthorizationExpired",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "inspectionId",
        "type": "bytes32"
      }
    ],
    "name": "InspectionAlreadyRecorded",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidAuthorization",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidInspectionResult",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidShortString",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "wallet",
        "type": "address"
      }
    ],
    "name": "NotAuthorizedInspector",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "productId",
        "type": "bytes32"
      },
      {
        "internalType": "enum ProductState",
        "name": "state",
        "type": "uint8"
      }
    ],
    "name": "ProductNotInspectable",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "productId",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "requesterId",
        "type": "bytes32"
      }
    ],
    "name": "RequesterNotAllowed",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "str",
        "type": "string"
      }
    ],
    "name": "StringTooLong",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ZeroAddress",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ZeroBytes32",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [],
    "name": "EIP712DomainChanged",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "inspectionId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "productId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "inspectorId",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "requesterId",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "enum InspectionResult",
        "name": "result",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "reportHash",
        "type": "bytes32"
      }
    ],
    "name": "InspectionRecorded",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "INSPECTION_RECORD_TYPEHASH",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "eip712Domain",
    "outputs": [
      {
        "internalType": "bytes1",
        "name": "fields",
        "type": "bytes1"
      },
      {
        "internalType": "string",
        "name": "name",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "version",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "chainId",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "verifyingContract",
        "type": "address"
      },
      {
        "internalType": "bytes32",
        "name": "salt",
        "type": "bytes32"
      },
      {
        "internalType": "uint256[]",
        "name": "extensions",
        "type": "uint256[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "inspectionId",
        "type": "bytes32"
      }
    ],
    "name": "inspection",
    "outputs": [
      {
        "components": [
          {
            "internalType": "bytes32",
            "name": "productId",
            "type": "bytes32"
          },
          {
            "internalType": "bytes32",
            "name": "inspectorId",
            "type": "bytes32"
          },
          {
            "internalType": "bytes32",
            "name": "requesterId",
            "type": "bytes32"
          },
          {
            "internalType": "bytes32",
            "name": "reportHash",
            "type": "bytes32"
          },
          {
            "internalType": "uint64",
            "name": "inspectedAt",
            "type": "uint64"
          },
          {
            "internalType": "enum InspectionResult",
            "name": "result",
            "type": "uint8"
          }
        ],
        "internalType": "struct InspectionRegistry.Inspection",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "inspectionId",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "productId",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "inspectorId",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "requesterId",
        "type": "bytes32"
      },
      {
        "internalType": "enum InspectionResult",
        "name": "result",
        "type": "uint8"
      },
      {
        "internalType": "bytes32",
        "name": "reportHash",
        "type": "bytes32"
      },
      {
        "internalType": "uint256",
        "name": "deadline",
        "type": "uint256"
      }
    ],
    "name": "inspectionRecordDigest",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "productId",
        "type": "bytes32"
      }
    ],
    "name": "latestInspectionOf",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "passport",
    "outputs": [
      {
        "internalType": "contract IInspectionProductPassport",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "inspectionId",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "productId",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "requesterId",
        "type": "bytes32"
      },
      {
        "internalType": "enum InspectionResult",
        "name": "result",
        "type": "uint8"
      },
      {
        "internalType": "bytes32",
        "name": "reportHash",
        "type": "bytes32"
      },
      {
        "internalType": "uint256",
        "name": "deadline",
        "type": "uint256"
      },
      {
        "internalType": "bytes",
        "name": "authorization",
        "type": "bytes"
      }
    ],
    "name": "recordInspection",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "registry",
    "outputs": [
      {
        "internalType": "contract IInspectionPartyRegistry",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const;
