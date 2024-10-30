// Copyright 2017-2024 @polkadot/react-components authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react';

import AddressInfo from '../AddressInfo.js';
import { styled } from '../styled.js';

interface Props {
  address: string;
  className?: string;
}

// const WITH_BALANCE = { available: true, bonded: true, free: true, locked: true, reserved: true, total: true };
const WITH_BALANCE = { available: true, bonded: true, free: true, locked: true, reserved: true, total: true };

function Balances ({ address, className }: Props): React.ReactElement<Props> | null {

  return (
    <StyledSection className={className}>
      <AddressInfo
        address={address}
        className='balanceExpander'
        key={address}
        withBalance={WITH_BALANCE}
        withLabel
      />
    </StyledSection>
  );
}

const StyledSection = styled.section`
  .ui--AddressMenu-sectionHeader {
    padding: 20px;
  }
  .column:not(.column--expander) {
    flex: none !important;
    // column-gap: 4.2rem !important;
  }
  .balanceExpander {
    font-size: var(--font-size-h3);
    justify-content: flex-start;
    padding-left: 60px;
    .column {
      width: auto;
      max-width: 18.57rem;
      label {
        text-align: left;
        color: inherit;
      }

      .ui--Expander-content .ui--FormatBalance-value {
        font-size: var(--font-size-small);
      }
    }
  }
  margin-bottom: 0 !important;
`;

export default React.memo(Balances);
