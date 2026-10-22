export default function handler(_request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.status(200).json({
    service: 'scrim',
    status: 'online',
    network: 'mainnet',
    capabilities: {
      accountLookup: true,
      walletSigning: false,
      intentSettlement: false,
      persistentTreasury: false,
      selectiveDisclosure: false,
    },
  });
}
