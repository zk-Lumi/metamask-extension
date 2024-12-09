import React from 'react';
import { Provider } from 'react-redux';
import { TransactionStatus, TransactionType } from '@metamask/transaction-controller';
import mockState from '../../../../../../test/data/mock-state.json';
import configureStore from '../../../../../store/store';
import { ConfirmContextProvider } from '../../../context/confirm';
import Nav from './nav';
import { getMockConfirmState } from '../../../../../../test/data/confirmations/helper';
const store = configureStore(getMockConfirmState({
    ApprovalController: {
        pendingApprovals: {
            testApprovalId: {
                id: 'testApprovalId',
                time: 1528133319641,
                origin: 'metamask',
                type: 'personal_sign',
                requestData: {
                    txId: 'testTransactionId',
                },
                requestState: {
                    test: 'value',
                },
            },
            testApprovalId2: {
                id: 'testApprovalId2',
                time: 1528133319641,
                origin: 'metamask',
                type: 'personal_sign',
                requestData: {
                    txId: 'testTransactionId',
                },
                requestState: {
                    test: 'value',
                },
            },
            testApprovalId3: {
                id: 'testApprovalId3',
                time: 1528133319649,
                origin: 'metamask',
                type: 'personal_sign',
                requestData: {
                    txId: 'testTransactionId',
                },
                requestState: {
                    test: 'value',
                },
            },
        }
    }
}));
const Story = {
    title: 'Components/App/Confirm/Nav',
    component: Nav,
    decorators: [(story: any) => <Provider>store, { store } >
            <ConfirmContextProvider>{ story(); } < /ConfirmContextProvider>
            < /Provider>,
    ]
};
export default Story;
export const DefaultStory = () => <Nav>/>;;
DefaultStory.storyName = 'Default';
