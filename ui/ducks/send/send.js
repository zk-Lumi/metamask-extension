import {
    createAsyncThunk,
    createSelector,
    createSlice
} from '@reduxjs/toolkit';
import BigNumber from 'bignumber.js';
import {
    addHexPrefix,
    zeroAddress
} from 'ethereumjs-util';
import {
    cloneDeep,
    debounce
} from 'lodash';
import { v4 as uuidv4 } from 'uuid';
import { providerErrors } from '@metamask/rpc-errors';
import {
    TransactionEnvelopeType,
    TransactionType
} from '@metamask/transaction-controller';
import { getErrorMessage } from '../../../shared/modules/error';
import {
    decimalToHex,
    hexToDecimal
} from '../../../shared/modules/conversion.utils';
import {
    GasEstimateTypes,
    GAS_LIMITS
} from '../../../shared/constants/gas';
import {
    CONTRACT_ADDRESS_ERROR,
    FLOAT_TOKENS_ERROR,
    INSUFFICIENT_FUNDS_ERROR,
    INSUFFICIENT_FUNDS_FOR_GAS_ERROR,
    INSUFFICIENT_TOKENS_ERROR,
    NEGATIVE_OR_ZERO_AMOUNT_TOKENS_ERROR,
    INVALID_RECIPIENT_ADDRESS_ERROR,
    KNOWN_RECIPIENT_ADDRESS_WARNING,
    RECIPIENT_TYPES,
    SWAPS_NO_QUOTES,
    SWAPS_QUOTES_ERROR
} from '../../pages/confirmations/send/send.constants';
import {
    isBalanceSufficient,
    isERC1155BalanceSufficient,
    isTokenBalanceSufficient
} from '../../pages/confirmations/send/send.utils';
import {
    getCurrentChainId,
    getSelectedNetworkClientId,
    getProviderConfig
} from '../../../shared/modules/selectors/networks';
import {
    getAdvancedInlineGasShown,
    getGasPriceInHexWei,
    getIsMainnet,
    getTargetAccount,
    getIsNonStandardEthChain,
    checkNetworkAndAccountSupports1559,
    getUseTokenDetection,
    getTokenList,
    getAddressBookEntryOrAccountName,
    getEnsResolutionByAddress,
    getSelectedAccount,
    getSelectedInternalAccount,
    getSelectedInternalAccountWithBalance,
    getUnapprovedTransactions,
    getIsSwapsChain,
    getUseExternalServices
} from '../../selectors';
import {
    displayWarning,
    hideLoadingIndication,
    showLoadingIndication,
    updateEditableParams,
    updateTransactionGasFees,
    addPollingTokenToAppState,
    removePollingTokenFromAppState,
    isNftOwner,
    getTokenStandardAndDetails,
    showModal,
    addTransactionAndRouteToConfirmationPage,
    updateTransactionSendFlowHistory,
    getCurrentNetworkEIP1559Compatibility,
    getLayer1GasFee,
    gasFeeStopPollingByPollingToken,
    gasFeeStartPollingByNetworkClientId,
    getBalancesInSingleCall,
    estimateGas,
    addTransactionAndWaitForPublish,
    setDefaultHomeActiveTabName,
    rejectPendingApproval
} from '../../store/actions';
import { setCustomGasLimit } from '../gas/gas.duck';
import {
    QR_CODE_DETECTED,
    SELECTED_ACCOUNT_CHANGED,
    ACCOUNT_CHANGED,
    ADDRESS_BOOK_UPDATED,
    GAS_FEE_ESTIMATES_UPDATED,
    CLEAR_SWAP_AND_SEND_STATE
} from '../../store/actionConstants';
import {
    getTokenAddressParam,
    getTokenMetadata,
    getTokenIdParam
} from '../../helpers/utils/token-util';
import {
    checkExistingAddresses,
    isOriginContractAddress
} from '../../helpers/utils/util';
import {
    getGasEstimateType,
    getNativeCurrency,
    getTokens
} from '../metamask/metamask';
import { resetDomainResolution } from '../domains';
import {
    isBurnAddress,
    isPossibleAddress,
    isValidHexAddress,
    toChecksumHexAddress
} from '../../../shared/modules/hexstring-utils';
import { isSmartContractAddress } from '../../helpers/utils/transactions.util';
import {
    AssetType,
    TokenStandard
} from '../../../shared/constants/transaction';
import { INVALID_ASSET_TYPE } from '../../helpers/constants/error-keys';
import { SECOND } from '../../../shared/constants/time';
import { isEqualCaseInsensitive } from '../../../shared/modules/string-utils';
import { parseStandardTokenTransactionData } from '../../../shared/modules/transaction.utils';
import { getTokenValueParam } from '../../../shared/lib/metamask-controller-utils';
import {
    calcGasTotal,
    calcTokenAmount
} from '../../../shared/lib/transactions-controller-utils';
import { Numeric } from '../../../shared/modules/Numeric';
import { EtherDenomination } from '../../../shared/constants/common';
import { SWAPS_CHAINID_DEFAULT_TOKEN_MAP } from '../../../shared/constants/swaps';
import { setMaxValueMode } from '../confirm-transaction/confirm-transaction.duck';
import {
    CONFIRM_TRANSACTION_ROUTE,
    DEFAULT_ROUTE
} from '../../helpers/constants/routes';
import { fetchBlockedTokens } from '../../pages/swaps/swaps.util';
import {
    getDisabledSwapAndSendNetworksFromAPI,
    getSwapAndSendQuotes
} from './swap-and-send-utils';
import {
    estimateGasLimitForSend,
    generateTransactionParams,
    getRoundedGasPrice,
    calculateBestQuote,
    addAdjustedReturnToQuotes,
    getIsDraftSwapAndSend
} from './helpers';
const RECENT_REQUEST_ERROR = 'This has been replaced with a more recent request';
const FETCH_DELAY = SECOND;
export const SEND_STAGES = {
    ADD_RECIPIENT: 'ADD_RECIPIENT',
    DRAFT: 'DRAFT',
    EDIT: 'EDIT',
    INACTIVE: 'INACTIVE'
};
export const SEND_STATUSES = {
    INVALID: 'INVALID',
    VALID: 'VALID'
};
export const GAS_INPUT_MODES = {
    BASIC: 'BASIC',
    CUSTOM: 'CUSTOM',
    INLINE: 'INLINE'
};
export const AMOUNT_MODES = {
    INPUT: 'INPUT',
    MAX: 'MAX'
};
export const RECIPIENT_SEARCH_MODES = {
    CONTACT_LIST: 'CONTACT_LIST',
    MY_ACCOUNTS: 'MY_ACCOUNTS'
};
export const draftTransactionInitialState = {
    amount: {
        error: null,
        value: '0x0'
    },
    sendAsset: {
        balance: '0x0',
        details: null,
        error: null,
        type: AssetType.native
    },
    receiveAsset: {
        balance: '0x0',
        details: null,
        error: null,
        type: AssetType.native
    },
    fromAccount: null,
    gas: {
        error: null,
        gasLimit: '0x0',
        gasPrice: '0x0',
        gasTotal: '0x0',
        maxFeePerGas: '0x0',
        maxPriorityFeePerGas: '0x0',
        wasManuallyEdited: false
    },
    history: [],
    id: null,
    recipient: {
        address: '',
        error: null,
        nickname: '',
        warning: null,
        type: '',
        recipientWarningAcknowledged: false
    },
    status: SEND_STATUSES.VALID,
    transactionType: TransactionEnvelopeType.legacy,
    userInputHexData: null,
    isSwapQuoteLoading: false,
    swapQuotesError: null,
    swapQuotesLatestRequestTimestamp: null,
    timeToFetchQuotes: null,
    quotes: null
};
export const initialState = {
    amountMode: AMOUNT_MODES.INPUT,
    currentTransactionUUID: null,
    disabledSwapAndSendNetworks: [],
    draftTransactions: {},
    eip1559support: false,
    gasEstimateIsLoading: true,
    gasEstimatePollToken: null,
    gasIsSetInModal: false,
    gasPriceEstimate: '0x0',
    gasLimitMinimum: GAS_LIMITS.SIMPLE,
    gasTotalForLayer1: null,
    prevSwapAndSendInput: null,
    recipientMode: RECIPIENT_SEARCH_MODES.CONTACT_LIST,
    recipientInput: '',
    selectedAccount: {
        address: null,
        balance: '0x0'
    },
    stage: SEND_STAGES.INACTIVE,
    swapsBlockedTokens: []
};
const name = 'send';
export const computeEstimatedGasLimit = createAsyncThunk('send/computeEstimatedGasLimit', async (_, thunkApi) => {
    const state = thunkApi.getState();
    const {send, metamask} = state;
    const draftTransaction = send.draftTransactions[send.currentTransactionUUID];
    const unapprovedTxs = getUnapprovedTransactions(state);
    const transaction = unapprovedTxs[draftTransaction.id];
    const isNonStandardEthChain = getIsNonStandardEthChain(state);
    const chainId = getCurrentChainId(state);
    const selectedAccount = getSelectedInternalAccountWithBalance(state);
    const gasTotalForLayer1 = await thunkApi.dispatch(getLayer1GasFee({
        transactionParams: {
            gasPrice: draftTransaction.gas.gasPrice,
            gas: draftTransaction.gas.gasLimit,
            to: draftTransaction.recipient.address?.toLowerCase(),
            value: send.amountMode === AMOUNT_MODES.MAX ? send.selectedAccount.balance : draftTransaction.amount.value,
            from: send.selectedAccount.address,
            data: draftTransaction.userInputHexData,
            type: '0x0'
        },
        chainId
    }));
    if (send.stage !== SEND_STAGES.EDIT || !transaction.dappSuggestedGasFees?.gas || !transaction.userEditedGasLimit) {
        const gasLimit = await estimateGasLimitForSend({
            gasPrice: draftTransaction.gas.gasPrice,
            blockGasLimit: metamask.currentBlockGasLimit,
            selectedAddress: selectedAccount.address,
            sendToken: draftTransaction.sendAsset.details,
            to: draftTransaction.recipient.address?.toLowerCase(),
            value: draftTransaction.amount.value,
            data: draftTransaction.userInputHexData,
            isNonStandardEthChain,
            chainId,
            gasLimit: draftTransaction.gas.gasLimit
        });
        await thunkApi.dispatch(setCustomGasLimit(gasLimit));
        return {
            gasLimit,
            gasTotalForLayer1
        };
    }
    return null;
});
export const initializeSendState = createAsyncThunk('send/initializeSendState', async ({
    chainHasChanged = false
} = {}, thunkApi) => {
    const state = thunkApi.getState();
    const isNonStandardEthChain = getIsNonStandardEthChain(state);
    const selectedNetworkClientId = getSelectedNetworkClientId(state);
    const chainId = getCurrentChainId(state);
    let eip1559support = checkNetworkAndAccountSupports1559(state);
    if (eip1559support === undefined) {
        eip1559support = await getCurrentNetworkEIP1559Compatibility();
    }
    const account = getSelectedAccount(state);
    const {
        send: sendState,
        metamask
    } = state;
    const draftTransaction = sendState.draftTransactions[sendState.currentTransactionUUID];
    if (!draftTransaction) {
        return thunkApi.rejectWithValue('draftTransaction not found, possibly not on send flow');
    }
    let gasPrice = sendState.stage === SEND_STAGES.EDIT ? draftTransaction.gas.gasPrice : '0x1';
    let gasEstimatePollToken = null;
    gasEstimatePollToken = await gasFeeStartPollingByNetworkClientId(selectedNetworkClientId);
    addPollingTokenToAppState(gasEstimatePollToken);
    const {
        metamask: {gasFeeEstimates, gasEstimateType}
    } = thunkApi.getState();
    if (sendState.stage !== SEND_STAGES.EDIT) {
        if (gasEstimateType === GasEstimateTypes.legacy) {
            gasPrice = getGasPriceInHexWei(gasFeeEstimates.medium);
        } else if (gasEstimateType === GasEstimateTypes.ethGasPrice) {
            gasPrice = getRoundedGasPrice(gasFeeEstimates.gasPrice);
        } else if (gasEstimateType === GasEstimateTypes.feeMarket) {
            gasPrice = getGasPriceInHexWei(gasFeeEstimates.medium.suggestedMaxFeePerGas);
        } else {
            gasPrice = gasFeeEstimates.gasPrice ? getRoundedGasPrice(gasFeeEstimates.gasPrice) : '0x0';
        }
    }
    let {gasLimit} = draftTransaction.gas;
    if (gasEstimateType !== GasEstimateTypes.none && sendState.stage !== SEND_STAGES.EDIT && draftTransaction.recipient.address) {
        gasLimit = draftTransaction.sendAsset.type === AssetType.token || draftTransaction.sendAsset.type === AssetType.NFT ? GAS_LIMITS.BASE_TOKEN_ESTIMATE : GAS_LIMITS.SIMPLE;
        const estimatedGasLimit = await estimateGasLimitForSend({
            gasPrice,
            blockGasLimit: metamask.currentBlockGasLimit,
            selectedAddress: getSender(state),
            sendToken: draftTransaction.sendAsset.details,
            to: draftTransaction.recipient.address.toLowerCase(),
            value: draftTransaction.amount.value,
            data: draftTransaction.userInputHexData,
            isNonStandardEthChain,
            chainId
        });
        gasLimit = estimatedGasLimit || gasLimit;
    }
    await thunkApi.dispatch(setCustomGasLimit(gasLimit));
    const newState = thunkApi.getState();
    if (newState.send.currentTransactionUUID !== sendState.currentTransactionUUID) {
        return thunkApi.rejectWithValue(`draftTransaction changed during initialization.
        A new initializeSendState action must be dispatched.`);
    }
    const swapsBlockedTokens = getIsSwapsChain(state) && getUseExternalServices(state) ? (await fetchBlockedTokens(chainId)).map(t => t.toLowerCase()) : [];
    const disabledSwapAndSendNetworks = await getDisabledSwapAndSendNetworksFromAPI();
    return {
        account,
        chainId: getCurrentChainId(state),
        tokens: getTokens(state),
        chainHasChanged,
        disabledSwapAndSendNetworks,
        gasFeeEstimates,
        gasEstimateType,
        gasLimit,
        gasTotal: addHexPrefix(calcGasTotal(gasLimit, gasPrice)),
        gasEstimatePollToken,
        eip1559support,
        useTokenDetection: getUseTokenDetection(state),
        tokenAddressList: Object.keys(getTokenList(state)),
        swapsBlockedTokens
    };
});
let latestFetchTime;
const fetchSwapAndSendQuotes = createAsyncThunk('send/fetchSwapAndSendQuotes', async ({requestTimestamp}, thunkApi) => {
    const state = thunkApi.getState();
    const sendState = state[name];
    const chainId = getCurrentChainId(state);
    const draftTransaction = sendState.draftTransactions[sendState.currentTransactionUUID];
    const sender = getSender(state);
    const sourceAmount = hexToDecimal(draftTransaction.amount.value);
    if (!Number(sourceAmount) || !draftTransaction.sendAsset || !draftTransaction.receiveAsset || !draftTransaction.recipient.address) {
        return {
            quotes: null,
            requestTimestamp
        };
    }
    let quotes = await new Promise((resolve, reject) => setTimeout(async () => {
        if (requestTimestamp !== latestFetchTime) {
            reject(new Error(RECENT_REQUEST_ERROR));
        }
        getSwapAndSendQuotes({
            chainId,
            sourceAmount,
            sourceToken: draftTransaction.sendAsset?.details?.address || SWAPS_CHAINID_DEFAULT_TOKEN_MAP[chainId].address,
            destinationToken: draftTransaction.receiveAsset?.details?.address || SWAPS_CHAINID_DEFAULT_TOKEN_MAP[chainId].address,
            sender,
            recipient: draftTransaction.recipient.address
        }).then(response => resolve(response)).catch(() => reject(SWAPS_QUOTES_ERROR));
    }, FETCH_DELAY));
    for (const quote of quotes) {
        if (quote.approvalNeeded) {
            quote.approvalNeeded.gas = addHexPrefix(await estimateGas(quote.approvalNeeded));
        }
    }
    quotes = await addAdjustedReturnToQuotes(quotes, state, draftTransaction.receiveAsset?.details);
    if (!quotes?.length) {
        throw new Error(SWAPS_NO_QUOTES);
    }
    return {
        quotes,
        requestTimestamp
    };
});
const slice = createSlice({
    name,
    initialState,
    reducers: {
        addNewDraft: (state, action) => {
            state.currentTransactionUUID = uuidv4();
            state.draftTransactions[state.currentTransactionUUID] = action.payload;
            if (action.payload.id) {
                state.stage = SEND_STAGES.EDIT;
            } else {
                state.stage = SEND_STAGES.ADD_RECIPIENT;
            }
        },
        addHistoryEntry: (state, action) => {
            const draftTransaction = state.draftTransactions[state.currentTransactionUUID];
            if (draftTransaction) {
                draftTransaction.history.push({
                    entry: action.payload,
                    timestamp: Date.now()
                });
            }
        },
        calculateGasTotal: state => {
            const draftTransaction = state.draftTransactions[state.currentTransactionUUID];
            if (!draftTransaction) {
                return;
            }
            if (draftTransaction.transactionType === TransactionEnvelopeType.feeMarket) {
                draftTransaction.gas.gasTotal = addHexPrefix(calcGasTotal(draftTransaction.gas.gasLimit, draftTransaction.gas.maxFeePerGas));
            } else {
                draftTransaction.gas.gasTotal = addHexPrefix(calcGasTotal(draftTransaction.gas.gasLimit, draftTransaction.gas.gasPrice));
            }
            if (state.amountMode === AMOUNT_MODES.MAX && draftTransaction.sendAsset.type === AssetType.native) {
                slice.caseReducers.updateAmountToMax(state);
            }
            slice.caseReducers.validateAmountField(state);
            slice.caseReducers.validateGasField(state);
            slice.caseReducers.validateSendState(state);
        },
        clearPreviousDrafts: state => {
            state.currentTransactionUUID = null;
            state.draftTransactions = {};
        },
        resetSendState: state => ({
            ...initialState,
            prevSwapAndSendInput: state.prevSwapAndSendInput
        }),
        setPrevSwapAndSend: (state, action) => {
            state.prevSwapAndSendInput = action.payload;
        },
        updateAmountMode: (state, action) => {
            if (Object.values(AMOUNT_MODES).includes(action.payload)) {
                state.amountMode = action.payload;
            }
        },
        updateAmountToMax: state => {
            const draftTransaction = state.draftTransactions[state.currentTransactionUUID];
            let amount = '0x0';
            if (draftTransaction?.sendAsset.type === AssetType.token) {
                const decimals = draftTransaction.sendAsset.details?.decimals ?? 0;
                const multiplier = Math.pow(10, Number(decimals));
                amount = new Numeric(draftTransaction.sendAsset.balance, 16).times(multiplier, 10).toString();
            } else {
                const _gasTotal = new Numeric(draftTransaction.gas.gasTotal || '0x0', 16).add(new Numeric(state.gasTotalForLayer1 ?? '0x0', 16));
                amount = new Numeric(draftTransaction.sendAsset.balance, 16).lessThanOrEqualTo(_gasTotal) ? '0' : new Numeric(draftTransaction.sendAsset.balance, 16).minus(_gasTotal).toString();
            }
            slice.caseReducers.updateSendAmount(state, { payload: amount });
        },
        updateAsset: (state, action) => {
            const {asset, initialAssetSet, isReceived} = action.payload;
            const draftTransaction = state.draftTransactions[state.currentTransactionUUID];
            const targetAsset = draftTransaction[isReceived ? 'receiveAsset' : 'sendAsset'];
            targetAsset.type = asset.type;
            targetAsset.balance = asset.balance;
            targetAsset.error = asset.error;
            if (targetAsset.type === AssetType.token || targetAsset.type === AssetType.NFT) {
                targetAsset.details = asset.details;
            } else {
                targetAsset.details = null;
                if (draftTransaction.recipient.error === CONTRACT_ADDRESS_ERROR) {
                    draftTransaction.recipient.error = null;
                }
            }
            if (!isReceived) {
                draftTransaction.receiveAsset = targetAsset;
            }
            if (state.amountMode === AMOUNT_MODES.MAX) {
                state.amountMode = AMOUNT_MODES.INPUT;
                slice.caseReducers.updateSendAmount(state, { payload: '0x0' });
            } else if (initialAssetSet === false) {
                if (isReceived) {
                    draftTransaction.quotes = draftTransactionInitialState.quotes;
                } else {
                    slice.caseReducers.updateSendAmount(state, { payload: '0x0' });
                    slice.caseReducers.updateUserInputHexData(state, { payload: '' });
                }
            }
            slice.caseReducers.validateSendState(state);
        },
        updateGasFeeEstimates: (state, action) => {
            const {gasFeeEstimates, gasEstimateType} = action.payload;
            let gasPriceEstimate = '0x0';
            switch (gasEstimateType) {
            case GasEstimateTypes.feeMarket:
                slice.caseReducers.updateGasFees(state, {
                    payload: {
                        transactionType: TransactionEnvelopeType.feeMarket,
                        maxFeePerGas: getGasPriceInHexWei(gasFeeEstimates.medium.suggestedMaxFeePerGas),
                        maxPriorityFeePerGas: getGasPriceInHexWei(gasFeeEstimates.medium.suggestedMaxPriorityFeePerGas)
                    }
                });
                break;
            case GasEstimateTypes.legacy:
                gasPriceEstimate = getRoundedGasPrice(gasFeeEstimates.medium);
                slice.caseReducers.updateGasFees(state, {
                    payload: {
                        gasPrice: gasPriceEstimate,
                        type: TransactionEnvelopeType.legacy,
                        isAutomaticUpdate: true
                    }
                });
                break;
            case GasEstimateTypes.ethGasPrice:
                gasPriceEstimate = getRoundedGasPrice(gasFeeEstimates.gasPrice);
                slice.caseReducers.updateGasFees(state, {
                    payload: {
                        gasPrice: getRoundedGasPrice(gasFeeEstimates.gasPrice),
                        type: TransactionEnvelopeType.legacy,
                        isAutomaticUpdate: true
                    }
                });
                break;
            case GasEstimateTypes.none:
            default:
                break;
            }
            state.gasPriceEstimate = addHexPrefix(gasPriceEstimate);
        },
        updateGasFees: (state, action) => {
            const draftTransaction = state.draftTransactions[state.currentTransactionUUID];
            if (draftTransaction) {
                if (action.payload.transactionType === TransactionEnvelopeType.feeMarket) {
                    draftTransaction.gas.maxFeePerGas = addHexPrefix(action.payload.maxFeePerGas);
                    draftTransaction.gas.maxPriorityFeePerGas = addHexPrefix(action.payload.maxPriorityFeePerGas);
                    draftTransaction.transactionType = TransactionEnvelopeType.feeMarket;
                } else {
                    if (action.payload.manuallyEdited) {
                        draftTransaction.gas.wasManuallyEdited = true;
                    }
                    if (!draftTransaction.gas.wasManuallyEdited || action.payload.manuallyEdited) {
                        draftTransaction.gas.gasPrice = addHexPrefix(action.payload.gasPrice);
                    }
                    draftTransaction.transactionType = TransactionEnvelopeType.legacy;
                }
                slice.caseReducers.calculateGasTotal(state);
            }
        },
        updateGasLimit: (state, action) => {
            const draftTransaction = state.draftTransactions[state.currentTransactionUUID];
            if (draftTransaction) {
                draftTransaction.gas.gasLimit = addHexPrefix(action.payload);
                slice.caseReducers.calculateGasTotal(state);
            }
        },
        updateLayer1Fees: (state, action) => {
            const draftTransaction = state.draftTransactions[state.currentTransactionUUID];
            state.gasTotalForLayer1 = action.payload;
            if (state.amountMode === AMOUNT_MODES.MAX && draftTransaction?.sendAsset.type === AssetType.native) {
                slice.caseReducers.updateAmountToMax(state);
            }
        },
        updateRecipient: (state, action) => {
            const draftTransaction = state.draftTransactions[state.currentTransactionUUID];
            draftTransaction.recipient.error = null;
            state.recipientInput = '';
            draftTransaction.recipient.address = action.payload.address ?? '';
            draftTransaction.recipient.nickname = action.payload.nickname ?? '';
            if (draftTransaction.recipient.address === '') {
                state.stage = SEND_STAGES.ADD_RECIPIENT;
            } else {
                state.stage = draftTransaction.id === null ? SEND_STAGES.DRAFT : SEND_STAGES.EDIT;
                state.recipientMode = RECIPIENT_SEARCH_MODES.CONTACT_LIST;
            }
            slice.caseReducers.validateSendState(state);
        },
        updateRecipientSearchMode: (state, action) => {
            state.recipientInput = '';
            state.recipientMode = action.payload;
        },
        updateRecipientWarning: (state, action) => {
            const draftTransaction = state.draftTransactions[state.currentTransactionUUID];
            draftTransaction.recipient.warning = action.payload;
        },
        updateRecipientType: (state, action) => {
            const draftTransaction = state.draftTransactions[state.currentTransactionUUID];
            draftTransaction.recipient.type = action.payload;
        },
        updateDraftTransactionStatus: (state, action) => {
            const draftTransaction = state.draftTransactions[state.currentTransactionUUID];
            draftTransaction.status = action.payload;
        },
        acknowledgeRecipientWarning: state => {
            const draftTransaction = state.draftTransactions[state.currentTransactionUUID];
            draftTransaction.recipient.recipientWarningAcknowledged = true;
            slice.caseReducers.validateSendState(state);
        },
        updateRecipientUserInput: (state, action) => {
            state.recipientInput = action.payload;
        },
        updateSendAmount: (state, action) => {
            const draftTransaction = state.draftTransactions[state.currentTransactionUUID];
            draftTransaction.amount.value = addHexPrefix(action.payload);
            slice.caseReducers.validateAmountField(state);
            if (draftTransaction.sendAsset.type === AssetType.native) {
                slice.caseReducers.validateGasField(state);
            }
        },
        updateUserInputHexData: (state, action) => {
            const draftTransaction = state.draftTransactions[state.currentTransactionUUID];
            draftTransaction.userInputHexData = action.payload;
        },
        useCustomGas: state => {
            state.gasIsSetInModal = true;
        },
        useDefaultGas: state => {
            state.gasIsSetInModal = false;
        },
        validateAmountField: state => {
            const draftTransaction = state.draftTransactions[state.currentTransactionUUID];
            if (!draftTransaction) {
                return;
            }
            const amountValue = new Numeric(draftTransaction.amount.value, 16);
            switch (true) {
            case draftTransaction.sendAsset.type === AssetType.NFT && draftTransaction.sendAsset.details.standard === TokenStandard.ERC1155 && draftTransaction.amount.value === '0x0':
                draftTransaction.amount.error = NEGATIVE_OR_ZERO_AMOUNT_TOKENS_ERROR;
                if (draftTransaction.status !== SEND_STATUSES.INVALID) {
                    slice.caseReducers.validateSendState(state);
                }
                break;
            case draftTransaction.sendAsset.type === AssetType.NFT && draftTransaction.sendAsset.details.standard === TokenStandard.ERC1155 && !isERC1155BalanceSufficient({
                    tokenBalance: draftTransaction.sendAsset.balance ?? '0x0',
                    amount: draftTransaction.amount.value
                }):
                draftTransaction.amount.error = INSUFFICIENT_FUNDS_ERROR;
                if (draftTransaction.status !== SEND_STATUSES.INVALID) {
                    slice.caseReducers.validateSendState(state);
                }
                break;
            case amountValue.isFloat() && draftTransaction.sendAsset.type === AssetType.NFT && draftTransaction.sendAsset.details.standard === TokenStandard.ERC1155:
                draftTransaction.amount.error = FLOAT_TOKENS_ERROR;
                if (draftTransaction.status !== SEND_STATUSES.INVALID) {
                    slice.caseReducers.validateSendState(state);
                }
                break;
            case draftTransaction.sendAsset.type === AssetType.token && !isTokenBalanceSufficient({
                    tokenBalance: draftTransaction.sendAsset.balance ?? '0x0',
                    amount: draftTransaction.amount.value,
                    decimals: draftTransaction.sendAsset.details.decimals
                }):
                draftTransaction.amount.error = INSUFFICIENT_TOKENS_ERROR;
                if (draftTransaction.status !== SEND_STATUSES.INVALID) {
                    slice.caseReducers.validateSendState(state);
                }
                break;
            case !isBalanceSufficient({
                    amount: draftTransaction.sendAsset.type === AssetType.native ? draftTransaction.amount.value : undefined,
                    balance: draftTransaction.sendAsset.type === AssetType.native ? draftTransaction.sendAsset.balance : state.selectedAccount.balance,
                    gasTotal: draftTransaction.gas.gasTotal ?? '0x0'
                }): {
                    const isInsufficientWithoutGas = draftTransaction.sendAsset.type === AssetType.native && !isBalanceSufficient({
                        amount: draftTransaction.amount.value,
                        balance: draftTransaction.sendAsset.balance,
                        gasTotal: '0x0'
                    });
                    draftTransaction.amount.error = isInsufficientWithoutGas ? INSUFFICIENT_FUNDS_ERROR : INSUFFICIENT_FUNDS_FOR_GAS_ERROR;
                    if (draftTransaction.status !== SEND_STATUSES.INVALID) {
                        slice.caseReducers.validateSendState(state);
                    }
                    break;
                }
            default:
                draftTransaction.amount.error = null;
                if (draftTransaction.status === SEND_STATUSES.INVALID) {
                    slice.caseReducers.validateSendState(state);
                }
            }
        },
        validateGasField: state => {
            const draftTransaction = state.draftTransactions[state.currentTransactionUUID];
            if (!draftTransaction) {
                return;
            }
            const insufficientFunds = !isBalanceSufficient({
                amount: draftTransaction.sendAsset.type === AssetType.native ? draftTransaction.amount.value : '0x0',
                balance: draftTransaction.fromAccount?.balance ?? state.selectedAccount.balance,
                gasTotal: draftTransaction.gas.gasTotal ?? '0x0'
            });
            draftTransaction.gas.error = insufficientFunds ? INSUFFICIENT_FUNDS_ERROR : null;
        },
        validateRecipientUserInput: (state, action) => {
            const draftTransaction = state.draftTransactions[state.currentTransactionUUID];
            if (draftTransaction) {
                if (state.recipientMode === RECIPIENT_SEARCH_MODES.MY_ACCOUNTS || state.recipientInput === '' || state.recipientInput === null) {
                    draftTransaction.recipient.error = null;
                    draftTransaction.recipient.warning = null;
                } else {
                    const {tokens, tokenAddressList, isProbablyAnAssetContract} = action.payload;
                    if (isBurnAddress(state.recipientInput) || isPossibleAddress(state.recipientInput) && !isValidHexAddress(state.recipientInput, { mixedCaseUseChecksum: true })) {
                        draftTransaction.recipient.error = INVALID_RECIPIENT_ADDRESS_ERROR;
                    } else if (isOriginContractAddress(state.recipientInput, draftTransaction.sendAsset?.details?.address)) {
                        draftTransaction.recipient.error = CONTRACT_ADDRESS_ERROR;
                    } else {
                        draftTransaction.recipient.error = null;
                    }
                    if (isValidHexAddress(state.recipientInput) && (tokenAddressList.find(address => isEqualCaseInsensitive(address, state.recipientInput)) || checkExistingAddresses(state.recipientInput, tokens)) || isProbablyAnAssetContract) {
                        draftTransaction.recipient.warning = KNOWN_RECIPIENT_ADDRESS_WARNING;
                    } else {
                        draftTransaction.recipient.warning = null;
                    }
                }
            }
            slice.caseReducers.validateSendState(state);
        },
        validateSendState: state => {
            const draftTransaction = state.draftTransactions[state.currentTransactionUUID];
            slice.caseReducers.addHistoryEntry(state, { payload: 'Begin validating send state' });
            if (draftTransaction) {
                const isSwapAndSend = getIsDraftSwapAndSend(draftTransaction);
                const getIsIgnorableAmountError = () => [
                    INSUFFICIENT_TOKENS_ERROR,
                    INSUFFICIENT_FUNDS_ERROR,
                    INSUFFICIENT_FUNDS_FOR_GAS_ERROR
                ].includes(draftTransaction.amount.error) && !draftTransaction.sendAsset.balance;
                const {quotes, gas} = draftTransaction;
                const bestQuote = quotes ? calculateBestQuote(quotes) : undefined;
                const derivedGasPrice = hexToDecimal(gas?.gasTotal || '0x0') > 0 && hexToDecimal(gas?.gasLimit || '0x0') > 0 ? new Numeric(gas.gasTotal, 16).divide(gas.gasLimit, 16).toString() : undefined;
                switch (true) {
                case Boolean(draftTransaction.amount.error && !getIsIgnorableAmountError()):
                    slice.caseReducers.addHistoryEntry(state, { payload: `Amount is in error ${ draftTransaction.amount.error }` });
                    draftTransaction.status = SEND_STATUSES.INVALID;
                    break;
                case Boolean(draftTransaction.gas.error):
                    slice.caseReducers.addHistoryEntry(state, { payload: `Gas is in error ${ draftTransaction.gas.error }` });
                    draftTransaction.status = SEND_STATUSES.INVALID;
                    break;
                case Boolean(draftTransaction.sendAsset.error):
                    slice.caseReducers.addHistoryEntry(state, { payload: `Send asset is in error ${ draftTransaction.sendAsset.error }` });
                    draftTransaction.status = SEND_STATUSES.INVALID;
                    break;
                case Boolean(draftTransaction.receiveAsset.error):
                    slice.caseReducers.addHistoryEntry(state, { payload: `Receive asset is in error ${ draftTransaction.receiveAsset.error }` });
                    draftTransaction.status = SEND_STATUSES.INVALID;
                    break;
                case draftTransaction.sendAsset.type === AssetType.token && draftTransaction.sendAsset.details === null:
                    slice.caseReducers.addHistoryEntry(state, { payload: 'Send asset is TOKEN and token details is null' });
                    draftTransaction.status = SEND_STATUSES.INVALID;
                    break;
                case draftTransaction.receiveAsset.type === AssetType.token && draftTransaction.receiveAsset.details === null:
                    slice.caseReducers.addHistoryEntry(state, { payload: 'Receive asset is TOKEN and token details is null' });
                    draftTransaction.status = SEND_STATUSES.INVALID;
                    break;
                case state.stage === SEND_STAGES.ADD_RECIPIENT:
                    slice.caseReducers.addHistoryEntry(state, { payload: `Form is invalid because stage is ADD_RECIPIENT` });
                    draftTransaction.status = SEND_STATUSES.INVALID;
                    break;
                case state.stage === SEND_STAGES.INACTIVE:
                    slice.caseReducers.addHistoryEntry(state, { payload: `Form is invalid because stage is INACTIVE` });
                    draftTransaction.status = SEND_STATUSES.INVALID;
                    break;
                case state.gasEstimateIsLoading:
                    slice.caseReducers.addHistoryEntry(state, { payload: `Form is invalid because gasEstimateIsLoading` });
                    draftTransaction.status = SEND_STATUSES.INVALID;
                    break;
                case new BigNumber(draftTransaction.gas.gasLimit, 16).lessThan(new BigNumber(state.gasLimitMinimum)):
                    slice.caseReducers.addHistoryEntry(state, { payload: `Form is invalid because ${ draftTransaction.gas.gasLimit } is lessThan ${ state.gasLimitMinimum }` });
                    draftTransaction.status = SEND_STATUSES.INVALID;
                    break;
                case draftTransaction.recipient.warning === 'loading':
                    slice.caseReducers.addHistoryEntry(state, { payload: `Form is invalid because recipient warning is loading` });
                    draftTransaction.status = SEND_STATUSES.INVALID;
                    break;
                case draftTransaction.recipient.warning === KNOWN_RECIPIENT_ADDRESS_WARNING && draftTransaction.recipient.recipientWarningAcknowledged === false:
                    slice.caseReducers.addHistoryEntry(state, { payload: `Form is invalid because recipient warning not acknolwedged` });
                    draftTransaction.status = SEND_STATUSES.INVALID;
                    break;
                case Boolean(bestQuote && !isEqualCaseInsensitive(bestQuote.recipient, draftTransaction.recipient.address)):
                    slice.caseReducers.addHistoryEntry(state, { payload: `Recipient is not match ${ draftTransaction.recipient.address } ${ bestQuote.recipient }` });
                    draftTransaction.status = SEND_STATUSES.INVALID;
                    break;
                case Boolean(bestQuote && !isEqualCaseInsensitive(bestQuote.trade.from, state.selectedAccount.address)):
                    slice.caseReducers.addHistoryEntry(state, { payload: `Sender is not match ${ state.selectedAccount.address } ${ bestQuote.trade.from }` });
                    draftTransaction.status = SEND_STATUSES.INVALID;
                    break;
                case Boolean(bestQuote && !isEqualCaseInsensitive(draftTransaction.sendAsset?.details?.address || zeroAddress(), bestQuote.sourceToken)):
                    slice.caseReducers.addHistoryEntry(state, { payload: `Source token is not match ${ draftTransaction.sendAsset?.details?.address } ${ bestQuote.sourceToken }` });
                    draftTransaction.status = SEND_STATUSES.INVALID;
                    break;
                case Boolean(bestQuote && !isEqualCaseInsensitive(bestQuote.destinationToken, draftTransaction.receiveAsset?.details?.address || zeroAddress())):
                    slice.caseReducers.addHistoryEntry(state, { payload: `Destination token is not match ${ draftTransaction.receiveAsset?.details?.address } ${ bestQuote.destinationToken }` });
                    draftTransaction.status = SEND_STATUSES.INVALID;
                    break;
                case bestQuote && !isBalanceSufficient({
                        amount: draftTransaction.sendAsset.type === AssetType.native ? draftTransaction.amount.value : undefined,
                        balance: state.selectedAccount.balance,
                        gasTotal: calcGasTotal(new Numeric(bestQuote?.gasParams?.maxGas || 0, 10).toPrefixedHexString(), derivedGasPrice ?? '0x0')
                    }): {
                        if (!draftTransaction.amount.error) {
                            draftTransaction.amount.error = INSUFFICIENT_FUNDS_FOR_GAS_ERROR;
                        }
                        draftTransaction.status = SEND_STATUSES.INVALID;
                        break;
                    }
                case isSwapAndSend && !bestQuote:
                    slice.caseReducers.addHistoryEntry(state, { payload: `No swap and send quote available` });
                    draftTransaction.status = SEND_STATUSES.INVALID;
                    break;
                default:
                    slice.caseReducers.addHistoryEntry(state, { payload: `Form is valid` });
                    draftTransaction.status = SEND_STATUSES.VALID;
                }
            }
        }
    },
    extraReducers: builder => {
        builder.addCase(ACCOUNT_CHANGED, (state, action) => {
            if (state.stage === SEND_STAGES.EDIT && action.payload.account) {
                const draftTransaction = state.draftTransactions[state.currentTransactionUUID];
                if (draftTransaction && draftTransaction.fromAccount && draftTransaction.fromAccount.address === action.payload.account.address) {
                    draftTransaction.fromAccount.balance = action.payload.account.balance;
                    if (draftTransaction.sendAsset.type === AssetType.native) {
                        draftTransaction.sendAsset.balance = action.payload.account.balance;
                    }
                    slice.caseReducers.validateAmountField(state);
                    slice.caseReducers.validateGasField(state);
                    slice.caseReducers.validateSendState(state);
                }
            }
        }).addCase(ADDRESS_BOOK_UPDATED, (state, action) => {
            const {addressBook} = action.payload;
            const draftTransaction = state.draftTransactions[state.currentTransactionUUID];
            if (draftTransaction && addressBook[draftTransaction.recipient.address]?.name) {
                draftTransaction.recipient.nickname = addressBook[draftTransaction.recipient.address].name;
            }
        }).addCase(CLEAR_SWAP_AND_SEND_STATE, state => {
            const draftTransaction = state.draftTransactions[state.currentTransactionUUID];
            draftTransaction.quotes = draftTransactionInitialState.quotes;
            draftTransaction.swapQuotesError = draftTransactionInitialState.swapQuotesError;
            draftTransaction.isSwapQuoteLoading = draftTransactionInitialState.isSwapQuoteLoading;
            draftTransaction.swapQuotesLatestRequestTimestamp = draftTransactionInitialState.swapQuotesLatestRequestTimestamp;
            draftTransaction.timeToFetchQuotes = draftTransactionInitialState.timeToFetchQuotes;
        }).addCase(computeEstimatedGasLimit.pending, state => {
            state.gasEstimateIsLoading = true;
        }).addCase(computeEstimatedGasLimit.fulfilled, (state, action) => {
            state.gasEstimateIsLoading = false;
            if (action.payload?.gasLimit) {
                slice.caseReducers.updateGasLimit(state, { payload: action.payload.gasLimit });
            }
            if (action.payload?.gasTotalForLayer1) {
                slice.caseReducers.updateLayer1Fees(state, { payload: action.payload.gasTotalForLayer1 });
            }
        }).addCase(computeEstimatedGasLimit.rejected, state => {
            state.gasEstimateIsLoading = false;
        }).addCase(GAS_FEE_ESTIMATES_UPDATED, (state, action) => {
            slice.caseReducers.updateGasFeeEstimates(state, { payload: action.payload });
        }).addCase(initializeSendState.pending, state => {
            state.gasEstimateIsLoading = true;
        }).addCase(initializeSendState.fulfilled, (state, action) => {
            state.eip1559support = action.payload.eip1559support;
            state.selectedAccount.address = action.payload.account.address;
            state.selectedAccount.balance = action.payload.account.balance;
            state.prevSwapAndSendInput = initialState.prevSwapAndSendInput;
            const draftTransaction = state.draftTransactions[state.currentTransactionUUID];
            if (draftTransaction) {
                draftTransaction.gas.gasLimit = action.payload.gasLimit;
                draftTransaction.gas.gasTotal = action.payload.gasTotal;
                if (action.payload.chainHasChanged) {
                    draftTransaction.sendAsset.type = AssetType.native;
                    draftTransaction.sendAsset.balance = draftTransaction.fromAccount?.balance ?? state.selectedAccount.balance;
                    draftTransaction.sendAsset.details = null;
                    draftTransaction.receiveAsset = draftTransactionInitialState.receiveAsset;
                }
            }
            slice.caseReducers.updateGasFeeEstimates(state, {
                payload: {
                    gasFeeEstimates: action.payload.gasFeeEstimates,
                    gasEstimateType: action.payload.gasEstimateType
                }
            });
            state.gasEstimatePollToken = action.payload.gasEstimatePollToken;
            if (action.payload.gasEstimatePollToken) {
                state.gasEstimateIsLoading = false;
            }
            if (state.stage !== SEND_STAGES.INACTIVE) {
                slice.caseReducers.validateRecipientUserInput(state, {
                    payload: {
                        chainId: action.payload.chainId,
                        tokens: action.payload.tokens,
                        useTokenDetection: action.payload.useTokenDetection,
                        tokenAddressList: action.payload.tokenAddressList
                    }
                });
            }
            state.swapsBlockedTokens = action.payload.swapsBlockedTokens;
            state.disabledSwapAndSendNetworks = action.payload.disabledSwapAndSendNetworks;
            if (state.amountMode === AMOUNT_MODES.MAX) {
                slice.caseReducers.updateAmountToMax(state);
            }
            slice.caseReducers.validateAmountField(state);
            slice.caseReducers.validateGasField(state);
            slice.caseReducers.validateSendState(state);
        }).addCase(initializeSendState.rejected, state => {
            state.prevSwapAndSendInput = initialState.prevSwapAndSendInput;
        }).addCase(fetchSwapAndSendQuotes.pending, (state, action) => {
            const draftTransaction = state.draftTransactions[state.currentTransactionUUID];
            if (draftTransaction) {
                if (!action.meta?.arg?.isRefreshingQuotes) {
                    draftTransaction.quotes = draftTransactionInitialState.quotes;
                }
                draftTransaction.swapQuotesError = null;
                draftTransaction.isSwapQuoteLoading = true;
                draftTransaction.swapQuotesLatestRequestTimestamp = Math.max(action.meta.arg.requestTimestamp, draftTransaction.swapQuotesLatestRequestTimestamp);
            }
            slice.caseReducers.validateSendState(state);
        }).addCase(fetchSwapAndSendQuotes.fulfilled, (state, action) => {
            const draftTransaction = state.draftTransactions[state.currentTransactionUUID];
            if (draftTransaction && action.payload.requestTimestamp === draftTransaction.swapQuotesLatestRequestTimestamp) {
                draftTransaction.timeToFetchQuotes = Date.now() - action.payload.requestTimestamp;
                draftTransaction.isSwapQuoteLoading = false;
                draftTransaction.swapQuotesError = null;
                if (action.payload) {
                    draftTransaction.quotes = action.payload.quotes;
                }
            }
            slice.caseReducers.validateSendState(state);
        }).addCase(fetchSwapAndSendQuotes.rejected, (state, action) => {
            if (action.error.message === RECENT_REQUEST_ERROR) {
                return;
            }
            const draftTransaction = state.draftTransactions[state.currentTransactionUUID];
            if (draftTransaction) {
                draftTransaction.isSwapQuoteLoading = false;
                draftTransaction.swapQuotesError = action.error.message;
            }
        }).addCase(SELECTED_ACCOUNT_CHANGED, (state, action) => {
            if (state.stage !== SEND_STAGES.EDIT && action.payload.account) {
                state.selectedAccount.balance = action.payload.account.balance;
                state.selectedAccount.address = action.payload.account.address;
                const draftTransaction = state.draftTransactions[state.currentTransactionUUID];
                if (draftTransaction) {
                    if (draftTransaction?.sendAsset.type === AssetType.native) {
                        draftTransaction.sendAsset.balance = action.payload.account.balance;
                    }
                    if (draftTransaction?.sendAsset.type === AssetType.token || draftTransaction?.sendAsset.type === AssetType.NFT) {
                        draftTransaction.sendAsset.type = draftTransactionInitialState.sendAsset.type;
                        draftTransaction.sendAsset.error = draftTransactionInitialState.sendAsset.error;
                        draftTransaction.sendAsset.details = draftTransactionInitialState.sendAsset.details;
                        draftTransaction.sendAsset.balance = action.payload.account.balance;
                        draftTransaction.receiveAsset = draftTransactionInitialState.receiveAsset;
                        draftTransaction.amount.value = draftTransactionInitialState.amount.value;
                    }
                    slice.caseReducers.validateAmountField(state);
                    slice.caseReducers.validateGasField(state);
                    slice.caseReducers.validateSendState(state);
                }
            }
        }).addCase(QR_CODE_DETECTED, (state, action) => {
            const qrCodeData = action.value;
            const draftTransaction = state.draftTransactions[state.currentTransactionUUID];
            if (qrCodeData && draftTransaction) {
                if (qrCodeData.type === 'address') {
                    const scannedAddress = qrCodeData.values.address.toLowerCase();
                    if (isValidHexAddress(scannedAddress, { allowNonPrefixed: false })) {
                        if (draftTransaction.recipient.address !== scannedAddress) {
                            slice.caseReducers.updateRecipient(state, { payload: { address: scannedAddress } });
                        }
                    } else {
                        draftTransaction.recipient.error = INVALID_RECIPIENT_ADDRESS_ERROR;
                    }
                }
            }
        });
    }
});
const {actions, reducer} = slice;
export default reducer;
const {useDefaultGas, useCustomGas, updateGasLimit, validateRecipientUserInput, updateRecipientSearchMode, addHistoryEntry, acknowledgeRecipientWarning} = actions;
export {
    useDefaultGas,
    useCustomGas,
    updateGasLimit,
    addHistoryEntry,
    acknowledgeRecipientWarning
};
const debouncedValidateRecipientUserInput = debounce((dispatch, payload, resolve) => {
    dispatch(addHistoryEntry(`sendFlow - user typed ${ payload.userInput } into recipient input field`));
    dispatch(validateRecipientUserInput(payload));
    resolve();
}, 300);
const debouncedComputeEstimatedGasLimit = debounce(async dispatch => {
    await dispatch(computeEstimatedGasLimit());
}, 300);
const debouncedAddHistoryEntry = debounce((dispatch, payload) => {
    dispatch(addHistoryEntry(payload));
}, 100);
export function editExistingTransaction(assetType, transactionId) {
    return async (dispatch, getState) => {
        await dispatch(actions.clearPreviousDrafts());
        const state = getState();
        const unapprovedTransactions = getUnapprovedTransactions(state);
        const transaction = unapprovedTransactions[transactionId];
        const account = getTargetAccount(state, transaction.txParams.from);
        const isSwapAndSend = Boolean(state[name].prevSwapAndSendInput);
        if (isSwapAndSend) {
            const {
                amountMode,
                amount: {value: amount},
                ...draftTxParams
            } = state[name].prevSwapAndSendInput;
            dispatch(actions.addNewDraft({
                ...draftTransactionInitialState,
                ...draftTxParams,
                id: transactionId,
                fromAccount: account,
                history: [`sendFlow - user clicked edit on transaction with id ${ transactionId } (swap and send)`]
            }));
            if (amountMode === AMOUNT_MODES.MAX) {
                dispatch(actions.updateAmountMode(AMOUNT_MODES.MAX));
                dispatch(actions.updateAmountToMax());
                dispatch(updateSendQuote());
            } else {
                dispatch(updateSendAmount(amount));
            }
        } else if (assetType === AssetType.native) {
            await dispatch(actions.addNewDraft({
                ...draftTransactionInitialState,
                id: transactionId,
                fromAccount: account,
                gas: {
                    ...draftTransactionInitialState.gas,
                    gasLimit: transaction.txParams.gas,
                    gasPrice: transaction.txParams.gasPrice
                },
                userInputHexData: transaction.txParams.data,
                recipient: {
                    ...draftTransactionInitialState.recipient,
                    address: transaction.txParams.to,
                    nickname: getAddressBookEntryOrAccountName(state, transaction.txParams.to) ?? ''
                },
                amount: {
                    ...draftTransactionInitialState.amount,
                    value: transaction.txParams.value
                },
                history: [`sendFlow - user clicked edit on transaction with id ${ transactionId }`]
            }));
            await dispatch(updateSendAsset({ type: AssetType.native }, { initialAssetSet: true }));
        } else {
            const tokenData = parseStandardTokenTransactionData(transaction.txParams.data);
            const tokenAmountInDec = assetType === AssetType.token ? getTokenValueParam(tokenData) : '1';
            const address = getTokenAddressParam(tokenData);
            const nickname = getAddressBookEntryOrAccountName(state, address) ?? '';
            const tokenAmountInHex = addHexPrefix(decimalToHex(tokenAmountInDec));
            await dispatch(actions.addNewDraft({
                ...draftTransactionInitialState,
                id: transactionId,
                fromAccount: account,
                gas: {
                    ...draftTransactionInitialState.gas,
                    gasLimit: transaction.txParams.gas,
                    gasPrice: transaction.txParams.gasPrice
                },
                userInputHexData: transaction.txParams.data,
                recipient: {
                    ...draftTransactionInitialState.recipient,
                    address,
                    nickname
                },
                amount: {
                    ...draftTransactionInitialState.amount,
                    value: tokenAmountInHex
                },
                history: [`sendFlow - user clicked edit on transaction with id ${ transactionId }`]
            }));
            await dispatch(updateSendAsset({
                type: assetType,
                details: {
                    address: transaction.txParams.to,
                    ...assetType === AssetType.NFT ? { tokenId: getTokenIdParam(tokenData) ?? getTokenValueParam(tokenData) } : {}
                }
            }, { initialAssetSet: true }));
        }
        await dispatch(initializeSendState());
    };
}
export function updateGasPrice(gasPrice) {
    return dispatch => {
        dispatch(addHistoryEntry(`sendFlow - user set legacy gasPrice to ${ gasPrice }`));
        dispatch(actions.updateGasFees({
            gasPrice,
            transactionType: TransactionEnvelopeType.legacy,
            manuallyEdited: true
        }));
    };
}
export function updateSendQuote(isComputingSendGasLimit = true, isRefreshingQuotes = false, isComputingSendGasLimitUrgent = true) {
    return async (dispatch, getState) => {
        const state = getState();
        const sendState = state[name];
        const draftTransaction = sendState.draftTransactions?.[sendState?.currentTransactionUUID];
        const isSwapAndSend = getIsDraftSwapAndSend(draftTransaction);
        const {quotes, swapQuotesError, isSwapQuoteLoading, swapQuotesLatestRequestTimestamp} = draftTransaction ?? {};
        if (isSwapAndSend) {
            const currentTime = Date.now();
            latestFetchTime = currentTime;
            dispatch(fetchSwapAndSendQuotes({
                requestTimestamp: currentTime,
                isRefreshingQuotes
            }));
        } else if (quotes || swapQuotesError || isSwapQuoteLoading || swapQuotesLatestRequestTimestamp) {
            dispatch({ type: CLEAR_SWAP_AND_SEND_STATE });
        }
        if (isComputingSendGasLimit) {
            if (isComputingSendGasLimitUrgent) {
                await dispatch(computeEstimatedGasLimit());
            } else {
                await debouncedComputeEstimatedGasLimit(dispatch);
            }
        }
    };
}
export function updateRecipient({address, nickname}) {
    return async (dispatch, getState) => {
        const state = getState();
        const nicknameFromAddressBookEntryOrAccountName = getAddressBookEntryOrAccountName(state, address) ?? '';
        await dispatch(actions.updateRecipient({
            address,
            nickname: nickname || nicknameFromAddressBookEntryOrAccountName
        }));
        await dispatch(updateSendQuote());
    };
}
export function updateRecipientUserInput(userInput) {
    return async (dispatch, getState) => {
        dispatch(actions.updateRecipientWarning('loading'));
        dispatch(actions.updateDraftTransactionStatus(SEND_STATUSES.INVALID));
        await dispatch(actions.updateRecipientUserInput(userInput));
        const state = getState();
        const sendingAddress = getSender(state);
        const chainId = getCurrentChainId(state);
        const tokens = getTokens(state);
        const useTokenDetection = getUseTokenDetection(state);
        const tokenMap = getTokenList(state);
        const tokenAddressList = Object.keys(tokenMap);
        const inputIsValidHexAddress = isValidHexAddress(userInput);
        let isProbablyAnAssetContract = false;
        if (inputIsValidHexAddress) {
            const smartContractAddress = await isSmartContractAddress(userInput);
            if (smartContractAddress) {
                dispatch(actions.updateRecipientType(RECIPIENT_TYPES.SMART_CONTRACT));
                const {symbol, decimals} = getTokenMetadata(userInput, tokenMap) || {};
                isProbablyAnAssetContract = symbol && decimals !== undefined;
                if (!isProbablyAnAssetContract) {
                    try {
                        const {standard} = await getTokenStandardAndDetails(userInput, sendingAddress);
                        isProbablyAnAssetContract = Boolean(standard);
                    } catch (e) {
                        console.log(e);
                    }
                }
            }
        }
        return new Promise(resolve => {
            debouncedValidateRecipientUserInput(dispatch, {
                userInput,
                chainId,
                tokens,
                useTokenDetection,
                tokenAddressList,
                isProbablyAnAssetContract
            }, resolve);
        });
    };
}
export function updateSendAmount(hexAmount, decimalAmount) {
    return async (dispatch, getState) => {
        const state = getState();
        dispatch(actions.updateSendAmount(hexAmount));
        if (state[name].amountMode === AMOUNT_MODES.MAX) {
            dispatch(actions.updateAmountMode(AMOUNT_MODES.INPUT));
        }
        await dispatch(updateSendQuote(true, false, false));
        if (decimalAmount === undefined) {
            return;
        }
        const {ticker} = getProviderConfig(state);
        const draftTransaction = state[name].draftTransactions[state[name].currentTransactionUUID];
        let logAmount = hexAmount;
        if (draftTransaction.sendAsset.type === AssetType.token) {
            logAmount = `${ decimalAmount } ${ draftTransaction.sendAsset.details?.symbol }`;
        } else {
            logAmount = `${ decimalAmount } ${ ticker || EtherDenomination.ETH }`;
        }
        debouncedAddHistoryEntry(dispatch, `sendFlow - user set amount to ${ logAmount }`);
    };
}
export function updateSendAsset({
    type,
    details: providedDetails,
    skipComputeEstimatedGasLimit,
    isReceived
}, {
    initialAssetSet = false
} = {}) {
    return async (dispatch, getState) => {
        const state = getState();
        const {ticker} = getProviderConfig(state);
        const draftTransaction = state[name].draftTransactions[state[name].currentTransactionUUID];
        const sendingAddress = getSender(state);
        const account = getTargetAccount(state, sendingAddress);
        if (type === AssetType.native) {
            const unapprovedTxs = getUnapprovedTransactions(state);
            const unapprovedTx = unapprovedTxs?.[draftTransaction.id];
            await dispatch(addHistoryEntry(`sendFlow - user set asset of type ${ AssetType.native } with symbol ${ ticker ?? EtherDenomination.ETH }`));
            await dispatch(actions.updateAsset({
                asset: {
                    type,
                    details: null,
                    balance: account.balance,
                    error: null
                },
                initialAssetSet,
                isReceived
            }));
            if (unapprovedTx?.type === TransactionType.tokenMethodTransferFrom || unapprovedTx?.type === TransactionType.tokenMethodTransfer || unapprovedTx?.type === TransactionType.tokenMethodSafeTransferFrom) {
                await dispatch(actions.updateUserInputHexData(''));
            }
        } else {
            await dispatch(showLoadingIndication());
            const STANDARD_TO_REQUIRED_PROPERTIES = {
                [TokenStandard.ERC20]: isReceived ? [
                    'address',
                    'symbol',
                    'decimals'
                ] : [
                    'address',
                    'symbol',
                    'decimals',
                    'balance'
                ],
                [TokenStandard.ERC721]: [
                    'address',
                    'symbol',
                    'tokenId'
                ],
                [TokenStandard.ERC1155]: [
                    'address',
                    'symbol',
                    'tokenId'
                ]
            };
            let missingProperty = STANDARD_TO_REQUIRED_PROPERTIES[providedDetails.standard]?.find(property => {
                if (providedDetails.collection && property === 'symbol') {
                    return providedDetails.collection[property] === undefined;
                }
                return providedDetails[property] === undefined;
            });
            let details;
            if (missingProperty === 'balance') {
                const selectedNetworkClientId = getSelectedNetworkClientId(state);
                const sender = getSender(state);
                const balance = await getBalancesInSingleCall(sender, [providedDetails.address], selectedNetworkClientId).catch(() => ({}));
                const hexBalance = balance[providedDetails.address]?.hex;
                providedDetails.balance = hexBalance ? addHexPrefix(hexBalance) : undefined;
                missingProperty = undefined;
            }
            if (providedDetails.standard && !missingProperty) {
                details = { ...providedDetails };
            } else {
                details = {
                    ...providedDetails,
                    ...await getTokenStandardAndDetails(providedDetails.address, sendingAddress, providedDetails.tokenId).catch(() => {
                        dispatch(hideLoadingIndication());
                    })
                };
            }
            await dispatch(hideLoadingIndication());
            const asset = {
                type,
                details,
                error: null
            };
            if (details.standard === TokenStandard.ERC20) {
                asset.balance = details.balance && details.decimals !== undefined ? addHexPrefix(calcTokenAmount(details.balance, details.decimals).toString(16)) : undefined;
                await dispatch(addHistoryEntry(`sendFlow - user set asset to ERC20 token with symbol ${ details.symbol } and address ${ details.address }`));
            } else if (details.standard === TokenStandard.ERC1155 || details.standard === TokenStandard.ERC721) {
                if (type === AssetType.token) {
                    dispatch(showModal({
                        name: 'CONVERT_TOKEN_TO_NFT',
                        tokenAddress: details.address
                    }));
                    asset.error = INVALID_ASSET_TYPE;
                    throw new Error(INVALID_ASSET_TYPE);
                } else {
                    let isCurrentOwner = true;
                    try {
                        isCurrentOwner = await isNftOwner(sendingAddress, details.address, details.tokenId);
                    } catch (err) {
                        const message = getErrorMessage(err);
                        if (message.includes('Unable to verify ownership.')) {
                        } else {
                            dispatch(displayWarning(err));
                        }
                    }
                    if (isCurrentOwner) {
                        asset.error = null;
                        asset.balance = details.balance ? addHexPrefix(details.balance) : '0x1';
                    } else {
                        throw new Error('Send slice initialized as NFT send with an NFT not currently owned by the select account');
                    }
                    await dispatch(addHistoryEntry(`sendFlow - user set asset to NFT with tokenId ${ details.tokenId } and address ${ details.address }`));
                }
            }
            await dispatch(actions.updateAsset({
                asset,
                initialAssetSet,
                isReceived
            }));
        }
        await dispatch(updateSendQuote(initialAssetSet === false && !skipComputeEstimatedGasLimit));
    };
}
export function updateSendHexData(hexData) {
    return async (dispatch, getState) => {
        await dispatch(addHistoryEntry(`sendFlow - user added custom hexData ${ hexData }`));
        await dispatch(actions.updateUserInputHexData(hexData));
        const state = getState();
        const draftTransaction = state[name].draftTransactions[state[name].currentTransactionUUID];
        await dispatch(updateSendQuote(draftTransaction.sendAsset.type === AssetType.native));
    };
}
export function useContactListForRecipientSearch() {
    return dispatch => {
        dispatch(addHistoryEntry(`sendFlow - user selected back to all on recipient screen`));
        dispatch(updateRecipientSearchMode(RECIPIENT_SEARCH_MODES.CONTACT_LIST));
    };
}
export function useMyAccountsForRecipientSearch() {
    return dispatch => {
        dispatch(addHistoryEntry(`sendFlow - user selected transfer to my accounts on recipient screen`));
        dispatch(updateRecipientSearchMode(RECIPIENT_SEARCH_MODES.MY_ACCOUNTS));
    };
}
export function resetRecipientInput() {
    return async (dispatch, getState) => {
        const state = getState();
        const chainId = getCurrentChainId(state);
        showLoadingIndication();
        dispatch(addHistoryEntry(`sendFlow - user cleared recipient input`));
        dispatch(resetDomainResolution());
        dispatch(updateRecipientUserInput(''));
        await dispatch(updateRecipient({
            address: '',
            nickname: ''
        }));
        dispatch(validateRecipientUserInput({ chainId }));
        hideLoadingIndication();
    };
}
export function resetSendState() {
    return async (dispatch, getState) => {
        const state = getState();
        dispatch(actions.resetSendState());
        if (state[name].gasEstimatePollToken) {
            await gasFeeStopPollingByPollingToken(state[name].gasEstimatePollToken);
            removePollingTokenFromAppState(state[name].gasEstimatePollToken);
        }
    };
}
export function signTransaction(history) {
    return async (dispatch, getState) => {
        const state = getState();
        const {stage, eip1559support, amountMode} = state[name];
        const draftTransaction = state[name].draftTransactions[state[name].currentTransactionUUID];
        let txParams;
        const isSwapAndSend = getIsDraftSwapAndSend(draftTransaction);
        const quotesAsArray = draftTransaction.quotes;
        const bestQuote = quotesAsArray ? calculateBestQuote(quotesAsArray) : undefined;
        if (isSwapAndSend) {
            txParams = { ...bestQuote.trade };
        } else {
            txParams = generateTransactionParams(state[name]);
        }
        const {amount, sendAsset, receiveAsset, recipient} = draftTransaction;
        const prevSwapAndSendData = {
            amount: { ...amount },
            sendAsset: { ...sendAsset },
            receiveAsset: { ...receiveAsset },
            recipient: { ...recipient },
            amountMode: state[name].amountMode
        };
        await dispatch(actions.setPrevSwapAndSend(prevSwapAndSendData));
        if (stage === SEND_STAGES.EDIT && !isSwapAndSend) {
            const unapprovedTxs = getUnapprovedTransactions(state);
            const unapprovedTx = cloneDeep(unapprovedTxs[draftTransaction.id]);
            const eip1559OnlyTxParamsToUpdate = {
                data: txParams.data,
                from: txParams.from,
                to: txParams.to,
                value: txParams.value,
                gas: unapprovedTx?.userEditedGasLimit ? unapprovedTx.txParams.gas : txParams.gas
            };
            unapprovedTx.originalGasEstimate = eip1559OnlyTxParamsToUpdate.gas;
            const editingTx = {
                ...unapprovedTx,
                txParams: Object.assign(unapprovedTx.txParams, eip1559support ? eip1559OnlyTxParamsToUpdate : txParams)
            };
            await dispatch(addHistoryEntry(`sendFlow - user clicked next and transaction should be updated in controller`));
            await dispatch(updateTransactionSendFlowHistory(draftTransaction.id, unapprovedTx.sendFlowHistory?.length || 0, draftTransaction.history));
            await dispatch(updateEditableParams(draftTransaction.id, editingTx.txParams));
            await dispatch(updateTransactionGasFees(draftTransaction.id, editingTx.txParams));
            history.push(CONFIRM_TRANSACTION_ROUTE);
        } else {
            let transactionType = draftTransaction.recipient.type === RECIPIENT_TYPES.SMART_CONTRACT ? TransactionType.contractInteraction : TransactionType.simpleSend;
            if (draftTransaction.sendAsset.type !== AssetType.native) {
                if (draftTransaction.sendAsset.type === AssetType.NFT) {
                    if (draftTransaction.sendAsset.details.standard === TokenStandard.ERC721) {
                        transactionType = TransactionType.tokenMethodTransferFrom;
                    } else {
                        transactionType = TransactionType.tokenMethodSafeTransferFrom;
                    }
                } else {
                    transactionType = TransactionType.tokenMethodTransfer;
                }
            }
            await dispatch(addHistoryEntry(`sendFlow - user clicked next and transaction should be added to controller`));
            let transactionId;
            if (isSwapAndSend) {
                if (stage === SEND_STAGES.EDIT) {
                    const unapprovedTxs = getUnapprovedTransactions(state);
                    const unapprovedSendTx = unapprovedTxs[draftTransaction.id];
                    if (unapprovedSendTx) {
                        await dispatch(rejectPendingApproval(unapprovedSendTx.id, providerErrors.userRejectedRequest().serialize()));
                    }
                }
                const chainId = getCurrentChainId(state);
                const NATIVE_CURRENCY_DECIMALS = SWAPS_CHAINID_DEFAULT_TOKEN_MAP[chainId].decimals;
                const sourceTokenSymbol = draftTransaction.sendAsset.details?.symbol || getNativeCurrency(state);
                const destinationTokenSymbol = draftTransaction.receiveAsset.details?.symbol || getNativeCurrency(state);
                const destinationTokenDecimals = draftTransaction.receiveAsset.details?.decimals || NATIVE_CURRENCY_DECIMALS;
                const destinationTokenAddress = draftTransaction.receiveAsset.details?.address || SWAPS_CHAINID_DEFAULT_TOKEN_MAP[chainId].address;
                const sourceTokenDecimals = draftTransaction.sendAsset.details?.decimals || NATIVE_CURRENCY_DECIMALS;
                const swapTokenValue = new Numeric(amount?.value || '0x0', 16).toBase(10).shiftedBy(sourceTokenDecimals).toString();
                const swapAndSendRecipient = draftTransaction.recipient.address;
                const sourceTokenAddress = draftTransaction.sendAsset.details?.address || SWAPS_CHAINID_DEFAULT_TOKEN_MAP[chainId].address;
                const sourceTokenAmount = bestQuote?.sourceAmount;
                const destinationTokenAmount = bestQuote?.destinationAmount;
                const meta = {
                    swapAndSendRecipient,
                    type: TransactionType.swapAndSend,
                    sourceTokenSymbol,
                    destinationTokenSymbol,
                    destinationTokenDecimals,
                    destinationTokenAddress,
                    swapTokenValue,
                    approvalTxId: undefined,
                    destinationTokenAmount,
                    sourceTokenAddress,
                    sourceTokenAmount,
                    sourceTokenDecimals
                };
                if (bestQuote?.approvalNeeded) {
                    const {id} = await addTransactionAndWaitForPublish({
                        ...bestQuote.approvalNeeded,
                        amount: '0x0'
                    }, {
                        requireApproval: false,
                        type: TransactionType.swapApproval,
                        swaps: {
                            hasApproveTx: true,
                            meta: {
                                type: TransactionType.swapApproval,
                                sourceTokenSymbol
                            }
                        }
                    });
                    meta.approvalTxId = id;
                }
                const {id: swapAndSendTxId} = await addTransactionAndWaitForPublish(txParams, {
                    requireApproval: false,
                    sendFlowHistory: draftTransaction.history,
                    type: TransactionType.swapAndSend,
                    swaps: {
                        hasApproveTx: Boolean(bestQuote?.approvalNeeded),
                        meta
                    }
                });
                transactionId = swapAndSendTxId;
                await dispatch(setDefaultHomeActiveTabName('activity'));
                history.push(DEFAULT_ROUTE);
            } else {
                const {id: basicSendTxId} = await dispatch(addTransactionAndRouteToConfirmationPage(txParams, {
                    sendFlowHistory: draftTransaction.history,
                    type: transactionType
                }));
                transactionId = basicSendTxId;
                history.push(CONFIRM_TRANSACTION_ROUTE);
            }
            await dispatch(setMaxValueMode(transactionId, amountMode === AMOUNT_MODES.MAX && draftTransaction.sendAsset.type === AssetType.native));
        }
        await dispatch(actions.setPrevSwapAndSend(prevSwapAndSendData));
    };
}
export function toggleSendMaxMode() {
    return async (dispatch, getState) => {
        const state = getState();
        if (state[name].amountMode === AMOUNT_MODES.MAX) {
            await dispatch(actions.updateAmountMode(AMOUNT_MODES.INPUT));
            await dispatch(actions.updateSendAmount('0x0'));
            await dispatch(addHistoryEntry(`sendFlow - user toggled max mode off`));
        } else {
            await dispatch(actions.updateAmountMode(AMOUNT_MODES.MAX));
            await dispatch(actions.updateAmountToMax());
            await dispatch(addHistoryEntry(`sendFlow - user toggled max mode on`));
        }
        await dispatch(updateSendQuote());
    };
}
export function startNewDraftTransaction(asset) {
    return async dispatch => {
        await dispatch(actions.clearPreviousDrafts());
        await dispatch(actions.addNewDraft({
            ...draftTransactionInitialState,
            history: [`sendFlow - User started new draft transaction`]
        }));
        await dispatch(updateSendAsset({
            type: asset.type ?? AssetType.native,
            details: asset.details,
            skipComputeEstimatedGasLimit: true
        }));
        await dispatch(initializeSendState());
    };
}
export function getCurrentTransactionUUID(state) {
    return state[name].currentTransactionUUID;
}
export function getCurrentDraftTransaction(state) {
    return state[name].draftTransactions[getCurrentTransactionUUID(state)] ?? {};
}
export const getBestQuote = createSelector(getCurrentDraftTransaction, ({quotes, swapQuotesError}) => {
    const quotesAsArray = quotes;
    if (swapQuotesError || !quotesAsArray?.length) {
        return undefined;
    }
    const bestQuote = calculateBestQuote(quotesAsArray);
    return bestQuote;
});
export function getSendLayer1GasFee(state) {
    return state[name].gasTotalForLayer1;
}
export const getIsNativeSendPossible = createSelector(getCurrentDraftTransaction, getSendLayer1GasFee, ({
    gas: {gasTotal: baseGasTotal},
    sendAsset
}, gasTotalForLayer1) => {
    if (sendAsset.type !== AssetType.native) {
        return true;
    }
    const nativeBalance = sendAsset.balance;
    const gasTotal = new Numeric(baseGasTotal || '0x0', 16).add(new Numeric(gasTotalForLayer1 ?? '0x0', 16));
    return gasTotal.lessThan(nativeBalance, 16);
});
export function getDraftTransactionExists(state) {
    const draftTransaction = getCurrentDraftTransaction(state);
    if (Object.keys(draftTransaction).length === 0) {
        return false;
    }
    return true;
}
export function getGasLimit(state) {
    return getCurrentDraftTransaction(state).gas?.gasLimit;
}
export function getGasPrice(state) {
    return getCurrentDraftTransaction(state).gas?.gasPrice;
}
export function getGasTotal(state) {
    return getCurrentDraftTransaction(state).gas?.gasTotal;
}
export function gasFeeIsInError(state) {
    return Boolean(getCurrentDraftTransaction(state).gas?.error);
}
export function getMinimumGasLimitForSend(state) {
    return state[name].gasLimitMinimum;
}
export function getGasInputMode(state) {
    const isMainnet = getIsMainnet(state);
    const gasEstimateType = getGasEstimateType(state);
    const showAdvancedGasFields = getAdvancedInlineGasShown(state);
    if (state[name].gasIsSetInModal) {
        return GAS_INPUT_MODES.CUSTOM;
    }
    if (!isMainnet && !process.env.IN_TEST || showAdvancedGasFields) {
        return GAS_INPUT_MODES.INLINE;
    }
    if ((isMainnet || process.env.IN_TEST) && gasEstimateType === GasEstimateTypes.ethGasPrice) {
        return GAS_INPUT_MODES.INLINE;
    }
    return GAS_INPUT_MODES.BASIC;
}
export function getSendAsset(state) {
    return getCurrentDraftTransaction(state).sendAsset;
}
export function getSendAssetAddress(state) {
    return getSendAsset(state)?.details?.address;
}
export function getIsAssetSendable(state) {
    if (getSendAsset(state)?.type === AssetType.native) {
        return true;
    }
    return getSendAsset(state)?.details?.isERC721 === false;
}
export function getAssetError(state) {
    return getSendAsset(state).error;
}
export function getSendAmount(state) {
    return getCurrentDraftTransaction(state).amount?.value;
}
export function getIsBalanceInsufficient(state) {
    return getCurrentDraftTransaction(state).gas?.error === INSUFFICIENT_FUNDS_ERROR;
}
export function getSendMaxModeState(state) {
    return state[name].amountMode === AMOUNT_MODES.MAX;
}
export function getSendHexData(state) {
    return getCurrentDraftTransaction(state).userInputHexData;
}
export function getDraftTransactionID(state) {
    return getCurrentDraftTransaction(state).id;
}
export function sendAmountIsInError(state) {
    return Boolean(getCurrentDraftTransaction(state).amount?.error);
}
export function getSender(state) {
    const sendState = state[name];
    const draftTransaction = sendState.draftTransactions[sendState.currentTransactionUUID];
    return draftTransaction?.fromAccount?.address ?? sendState.selectedAccount.address ?? getSelectedInternalAccount(state)?.address;
}
export function getRecipient(state) {
    const draft = getCurrentDraftTransaction(state);
    if (!draft.recipient) {
        return {
            address: '',
            nickname: '',
            error: null,
            warning: null
        };
    }
    const checksummedAddress = toChecksumHexAddress(draft.recipient.address);
    if (state.metamask.ensResolutionsByAddress) {
        return {
            ...draft.recipient,
            nickname: draft.recipient.nickname || getEnsResolutionByAddress(state, checksummedAddress)
        };
    }
    return draft.recipient;
}
export function getSendTo(state) {
    return getRecipient(state)?.address;
}
export function getIsUsingMyAccountForRecipientSearch(state) {
    return state[name].recipientMode === RECIPIENT_SEARCH_MODES.MY_ACCOUNTS;
}
export function getRecipientUserInput(state) {
    return state[name].recipientInput;
}
export function getRecipientWarningAcknowledgement(state) {
    return getCurrentDraftTransaction(state).recipient?.recipientWarningAcknowledged ?? false;
}
export function getSendErrors(state) {
    return {
        gasFee: getCurrentDraftTransaction(state).gas?.error,
        amount: getCurrentDraftTransaction(state).amount?.error
    };
}
export function isSendStateInitialized(state) {
    return state[name].stage !== SEND_STAGES.INACTIVE;
}
export function isSendFormInvalid(state) {
    const draftTransaction = getCurrentDraftTransaction(state);
    if (!draftTransaction) {
        return true;
    }
    return draftTransaction.status === SEND_STATUSES.INVALID;
}
export function getSendStage(state) {
    return state[name].stage;
}
export function hasSendLayer1GasFee(state) {
    return state[name].gasTotalForLayer1 !== null;
}
export function getSwapsBlockedTokens(state) {
    return state[name].swapsBlockedTokens;
}
export const getIsSwapAndSendDisabledForNetwork = createSelector(state => getCurrentChainId(state), state => state[name]?.disabledSwapAndSendNetworks ?? [], (chainId, disabledSwapAndSendNetworks) => {
    return disabledSwapAndSendNetworks.includes(chainId);
});
export const getSendAnalyticProperties = createSelector(state => getProviderConfig(state), getCurrentDraftTransaction, getBestQuote, ({
    chainId,
    ticker: nativeCurrencySymbol
}, draftTransaction, bestQuote) => {
    try {
        const NATIVE_CURRENCY_DECIMALS = SWAPS_CHAINID_DEFAULT_TOKEN_MAP[chainId].decimals;
        const NATIVE_CURRENCY_ADDRESS = SWAPS_CHAINID_DEFAULT_TOKEN_MAP[chainId].address;
        const isSwapAndSend = getIsDraftSwapAndSend(draftTransaction);
        const {quotes, amount, sendAsset, receiveAsset, swapQuotesError, timeToFetchQuotes} = draftTransaction;
        const sourceTokenSymbol = draftTransaction?.sendAsset?.details?.symbol || nativeCurrencySymbol;
        const destinationTokenSymbol = draftTransaction?.receiveAsset?.details?.symbol || nativeCurrencySymbol;
        const destinationTokenDecimals = draftTransaction?.receiveAsset?.details?.decimals || NATIVE_CURRENCY_DECIMALS;
        const sourceTokenDecimals = draftTransaction?.sendAsset?.details?.decimals || NATIVE_CURRENCY_DECIMALS;
        const userInputTokenAmount = new Numeric(amount?.value || '0x0', 16).toBase(10).shiftedBy(sourceTokenDecimals).toString();
        const sourceTokenAmount = bestQuote?.sourceAmount;
        const destinationTokenAmount = bestQuote?.destinationAmount;
        const destinationTokenAddress = draftTransaction?.receiveAsset?.details?.address || NATIVE_CURRENCY_ADDRESS;
        const sourceTokenAddress = draftTransaction?.sendAsset?.details?.address || NATIVE_CURRENCY_ADDRESS;
        return {
            is_swap_and_send: isSwapAndSend,
            chain_id: chainId,
            token_amount_source: sourceTokenAmount && sourceTokenDecimals ? calcTokenAmount(sourceTokenAmount, sourceTokenDecimals).toString() : userInputTokenAmount,
            token_amount_dest_estimate: destinationTokenAmount && destinationTokenDecimals ? calcTokenAmount(destinationTokenAmount, destinationTokenDecimals).toString() : undefined,
            token_symbol_source: sourceTokenSymbol,
            token_symbol_destination: destinationTokenSymbol,
            token_address_source: sourceTokenAddress,
            token_address_destination: destinationTokenAddress,
            results_count: quotes?.length,
            quotes_load_time_ms: timeToFetchQuotes,
            aggregator_list: quotes?.map(({aggregator, error}) => `${ aggregator } (${ error || 'no error' })`),
            aggregator_recommended: bestQuote?.aggregator,
            errors: [
                amount?.error,
                sendAsset?.error,
                receiveAsset?.error,
                swapQuotesError
            ].filter(Boolean)
        };
    } catch (error) {
        return { analyticsError: error };
    }
});