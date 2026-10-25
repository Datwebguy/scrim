import type { Session } from "./auth";
import { listInvitations } from "./treasuries";
import { shellTreasuries } from "./workspace";

// Long account IDs are shortened in the middle so a line stays readable.
const brief = (id: string) => (id.length > 24 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id);

export type Notice = { id: string; text: string; href: string };

// Things that are waiting for this person, drawn from what is already stored: invitations to join an
// account, and payments waiting for their approval. Nothing here is kept separately, so a notice
// disappears by itself once it has been dealt with.
export async function notices(session: Session): Promise<Notice[]> {
  const [invitations, accounts] = await Promise.all([listInvitations(session), shellTreasuries(session)]);
  return [
    ...invitations.map((i) => ({ id: `invite:${i.treasuryId}`, text: `${brief(i.invitedBy)} invited you to “${i.name}”`, href: "/app/accounts" })),
    ...accounts.filter((t) => t.pending > 0).map((t) => ({ id: `approve:${t.id}`, text: `${t.pending === 1 ? "A payment is" : `${t.pending} payments are`} waiting for you in “${t.name}”`, href: `/app/accounts/${t.id}` })),
  ];
}
