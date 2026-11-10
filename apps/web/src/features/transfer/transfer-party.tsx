import type { TransferParty } from '@dpp/shared';

/** Tên một bên của yêu cầu: cá nhân (email đã che) hoặc doanh nghiệp (mã số thuế). */
export function TransferPartyName({ party }: { party: TransferParty }) {
  if (party.kind === 'ORGANIZATION') {
    return (
      <span>
        <span className="font-medium">{party.name}</span>
        <span className="text-muted"> · MST {party.taxCode}</span>
        {party.isYou ? <span className="text-muted"> (bạn đại diện)</span> : null}
      </span>
    );
  }
  return (
    <span>
      <span className="font-medium">{party.isYou ? 'Bạn' : party.fullName}</span>
      {party.isYou ? null : <span className="text-muted"> · {party.maskedEmail}</span>}
    </span>
  );
}
