import { Hex } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';
import { getAddress } from 'ethers/lib/utils';
import { ContractMarketData } from '@metamask/assets-controllers';
import { decGWEIToHexWEI } from '../../../shared/modules/conversion.utils';
import { Numeric } from '../../../shared/modules/Numeric';
import { TxData } from '../../pages/bridge/types';
import { getTransaction1559GasFeeEstimates } from '../../pages/swaps/swaps.util';
import { fetchTokenExchangeRates as fetchTokenExchangeRatesUtil } from '../../helpers/utils/util';

// We don't need to use gas multipliers here because the gasLimit from Bridge API already included it
export const getHexMaxGasLimit = (gasLimit: number) => {
  return new Numeric(
    new BigNumber(gasLimit).toString(),
    10,
  ).toPrefixedHexString() as Hex;
};
export const getTxGasEstimates = async ({
  networkAndAccountSupports1559,
  networkGasFeeEstimates,
  txParams,
  hexChainId,
}: {
  networkAndAccountSupports1559: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  networkGasFeeEstimates: any;
  txParams: TxData;
  hexChainId: Hex;
}) => {
  if (networkAndAccountSupports1559) {
    const { estimatedBaseFeeGwei = '0' } = networkGasFeeEstimates;
    const hexEstimatedBaseFee = decGWEIToHexWEI(estimatedBaseFeeGwei) as Hex;
    const txGasFeeEstimates = await getTransaction1559GasFeeEstimates(
      {
        ...txParams,
        chainId: hexChainId,
        gasLimit: txParams.gasLimit?.toString(),
      },
      hexEstimatedBaseFee,
      hexChainId,
    );
    return txGasFeeEstimates;
  }

  return {
    baseAndPriorityFeePerGas: undefined,
    maxFeePerGas: undefined,
    maxPriorityFeePerGas: undefined,
  };
};

const fetchTokenExchangeRates = async (
  chainId: string,
  currency: string,
  ...tokenAddresses: string[]
) => {
  const exchangeRates = await fetchTokenExchangeRatesUtil(
    currency,
    tokenAddresses,
    chainId,
  );
  return Object.keys(exchangeRates).reduce(
    (acc: Record<string, number | undefined>, address) => {
      acc[address.toLowerCase()] = exchangeRates[address];
      return acc;
    },
    {},
  );
};

// This fetches the exchange rate for a token in a given currency. This is only called when the exchange
// rate is not available in the TokenRatesController, which happens when the selected token has not been
// imported into the wallet
export const getTokenExchangeRate = async (request: {
  chainId: Hex;
  tokenAddress: string;
  currency: string;
}) => {
  const { chainId, tokenAddress, currency } = request;
  const exchangeRates = await fetchTokenExchangeRates(
    chainId,
    currency,
    tokenAddress,
  );
  const exchangeRate =
    exchangeRates?.[tokenAddress.toLowerCase()] ??
    exchangeRates?.[getAddress(tokenAddress)];
  return exchangeRate;
};

// This extracts a token's exchange rate from the marketData state object
export const exchangeRateFromMarketData = (
  chainId: string,
  tokenAddress: string,
  marketData?: Record<string, ContractMarketData>,
) =>
  (
    marketData?.[chainId]?.[tokenAddress.toLowerCase() as Hex] ??
    marketData?.[chainId]?.[getAddress(tokenAddress) as Hex]
  )?.price;

export const tokenAmountToCurrency = (
  amount: string | BigNumber,
  exchangeRate: number,
) =>
  new Numeric(amount, 10)
    // Stringify exchangeRate before applying conversion to avoid floating point issues
    .applyConversionRate(new BigNumber(exchangeRate.toString(), 10))
    .toNumber();

export const tokenPriceInNativeAsset = (
  tokenExchangeRate?: number | null,
  nativeToCurrencyRate?: number | null,
) => {
  return tokenExchangeRate && nativeToCurrencyRate
    ? tokenExchangeRate / nativeToCurrencyRate
    : null;
};

export const exchangeRatesFromNativeAndCurrencyRates = (
  tokenToNativeAssetRate?: number | null,
  nativeToCurrencyRate?: number | null,
  nativeToUsdRate?: number | null,
) => {
  return {
    valueInCurrency:
      tokenToNativeAssetRate && nativeToCurrencyRate
        ? tokenToNativeAssetRate * nativeToCurrencyRate
        : null,
    usd:
      tokenToNativeAssetRate && nativeToUsdRate
        ? tokenToNativeAssetRate * nativeToUsdRate
        : null,
  };
};
