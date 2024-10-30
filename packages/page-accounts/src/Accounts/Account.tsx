// Copyright 2017-2024 @polkadot/app-accounts authors & contributors
// SPDX-License-Identifier: Apache-2.0

// This is for the use of `Ledger`
//
/* eslint-disable deprecation/deprecation */

import type { ApiPromise } from '@polkadot/api';
import type { SubmittableExtrinsic } from '@polkadot/api/types';
import type { DeriveDemocracyLock, DeriveStakingAccount } from '@polkadot/api-derive/types';
// import type { Ledger, LedgerGeneric } from '@polkadot/hw-ledger';
import type { ActionStatus } from '@polkadot/react-components/Status/types';
// import type { Option } from '@polkadot/types';
import type { ProxyDefinition } from '@polkadot/types/interfaces';
import type { KeyringAddress } from '@polkadot/ui-keyring/types';
import type { AccountBalance, Delegation } from '../types.js';

import React, { useCallback, useEffect, useMemo, useState } from 'react';

import useAccountLocks from '@polkadot/app-referenda/useAccountLocks';
import { AddressInfo, AddressSmall, Button, Forget, styled, TransferModal } from '@polkadot/react-components';
import { useAccountInfo, useApi, useBalancesAll, useBestNumber, useCall, useStakingInfo, useToggle } from '@polkadot/react-hooks';
import { keyring } from '@polkadot/ui-keyring';
// import { settings } from '@polkadot/ui-settings';
import { BN, BN_ZERO, isFunction } from '@polkadot/util';

import Backup from '../modals/Backup.js';
import ChangePass from '../modals/ChangePass.js';
import DelegateModal from '../modals/Delegate.js';
import Derive from '../modals/Derive.js';
import IdentityMain from '../modals/IdentityMain.js';
import IdentitySub from '../modals/IdentitySub.js';
import MultisigApprove from '../modals/MultisigApprove.js';
import ProxyOverview from '../modals/ProxyOverview.js';
import RecoverAccount from '../modals/RecoverAccount.js';
import RecoverSetup from '../modals/RecoverSetup.js';
import UndelegateModal from '../modals/Undelegate.js';
import { useTranslation } from '../translate.js';
// import { createMenuGroup } from '../util.js';
import useMultisigApprovals from './useMultisigApprovals.js';
import CopyToClipboard from 'react-copy-to-clipboard';
// import useProxies from './useProxies.js';

interface Props {
  account: KeyringAddress;
  className?: string;
  delegation?: Delegation;
  filter: string;
  isFavorite: boolean;
  proxy?: [ProxyDefinition[], BN];
  setBalance: (address: string, value: AccountBalance) => void;
  toggleFavorite: (address: string) => void;
}

interface DemocracyUnlockable {
  democracyUnlockTx: SubmittableExtrinsic<'promise'> | null;
  ids: BN[];
}

interface ReferendaUnlockable {
  referendaUnlockTx: SubmittableExtrinsic<'promise'> | null;
  ids: [classId: BN, refId: BN][];
}

const BAL_OPTS_DEFAULT = {
  available: true,
  bonded: true,
  locked: false,
  redeemable: false,
  reserved: false,
  total: true,
  unlocking: false,
  vested: false
};

// const BAL_OPTS_EXPANDED = {
//   available: true,
//   bonded: true,
//   locked: true,
//   nonce: true,
//   redeemable: true,
//   reserved: true,
//   total: false,
//   unlocking: true,
//   vested: true
// };

function calcVisible (filter: string, name: string, tags: string[]): boolean {
  if (filter.length === 0) {
    return true;
  }

  const _filter = filter.toLowerCase();

  return tags.reduce((result: boolean, tag: string): boolean => {
    return result || tag.toLowerCase().includes(_filter);
  }, name.toLowerCase().includes(_filter));
}

function calcUnbonding (stakingInfo?: DeriveStakingAccount) {
  if (!stakingInfo?.unlocking) {
    return BN_ZERO;
  }

  const filtered = stakingInfo.unlocking
    .filter(({ remainingEras, value }) => value.gt(BN_ZERO) && remainingEras.gt(BN_ZERO))
    .map((unlock) => unlock.value);
  const total = filtered.reduce((total, value) => total.iadd(value), new BN(0));

  return total;
}

function createClearDemocracyTx (api: ApiPromise, address: string, ids: BN[]): SubmittableExtrinsic<'promise'> | null {
  return api.tx.utility && ids.length
    ? api.tx.utility.batch(
      ids
        .map((id) => api.tx.democracy.removeVote(id))
        .concat(api.tx.democracy.unlock(address))
    )
    : null;
}

function createClearReferendaTx (api: ApiPromise, address: string, ids: [BN, BN][], palletReferenda = 'convictionVoting'): SubmittableExtrinsic<'promise'> | null {
  if (!api.tx.utility || !ids.length) {
    return null;
  }

  const inner = ids.map(([classId, refId]) => api.tx[palletReferenda].removeVote(classId, refId));

  ids
    .reduce((all: BN[], [classId]) => {
      if (!all.find((id) => id.eq(classId))) {
        all.push(classId);
      }

      return all;
    }, [])
    .forEach((classId): void => {
      inner.push(api.tx[palletReferenda].unlock(classId, address));
    });

  return api.tx.utility.batch(inner);
}

// async function showLedgerAddress (getLedger: () => LedgerGeneric | Ledger, meta: KeyringJson$Meta, ss58Prefix: number): Promise<void> {
//   const currApp = settings.get().ledgerApp;
//   const ledger = getLedger();

//   if (currApp === 'migration' || currApp === 'generic') {
//     await (ledger as LedgerGeneric).getAddress(ss58Prefix, true, meta.accountOffset || 0, meta.addressOffset || 0);
//   } else {
//     // This will always be the `chainSpecific` setting if the above condition is not met
//     await (ledger as Ledger).getAddress(true, meta.accountOffset || 0, meta.addressOffset || 0);
//   }
// }

// const transformRecovery = {
//   transform: (opt: Option<RecoveryConfig>) => opt.unwrapOr(null)
// };

function Account ({ account: { address, meta }, className = '', delegation, filter, proxy, setBalance }: Props): React.ReactElement<Props> | null {
  const { t } = useTranslation();
  // const [isExpanded, toggleIsExpanded] = useToggle(false);
  // const { queueExtrinsic } = useQueue();
  const { api } = useApi();
  // const { getLedger } = useLedger();
  const bestNumber = useBestNumber();
  const balancesAll = useBalancesAll(address);
  const stakingInfo = useStakingInfo(address);
  const democracyLocks = useCall<DeriveDemocracyLock[]>(api.derive.democracy?.locks, [address]);
  // const recoveryInfo = useCall<RecoveryConfig | null>(api.query.recovery?.recoverable, [address], transformRecovery);
  const multiInfos = useMultisigApprovals(address);
  // const proxyInfo = useProxies(address);
  const { flags: { isMultisig }, name: accName, tags } = useAccountInfo(address);
  const convictionLocks = useAccountLocks('referenda', 'convictionVoting', address);
  const [{ democracyUnlockTx }, setDemocracyUnlock] = useState<DemocracyUnlockable>({ democracyUnlockTx: null, ids: [] });
  const [{ referendaUnlockTx }, setReferandaUnlock] = useState<ReferendaUnlockable>({ ids: [], referendaUnlockTx: null });
  const [vestingVestTx, setVestingTx] = useState<SubmittableExtrinsic<'promise'> | null>(null);
  const [isBackupOpen, toggleBackup] = useToggle();
  const [isDeriveOpen, toggleDerive] = useToggle();
  const [isForgetOpen, toggleForget] = useToggle();
  const [isIdentityMainOpen, toggleIdentityMain] = useToggle();
  const [isIdentitySubOpen, toggleIdentitySub] = useToggle();
  const [isMultisigOpen, toggleMultisig] = useToggle();
  const [isProxyOverviewOpen, toggleProxyOverview] = useToggle();
  const [isPasswordOpen, togglePassword] = useToggle();
  const [isRecoverAccountOpen, toggleRecoverAccount] = useToggle();
  const [isRecoverSetupOpen, toggleRecoverSetup] = useToggle();
  const [isTransferOpen, toggleTransfer] = useToggle();
  const [isDelegateOpen, toggleDelegate] = useToggle();
  const [isUndelegateOpen, toggleUndelegate] = useToggle();

  const [isCopyShown, toggleIsCopyShown] = useToggle();
  const NOOP = () => undefined;

  console.log(democracyUnlockTx, referendaUnlockTx, vestingVestTx);
  
  useEffect((): void => {
    if (balancesAll) {
      setBalance(address, {
        // some chains don't have "active" in the Ledger
        bonded: stakingInfo?.stakingLedger.active?.unwrap() || BN_ZERO,
        locked: balancesAll.lockedBalance,
        redeemable: stakingInfo?.redeemable || BN_ZERO,
        total: balancesAll.freeBalance.add(balancesAll.reservedBalance),
        transferable: balancesAll.transferable || balancesAll.availableBalance,
        unbonding: calcUnbonding(stakingInfo)
      });

      api.tx.vesting?.vest && setVestingTx(() =>
        balancesAll.vestingLocked.isZero()
          ? null
          : api.tx.vesting.vest()
      );
    }
  }, [address, api, balancesAll, setBalance, stakingInfo]);

  useEffect((): void => {
    bestNumber && democracyLocks && setDemocracyUnlock(
      (prev): DemocracyUnlockable => {
        const ids = democracyLocks
          .filter(({ isFinished, unlockAt }) => isFinished && bestNumber.gt(unlockAt))
          .map(({ referendumId }) => referendumId);

        if (JSON.stringify(prev.ids) === JSON.stringify(ids)) {
          return prev;
        }

        return {
          democracyUnlockTx: createClearDemocracyTx(api, address, ids),
          ids
        };
      }
    );
  }, [address, api, bestNumber, democracyLocks]);

  useEffect((): void => {
    bestNumber && convictionLocks && setReferandaUnlock(
      (prev): ReferendaUnlockable => {
        const ids = convictionLocks
          .filter(({ endBlock }) => endBlock.gt(BN_ZERO) && bestNumber.gt(endBlock))
          .map(({ classId, refId }): [classId: BN, refId: BN] => [classId, refId]);

        if (JSON.stringify(prev.ids) === JSON.stringify(ids)) {
          return prev;
        }

        return {
          ids,
          referendaUnlockTx: createClearReferendaTx(api, address, ids)
        };
      }
    );
  }, [address, api, bestNumber, convictionLocks]);

  const isVisible = useMemo(
    () => calcVisible(filter, accName, tags),
    [accName, filter, tags]
  );

  const _onForget = useCallback(
    (): void => {
      if (!address) {
        return;
      }

      const status: Partial<ActionStatus> = {
        account: address,
        action: 'forget'
      };

      try {
        keyring.forgetAccount(address);
        status.status = 'success';
        status.message = t('account forgotten');
      } catch (error) {
        status.status = 'error';
        status.message = (error as Error).message;
      }
    },
    [address, t]
  );
  if (!isVisible) {
    return null;
  }

  return (
    <>
      <StyledTr className={`${className} isExpanded isFirst packedBottom`}>
        <td className='address all ui--SmallAddress-Copy-Balance'>
          <AddressSmall
            parentAddress={meta.parentAddress}
            value={address}
            withShortAddress
          />
          {isBackupOpen && (
            <Backup
              address={address}
              key='modal-backup-account'
              onClose={toggleBackup}
            />
          )}
          {isDelegateOpen && (
            <DelegateModal
              key='modal-delegate'
              onClose={toggleDelegate}
              previousAmount={delegation?.amount}
              previousConviction={delegation?.conviction}
              previousDelegatedAccount={delegation?.accountDelegated}
              previousDelegatingAccount={address}
            />
          )}
          {isDeriveOpen && (
            <Derive
              from={address}
              key='modal-derive-account'
              onClose={toggleDerive}
            />
          )}
          {isForgetOpen && (
            <Forget
              address={address}
              key='modal-forget-account'
              onClose={toggleForget}
              onForget={_onForget}
            />
          )}
          {isIdentityMainOpen && (
            <IdentityMain
              address={address}
              key='modal-identity-main'
              onClose={toggleIdentityMain}
            />
          )}
          {isIdentitySubOpen && (
            <IdentitySub
              address={address}
              key='modal-identity-sub'
              onClose={toggleIdentitySub}
            />
          )}
          {isPasswordOpen && (
            <ChangePass
              address={address}
              key='modal-change-pass'
              onClose={togglePassword}
            />
          )}
          {isTransferOpen && (
            <TransferModal
              key='modal-transfer'
              onClose={toggleTransfer}
              senderId={address}
            />
          )}
          {isProxyOverviewOpen && (
            <ProxyOverview
              key='modal-proxy-overview'
              onClose={toggleProxyOverview}
              previousProxy={proxy}
              proxiedAccount={address}
            />
          )}
          {isMultisig && isMultisigOpen && multiInfos && multiInfos.length !== 0 && (
            <MultisigApprove
              address={address}
              key='multisig-approve'
              onClose={toggleMultisig}
              ongoing={multiInfos}
              threshold={meta.threshold}
              who={meta.who}
            />
          )}
          {isRecoverAccountOpen && (
            <RecoverAccount
              address={address}
              key='recover-account'
              onClose={toggleRecoverAccount}
            />
          )}
          {isRecoverSetupOpen && (
            <RecoverSetup
              address={address}
              key='recover-setup'
              onClose={toggleRecoverSetup}
            />
          )}
          {isUndelegateOpen && (
            <UndelegateModal
              accountDelegating={address}
              key='modal-delegate'
              onClose={toggleUndelegate}
            />
          )}
        </td>
        <td className='actions button ui--Copy-Balance'>
          <CopyToClipboard
            text={address}
          >
            <span>
              <Button.Group>
                <Button
                  icon={isCopyShown ? 'check' : 'copy'}
                  label={isCopyShown ? t('Copied') : t('Copy')}
                  onClick={isCopyShown ? NOOP : toggleIsCopyShown }
                  onMouseLeave={isCopyShown ? toggleIsCopyShown : NOOP }
                />
              </Button.Group>
            </span>
          </CopyToClipboard>
          <AddressInfo
            address={address}
            balancesAll={balancesAll}
            withBalance={BAL_OPTS_DEFAULT}
            withLabel
          />
          <Button.Group>
            {(isFunction(api.tx.balances?.transferAllowDeath) || isFunction(api.tx.balances?.transfer)) && (
              <Button
                className='send-button'
                icon='paper-plane'
                label={t('Send')}
                onClick={toggleTransfer}
              />
            )}
            {/* <Popup
              isDisabled={!menuItems.length}
              value={
                <Menu>
                  {menuItems}
                </Menu>
              }
            /> */}
          </Button.Group>
        </td>
      </StyledTr>
    </>
  );
}

const StyledTr = styled.tr`
  .devBadge {
    opacity: var(--opacity-light);
  }
  border-radius: 1rem;
  padding: 1rem 3rem 0 3rem;
  display: flex;
  .ui--SmallAddress-Copy-Balance {
    display: flex;
    width: 65% !important;
  }
  .ui--Copy-Balance {
    display: flex;
    justify-content: space-between;
    width: 35%;
  }
  .ui--Balance {
    display: flex;
  }
  .ui--FormatBalance-value {
    font-size: var(--font-size-balance) !important;
  }
  @media only screen and (max-width: 1920px) {
    .ui--SmallAddress-Copy-Balance {
      width: 60% !important;
    }
    .ui--Copy-Balance {
      width: 40%;
    }
  }
  @media only screen and (max-width: 1440px) {
    .ui--SmallAddress-Copy-Balance {
      width: 40% !important;
      .shortAddress {
        display: block !important;
        width: 56%
      }
    }
    .ui--AddressSmall-info {
      column-gap: 1rem;
    }
    .ui--AccountName {
      text-overflow: ellipsis;
    }
    .ui--Copy-Balance {
      width: 40%;
    }
    .withPadding {
      padding-right: 0;
    }
  }
`;

export default React.memo(Account);
