import { useCallback, useMemo } from 'react';
import {
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import type { Abi, Address, Hex } from 'viem';
import { DATA_SUFFIX } from '../config/wagmi.js';

type TxStatus = 'idle' | 'pending' | 'confirming' | 'success' | 'error';

export interface TxError {
  shortMessage?: string;
  message: string;
  code?: number;
}

/**
 * useBuilderCodeTransaction — sends a contract write using wagmi's native
 * useWriteContract with an ERC-8021 builder code dataSuffix appended to
 * every call. Receipt polling and status tracking are handled via
 * useWaitForTransactionReceipt.
 *
 * This replaces the previous raw eth_sendTransaction workaround that was
 * needed before wagmi/viem fully supported Base Account smart wallets with
 * builder code suffixes.
 */
export function useBuilderCodeTransaction({
  address,
  abi,
  chainId,
}: {
  address: Address;
  abi: Abi;
  chainId: number;
}) {
  const {
    writeContract,
    data: hash,
    isPending,
    error: writeError,
    reset,
  } = useWriteContract();

  const {
    isLoading: isConfirming,
    isSuccess,
    isError: receiptIsError,
    error: receiptError,
  } = useWaitForTransactionReceipt({
    hash,
    chainId,
  });

  const status: TxStatus = useMemo(() => {
    if (writeError || receiptIsError) return 'error';
    if (isPending) return 'pending';
    if (isConfirming && hash) return 'confirming';
    if (isSuccess) return 'success';
    return 'idle';
  }, [writeError, receiptIsError, isPending, isConfirming, isSuccess, hash]);

  const error: TxError | null = useMemo(() => {
    const err = writeError || receiptError;
    if (!err) return null;
    const message =
      (err as { shortMessage?: string }).shortMessage ||
      (err as { message?: string }).message ||
      'Transaction failed.';
    return {
      shortMessage: (err as { shortMessage?: string }).shortMessage,
      message,
      code: (err as { code?: number }).code,
    };
  }, [writeError, receiptError]);

  const send = useCallback(
    (
      functionName: string,
      args: unknown[] = [],
      options?: { value?: bigint },
    ) => {
      reset();
      writeContract({
        address,
        abi,
        functionName,
        args,
        chainId,
        value: options?.value ?? 0n,
        dataSuffix: DATA_SUFFIX,
      });
    },
    [writeContract, address, abi, chainId, reset],
  );

  return { send, status, hash, error };
}
