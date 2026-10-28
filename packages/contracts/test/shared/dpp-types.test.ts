import {
  CHAIN_ENUM_ORDER,
  INSPECTOR_ROLE,
  MANUFACTURER_ROLE,
  PRODUCT_CONTRACT_ROLE,
  REGISTRAR_ROLE,
  RETAILER_ROLE,
  SERVICE_CENTER_ROLE,
  TRANSFER_CONTRACT_ROLE,
} from '@dpp/shared';
import { expect } from 'chai';
import { network } from 'hardhat';
import { readFile } from 'node:fs/promises';

const { ethers } = await network.create();

const ENUM_DECLARATION = /enum\s+(\w+)\s*\{([^}]*)\}/g;

/** Đọc tên và thứ tự giá trị của từng enum trong file Solidity. */
function parseSolidityEnums(source: string): Record<string, string[]> {
  const enums: Record<string, string[]> = {};
  for (const [, name, body] of source.matchAll(ENUM_DECLARATION)) {
    enums[name!] = body!
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  }
  return enums;
}

describe('DppTypes.sol và DppRoles.sol khớp @dpp/shared', () => {
  it('tên và thứ tự giá trị enum giống hệt chain-enums.ts', async () => {
    const source = await readFile(
      new URL('../../contracts/shared/DppTypes.sol', import.meta.url),
      'utf8',
    );
    const expected = Object.fromEntries(
      Object.entries(CHAIN_ENUM_ORDER).map(([name, values]) => [name, [...values]]),
    );

    expect(parseSolidityEnums(source)).to.deep.equal(expected);
  });

  it('giá trị lớn nhất của enum sau biên dịch khớp số phần tử', async () => {
    const harness = await ethers.deployContract('DppConstantsHarness');
    const maxima: bigint[] = await harness.enumMaxima();
    const expected = [
      CHAIN_ENUM_ORDER.PartyKind,
      CHAIN_ENUM_ORDER.OrganizationStatus,
      CHAIN_ENUM_ORDER.FeeStatus,
      CHAIN_ENUM_ORDER.ProductState,
      CHAIN_ENUM_ORDER.WarrantyState,
      CHAIN_ENUM_ORDER.ServiceTicketState,
      CHAIN_ENUM_ORDER.InspectionResult,
      CHAIN_ENUM_ORDER.TransferState,
    ].map((values) => BigInt(values.length - 1));

    expect(maxima).to.deep.equal(expected);
  });

  it('role id on-chain trùng role id phía ứng dụng', async () => {
    const harness = await ethers.deployContract('DppConstantsHarness');

    expect(await harness.roleIds()).to.deep.equal([
      REGISTRAR_ROLE,
      MANUFACTURER_ROLE,
      RETAILER_ROLE,
      SERVICE_CENTER_ROLE,
      INSPECTOR_ROLE,
      PRODUCT_CONTRACT_ROLE,
      TRANSFER_CONTRACT_ROLE,
    ]);
  });
});
