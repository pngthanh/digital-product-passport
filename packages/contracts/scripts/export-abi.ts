import { artifacts } from 'hardhat';
import { writeFile } from 'node:fs/promises';

/**
 * Sinh ABI từ artifact Hardhat sang `packages/shared/src/abi` để API và Web dùng chung,
 * không chép tay. Test `abi-export.test.ts` báo lỗi nếu ABI trong shared cũ hơn contract.
 * Chạy: pnpm --filter @dpp/contracts abi:export
 */
const EXPORTS = [
  {
    contract: 'OwnershipTransfer',
    constant: 'OWNERSHIP_TRANSFER_ABI',
    file: 'ownership-transfer.abi.ts',
  },
  {
    contract: 'InspectionRegistry',
    constant: 'INSPECTION_REGISTRY_ABI',
    file: 'inspection-registry.abi.ts',
  },
  { contract: 'PartyRegistry', constant: 'PARTY_REGISTRY_ABI', file: 'party-registry.abi.ts' },
  {
    contract: 'ProductPassport',
    constant: 'PRODUCT_PASSPORT_ABI',
    file: 'product-passport.abi.ts',
  },
  {
    contract: 'ProductLifecycle',
    constant: 'PRODUCT_LIFECYCLE_ABI',
    file: 'product-lifecycle.abi.ts',
  },
  {
    contract: 'ServiceTicketManager',
    constant: 'SERVICE_TICKET_MANAGER_ABI',
    file: 'service-ticket-manager.abi.ts',
  },
  {
    contract: 'WarrantyManager',
    constant: 'WARRANTY_MANAGER_ABI',
    file: 'warranty-manager.abi.ts',
  },
] as const;

const OUTPUT_DIR = new URL('../../shared/src/abi/', import.meta.url);

for (const { contract, constant, file } of EXPORTS) {
  const { abi } = await artifacts.readArtifact(contract);
  const source = [
    `// Sinh tự động từ artifact ${contract} bằng \`pnpm --filter @dpp/contracts abi:export\`. Không sửa tay.`,
    `export const ${constant} = ${JSON.stringify(abi, null, 2)} as const;`,
    '',
  ].join('\n');
  await writeFile(new URL(file, OUTPUT_DIR), source);
  process.stdout.write(`Đã ghi ABI ${contract} -> packages/shared/src/abi/${file}\n`);
}
