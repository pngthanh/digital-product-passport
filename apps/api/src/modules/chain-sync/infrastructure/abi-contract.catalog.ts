import { Injectable } from '@nestjs/common';
import {
  INSPECTION_REGISTRY_ABI,
  INSPECTION_REGISTRY_CONTRACT_NAME,
  PARTY_REGISTRY_ABI,
  PARTY_REGISTRY_CONTRACT_NAME,
  PRODUCT_PASSPORT_ABI,
  PRODUCT_PASSPORT_CONTRACT_NAME,
  SERVICE_TICKET_MANAGER_ABI,
  SERVICE_TICKET_MANAGER_CONTRACT_NAME,
  WARRANTY_MANAGER_ABI,
  WARRANTY_MANAGER_CONTRACT_NAME,
} from '@dpp/shared';
import { type InterfaceAbi, Interface, type ParamType } from 'ethers';
import { AppConfigService } from '../../../config/app-config.service.js';
import type { ChainLog } from '../application/chain-reader.port.js';
import type { ContractCatalog, DecodedLog } from '../application/contract-catalog.port.js';
import type { ChainEventArg } from '../domain/chain-event.js';
import type { IndexedContract } from '../domain/indexer-checkpoint.js';

interface CatalogEntry {
  name: string;
  address: string;
  abi: Interface;
  /** Tham số event dùng làm correlation_key. */
  correlationArg: string | null;
  /** Tham số event chứa productId (bytes32), ghi vào blockchain_events.chain_product_id. */
  productArg: string | null;
  startBlock: bigint | null;
}

interface ContractDefinition {
  name: string;
  address: string | null;
  abi: InterfaceAbi;
  correlationArg: string | null;
  productArg: string | null;
  startBlock: bigint | null;
}

/** Số nguyên tới 48 bit giữ dạng number (enum, chỉ số); lớn hơn thì dạng chuỗi để không mất chính xác. */
const SAFE_INTEGER_BITS = 48;

/** Danh mục contract từ cấu hình; ABI lấy từ @dpp/shared (sinh từ artifact Hardhat). */
@Injectable()
export class AbiContractCatalog implements ContractCatalog {
  private readonly entries: CatalogEntry[];

  constructor(config: AppConfigService) {
    const definitions: ContractDefinition[] = [
      {
        name: PARTY_REGISTRY_CONTRACT_NAME,
        address: config.partyRegistryAddress,
        abi: PARTY_REGISTRY_ABI,
        correlationArg: 'partyId',
        productArg: null,
        startBlock: config.partyRegistryDeployBlock,
      },
      {
        name: PRODUCT_PASSPORT_CONTRACT_NAME,
        address: config.productPassportAddress,
        abi: PRODUCT_PASSPORT_ABI,
        correlationArg: 'productId',
        productArg: 'productId',
        startBlock: config.productPassportDeployBlock,
      },
      {
        name: WARRANTY_MANAGER_CONTRACT_NAME,
        address: config.warrantyManagerAddress,
        abi: WARRANTY_MANAGER_ABI,
        correlationArg: 'productId',
        productArg: 'productId',
        startBlock: config.productPassportDeployBlock,
      },
      {
        name: SERVICE_TICKET_MANAGER_CONTRACT_NAME,
        address: config.serviceTicketManagerAddress,
        abi: SERVICE_TICKET_MANAGER_ABI,
        correlationArg: 'ticketId',
        productArg: 'productId',
        startBlock: config.serviceTicketManagerDeployBlock,
      },
      {
        name: INSPECTION_REGISTRY_CONTRACT_NAME,
        address: config.inspectionRegistryAddress,
        abi: INSPECTION_REGISTRY_ABI,
        correlationArg: 'inspectionId',
        productArg: 'productId',
        startBlock: config.inspectionRegistryDeployBlock,
      },
    ];
    this.entries = definitions.flatMap(({ address, abi, ...rest }) =>
      address ? [{ ...rest, address: address.toLowerCase(), abi: new Interface(abi) }] : [],
    );
  }

  indexedContracts(): readonly IndexedContract[] {
    return this.entries.map(({ name, address, startBlock }) => ({ name, address, startBlock }));
  }

  addressOf(contractName: string): string | null {
    return this.entries.find((entry) => entry.name === contractName)?.address ?? null;
  }

  decodeMethod(contractName: string, data: string): string | null {
    const entry = this.entries.find((candidate) => candidate.name === contractName);
    try {
      return entry?.abi.parseTransaction({ data })?.name ?? null;
    } catch {
      return null;
    }
  }

  decodeLog(log: ChainLog): DecodedLog | null {
    const entry = this.entries.find((candidate) => candidate.address === log.address);
    const parsed = entry?.abi.parseLog({ topics: [...log.topics], data: log.data });
    if (!entry || !parsed) {
      return null;
    }
    const args = Object.fromEntries(
      parsed.fragment.inputs.map((input, index) => [
        input.name,
        normalizeArg(input, parsed.args[index]),
      ]),
    );
    const correlation = entry.correlationArg ? args[entry.correlationArg] : undefined;
    const product = entry.productArg ? args[entry.productArg] : undefined;
    return {
      contractName: entry.name,
      contractAddress: entry.address,
      eventName: parsed.name,
      args,
      correlationKey: typeof correlation === 'string' ? correlation : null,
      chainProductId: typeof product === 'string' ? product : null,
    };
  }
}

function normalizeArg(input: ParamType, value: unknown): ChainEventArg {
  if (typeof value === 'bigint') {
    const bits = Number(/^u?int(\d+)$/.exec(input.type)?.[1] ?? 256);
    return bits <= SAFE_INTEGER_BITS ? Number(value) : value.toString();
  }
  if (typeof value === 'string') {
    return input.type === 'address' || input.type.startsWith('bytes') ? value.toLowerCase() : value;
  }
  if (typeof value === 'boolean' || typeof value === 'number') {
    return value;
  }
  return String(value);
}
