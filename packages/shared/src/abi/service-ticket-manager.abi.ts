// Sinh tự động từ artifact ServiceTicketManager bằng `pnpm --filter @dpp/contracts abi:export`. Không sửa tay.
export const SERVICE_TICKET_MANAGER_ABI = [
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
      },
      {
        "internalType": "address",
        "name": "warrantyManager",
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
    "inputs": [],
    "name": "InvalidAuthorization",
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
    "name": "NotAuthorizedServiceCenter",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "ticketId",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "partyId",
        "type": "bytes32"
      }
    ],
    "name": "NotTicketServiceCenter",
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
        "name": "ticketId",
        "type": "bytes32"
      }
    ],
    "name": "ProductHasOpenTicket",
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
    "name": "ProductNotOwned",
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
    "name": "RequesterNotOwner",
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
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "ticketId",
        "type": "bytes32"
      }
    ],
    "name": "TicketAlreadyExists",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "ticketId",
        "type": "bytes32"
      }
    ],
    "name": "TicketNotOpen",
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
        "name": "ticketId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "productId",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "enum ServiceTicketState",
        "name": "state",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "evidenceHash",
        "type": "bytes32"
      }
    ],
    "name": "ServiceTicketClosed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "ticketId",
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
        "name": "serviceCenterId",
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
        "internalType": "bool",
        "name": "warrantyCovered",
        "type": "bool"
      }
    ],
    "name": "ServiceTicketOpened",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "SERVICE_TICKET_OPENING_TYPEHASH",
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
        "name": "ticketId",
        "type": "bytes32"
      },
      {
        "internalType": "bool",
        "name": "repaired",
        "type": "bool"
      },
      {
        "internalType": "bytes32",
        "name": "evidenceHash",
        "type": "bytes32"
      }
    ],
    "name": "closeTicket",
    "outputs": [],
    "stateMutability": "nonpayable",
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
        "name": "ticketId",
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
    "name": "openTicket",
    "outputs": [],
    "stateMutability": "nonpayable",
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
    "name": "openTicketOf",
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
        "internalType": "contract IServiceProductPassport",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "registry",
    "outputs": [
      {
        "internalType": "contract IServicePartyRegistry",
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
        "name": "ticketId",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "productId",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "serviceCenterId",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "requesterId",
        "type": "bytes32"
      },
      {
        "internalType": "uint256",
        "name": "deadline",
        "type": "uint256"
      }
    ],
    "name": "serviceTicketOpeningDigest",
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
        "name": "ticketId",
        "type": "bytes32"
      }
    ],
    "name": "ticket",
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
            "name": "serviceCenterId",
            "type": "bytes32"
          },
          {
            "internalType": "bytes32",
            "name": "requesterId",
            "type": "bytes32"
          },
          {
            "internalType": "bytes32",
            "name": "evidenceHash",
            "type": "bytes32"
          },
          {
            "internalType": "uint64",
            "name": "openedAt",
            "type": "uint64"
          },
          {
            "internalType": "uint64",
            "name": "closedAt",
            "type": "uint64"
          },
          {
            "internalType": "enum ServiceTicketState",
            "name": "state",
            "type": "uint8"
          },
          {
            "internalType": "bool",
            "name": "warrantyCovered",
            "type": "bool"
          }
        ],
        "internalType": "struct ServiceTicketManager.Ticket",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "warranty",
    "outputs": [
      {
        "internalType": "contract IServiceWarrantyManager",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const;
