import { MeteorConnect, webpage_local_storage } from '@meteorwallet/sdk';
import { Buffer } from 'buffer';

globalThis.Buffer ??= Buffer;

let connection;
export async function meteor() {
  if (!connection) {
    const instance = new MeteorConnect();
    connection = instance.initialize({
      storage: webpage_local_storage,
      mobileBridge: { enabled: true, partnerMetadata: {
        name: 'Scrim', description: 'Private treasury on NEAR testnet',
        iconUrl: `${location.origin}/scrim-logo.jpg`, originUrl: location.origin,
      } },
    }).then(() => instance).catch(error => { connection = undefined; throw error; });
  }
  return connection;
}

export async function connectMeteor() {
  const sdk = await meteor();
  const action = await sdk.createAction({ id: 'near::sign_in', input: { target: { blockchain: 'near', network: 'testnet' } } });
  await action.promptForExecution();
  const account = await sdk.getAccount({ blockchain: 'near', network: 'testnet' });
  if (!account?.identifier?.accountId) throw Error('Meteor did not return a testnet account.');
  return account;
}

export async function currentMeteorAccount() {
  return (await meteor()).getAccount({ blockchain: 'near', network: 'testnet' });
}

export async function signMeteorChallenge(account, challenge) {
  const sdk = await meteor();
  const binary = Uint8Array.from(atob(challenge.nep413.nonce), c => c.charCodeAt(0));
  const action = await sdk.createAction({ id: 'near::sign_message', input: {
    target: account.identifier,
    messageParams: { message: challenge.nep413.message, recipient: challenge.nep413.recipient, nonce: binary },
  } });
  const signed = await action.promptForExecution();
  const bytes = signed.signature instanceof Uint8Array ? signed.signature : new Uint8Array(signed.signature);
  return { accountId: signed.accountId, publicKey: signed.publicKey.toString(), signature: btoa(String.fromCharCode(...bytes)) };
}

export async function disconnectMeteor(account) {
  const sdk = await meteor();
  const action = await sdk.createAction({ id: 'near::sign_out', input: { target: account.identifier } });
  await action.promptForExecution();
}
