import React from 'react';

import { SignatureRequestType } from '../../../../../types/confirm';
import { isPermitSignatureRequest } from '../../../../../utils';
import { useConfirmContext } from '../../../../../context/confirm';
import { DefaultSimulation } from './default-simulation';
import { DecodedSimulation } from './decoded-simulation';

const TypedSignV4Simulation: React.FC<object> = () => {
  const { currentConfirmation } = useConfirmContext<SignatureRequestType>();
  const { decodingLoading, decodingData } = currentConfirmation;
  const isPermit = isPermitSignatureRequest(currentConfirmation);

  if (
    decodingData?.error ||
    (decodingData?.stateChanges === undefined && decodingLoading !== true)
  ) {
    if (isPermit) {
      return <DefaultSimulation />;
    }
    // fall back to be implemented for non-permit types
    return null;
  }

  return <DecodedSimulation />;
};

export default TypedSignV4Simulation;
