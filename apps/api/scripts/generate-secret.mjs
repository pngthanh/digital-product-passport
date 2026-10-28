// Sinh bí mật cho .env. Dùng: node scripts/generate-secret.mjs jwt | registrar
import { Wallet } from 'ethers';
import { randomBytes } from 'node:crypto';

const kind = process.argv[2];

if (kind === 'jwt') {
  process.stdout.write(`JWT_SECRET=${randomBytes(48).toString('base64url')}\n`);
} else if (kind === 'registrar') {
  const wallet = Wallet.createRandom();
  process.stdout.write(
    [
      `REGISTRAR_SIGNER_PRIVATE_KEY=${wallet.privateKey}`,
      `# Địa chỉ registrar (được cấp REGISTRAR_ROLE khi deploy PartyRegistry): ${wallet.address}`,
      '',
    ].join('\n'),
  );
} else {
  process.stderr.write('Dùng: node scripts/generate-secret.mjs jwt | registrar\n');
  process.exit(1);
}
