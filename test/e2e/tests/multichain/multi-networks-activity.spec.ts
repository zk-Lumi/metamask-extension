import FixtureBuilder from '../../fixture-builder';
import {
  defaultGanacheOptions,
  openDapp,
  unlockWallet,
  WINDOW_TITLES,
  withFixtures,
} from '../../helpers';
import { SMART_CONTRACTS } from '../../seeder/smart-contracts';

const PORT = 8546;
const CHAIN_ID = 1338;
const PORT_ONE = 7777;
const CHAIN_ID_ONE = 1000;

describe('Multichain activity feature', function () {
  const smartContract = SMART_CONTRACTS.NFTS;

  it('should see activity for current networks and all network', async function () {
    await withFixtures(
      {
        dapp: true,
        fixtures: new FixtureBuilder()
          .withPermissionControllerConnectedToTestDapp()
          .build(),
        ganacheOptions: {
          ...defaultGanacheOptions,
          concurrent: [
            {
              port: PORT,
              chainId: CHAIN_ID,
              ganacheOptions2: defaultGanacheOptions,
            },
            {
              port: PORT_ONE,
              chainId: CHAIN_ID_ONE,
              ganacheOptions2: defaultGanacheOptions,
            },
          ],
        },
        smartContract,
        title: this.test?.fullTitle(),
      },
      // @ts-expect-error TS2339: Property '_' does not exist on type 'Fixtures'.
      async ({ driver, _, contractRegistry }) => {
        const contract = contractRegistry.getContractAddress(smartContract);
        await unlockWallet(driver);

        // Open Dapp and wait for deployed contract
        await openDapp(driver, contract);
        await driver.findClickableElement('#deployButton');

        // mint NFTs
        await driver.fill('#mintAmountInput', '5');
        await driver.clickElement({ text: 'Mint', tag: 'button' });

        // Notification
        await driver.waitUntilXWindowHandles(3);
        await driver.switchToWindowWithTitle(WINDOW_TITLES.Dialog);
        await driver.waitForSelector({
          css: '.confirm-page-container-summary__action__name',
          text: 'Deposit',
        });
        await driver.clickElement({ text: 'Confirm', tag: 'button' });
        await driver.waitUntilXWindowHandles(2);
        await driver.switchToWindowWithTitle(
          WINDOW_TITLES.ExtensionInFullScreenView,
        );
        await driver.clickElement(
          '[data-testid="account-overview__activity-tab"]',
        );
        await driver.waitForSelector({
          css: '[data-testid="activity-list-item-action"]',
          text: 'Deposit',
        });

        await driver.clickElement('[data-testid="sort-by-popover-toggle"]');

        await driver.clickElement({ text: 'Current Network' });

        await driver.findElement({
          text: 'Deposit',
          tag: 'p',
        });
      },
    );
  });
});
