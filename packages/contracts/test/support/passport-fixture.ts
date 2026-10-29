import {
  MANUFACTURER_ROLE,
  ORGANIZATION_APPLICATION_TYPES,
  PRODUCT_CONTRACT_ROLE,
  PRODUCT_REGISTRATION_TYPES,
  PRODUCT_SALE_TYPES,
  type ProductRegistration,
  type ProductSale,
  partyIdFromUuid,
  partyRegistryDomain,
  productIdOf,
  productPassportDomain,
  RETAILER_ROLE,
  WALLET_BINDING_TYPES,
} from '@dpp/shared';
import { type BaseWallet, id, type Signer, Wallet, ZeroAddress } from 'ethers';
import type { network } from 'hardhat';

type Connection = Awaited<ReturnType<typeof network.create>>;
type Account = Signer & { address: string };

export const ALICE_PARTY = partyIdFromUuid('0199a3b2-7c4d-7e8f-9a0b-000000000001');
export const BOB_PARTY = partyIdFromUuid('0199a3b2-7c4d-7e8f-9a0b-000000000002');
export const CAROL_PARTY = partyIdFromUuid('0199a3b2-7c4d-7e8f-9a0b-000000000003');
export const ERIN_PARTY = partyIdFromUuid('0199a3b2-7c4d-7e8f-9a0b-000000000005');
/** Người mua chỉ có tài khoản web, chưa liên kết ví (chưa đăng ký on-chain). */
export const BUYER_PARTY = partyIdFromUuid('0199a3b2-7c4d-7e8f-9a0b-0000000000b1');
export const MAKER = partyIdFromUuid('0199a3b2-7c4d-7e8f-9a0b-0000000000a1');
export const SHOP = partyIdFromUuid('0199a3b2-7c4d-7e8f-9a0b-0000000000a2');
export const OTHER_SHOP = partyIdFromUuid('0199a3b2-7c4d-7e8f-9a0b-0000000000a4');
export const TTL_SECONDS = 15 * 60;

/** Giá trị enum ProductState on-chain. */
export const STATE = {
  NONE: 0n,
  CREATED: 1n,
  IN_DISTRIBUTION: 2n,
  AT_RETAIL: 3n,
  SOLD: 4n,
  RECALLED: 5n,
  LOST_STOLEN: 6n,
  RETIRED: 7n,
} as const;

export function products(count: number, issuer = MAKER, prefix = 'ABC-2026-', months = 24) {
  const productIds = Array.from({ length: count }, (_, index) =>
    productIdOf(issuer, `${prefix}${String(index + 1).padStart(6, '0')}`),
  );
  const metadataHashes = productIds.map((productId) => id(`ho so ${productId}`));
  const warrantyMonths = productIds.map(() => months);
  return { productIds, metadataHashes, warrantyMonths };
}

/**
 * PartyRegistry có nhà sản xuất MAKER (Alice đại diện), nhà bán lẻ SHOP (Bob) và OTHER_SHOP (Erin)
 * đã duyệt; Carol là người dùng đã liên kết ví. WarrantyManager và ProductPassport v2 đã deploy,
 * ProductPassport có PRODUCT_CONTRACT_ROLE.
 */
export function passportFixture({ ethers, networkHelpers }: Connection) {
  async function deadline() {
    return BigInt((await networkHelpers.time.latest()) + TTL_SECONDS);
  }

  return async function deployPassport() {
    const [admin, alice, bob, carol, dave, erin] = await ethers.getSigners();
    const registrar = Wallet.createRandom();
    const registry = await ethers.deployContract('PartyRegistry', [
      admin!.address,
      registrar.address,
      admin!.address,
      0n,
    ]);
    const registryAddress = await registry.getAddress();
    const warranty = await ethers.deployContract('WarrantyManager', [registryAddress]);
    const passport = await ethers.deployContract('ProductPassport', [
      registryAddress,
      await warranty.getAddress(),
    ]);
    await registry.connect(admin).grantRole(PRODUCT_CONTRACT_ROLE, await passport.getAddress());
    const { chainId } = await ethers.provider.getNetwork();
    const registryDomain = partyRegistryDomain(Number(chainId), registryAddress);
    const passportDomain = productPassportDomain(Number(chainId), await passport.getAddress());

    async function registerUser(wallet: Account, partyId: string) {
      const binding = { partyId, wallet: wallet.address, previousWallet: ZeroAddress };
      const value = { ...binding, deadline: await deadline() };
      const signature = await registrar.signTypedData(registryDomain, WALLET_BINDING_TYPES, value);
      await registry.connect(wallet).registerUser(partyId, value.deadline, signature);
    }

    async function organization(
      representative: Account,
      representativeId: string,
      partyId: string,
      role: string,
      approve: boolean,
    ) {
      const application = {
        partyId,
        representativeId,
        role,
        profileHash: id(`ho so ${partyId}`),
        deadline: await deadline(),
      };
      const signature = await registrar.signTypedData(
        registryDomain,
        ORGANIZATION_APPLICATION_TYPES,
        application,
      );
      await registry
        .connect(representative)
        .applyOrganization(partyId, role, application.profileHash, application.deadline, signature);
      if (approve) {
        await registry.connect(admin!).approveOrganization(partyId);
      }
    }

    /** Giấy phép registrar cấp cho lô sản phẩm; `signer` khác registrar để thử chữ ký sai. */
    async function authorize(
      overrides: Partial<ProductRegistration> = {},
      signer: BaseWallet = registrar,
    ): Promise<ProductRegistration & { signature: string }> {
      const registration: ProductRegistration = {
        issuerId: MAKER,
        ...products(1),
        deadline: await deadline(),
        ...overrides,
      };
      const signature = await signer.signTypedData(
        passportDomain,
        PRODUCT_REGISTRATION_TYPES,
        registration,
      );
      return { ...registration, signature };
    }

    function register(wallet: Signer, registration: ProductRegistration & { signature: string }) {
      return passport
        .connect(wallet)
        .registerProducts(
          registration.issuerId,
          registration.productIds,
          registration.metadataHashes,
          registration.warrantyMonths,
          registration.deadline,
          registration.signature,
        );
    }

    /** Alice đăng ký một sản phẩm với `months` tháng bảo hành; trả productId. */
    async function registerOne(serial = 'ABC-2026-000001', months = 24): Promise<string> {
      const productId = productIdOf(MAKER, serial);
      await register(
        alice!,
        await authorize({
          productIds: [productId],
          metadataHashes: [id(`ho so ${serial}`)],
          warrantyMonths: [months],
        }),
      );
      return productId;
    }

    /** Sản phẩm đã ở cửa hàng SHOP (Alice gửi, Bob nhận). */
    async function atRetail(serial = 'ABC-2026-000001', months = 24): Promise<string> {
      const productId = await registerOne(serial, months);
      await passport.connect(alice!).dispatchCustody(productId, SHOP);
      await passport.connect(bob!).confirmCustodyReceipt(productId);
      return productId;
    }

    async function authorizeSale(
      overrides: Partial<ProductSale> & Pick<ProductSale, 'productId'>,
      signer: BaseWallet = registrar,
    ): Promise<ProductSale & { signature: string }> {
      const sale: ProductSale = {
        retailerId: SHOP,
        buyerId: BUYER_PARTY,
        deadline: await deadline(),
        ...overrides,
      };
      const signature = await signer.signTypedData(passportDomain, PRODUCT_SALE_TYPES, sale);
      return { ...sale, signature };
    }

    function sell(wallet: Signer, sale: ProductSale & { signature: string }) {
      return passport
        .connect(wallet)
        .sellAndActivateWarranty(sale.productId, sale.buyerId, sale.deadline, sale.signature);
    }

    await registerUser(alice!, ALICE_PARTY);
    await registerUser(bob!, BOB_PARTY);
    await registerUser(carol!, CAROL_PARTY);
    await registerUser(erin!, ERIN_PARTY);
    await organization(alice!, ALICE_PARTY, MAKER, MANUFACTURER_ROLE, true);
    await organization(bob!, BOB_PARTY, SHOP, RETAILER_ROLE, true);
    await organization(erin!, ERIN_PARTY, OTHER_SHOP, RETAILER_ROLE, true);

    return {
      registry,
      warranty,
      passport,
      registrar,
      authorize,
      register,
      registerOne,
      atRetail,
      authorizeSale,
      sell,
      registerUser,
      organization,
      deadline,
      chainId: Number(chainId),
      admin: admin!,
      alice: alice!,
      bob: bob!,
      carol: carol!,
      dave: dave!,
      erin: erin!,
    };
  };
}
