import { useEffect, useRef, useCallback } from 'react';
import { execApi } from './api';
import type { RunJob, OutputLine } from '../types';

interface Options {
  onResult:  (lines: OutputLine[], stats: { time?: number; exit?: number }) => void;
  onError:   (msg: string) => void;
  onRunning: (v: boolean) => void;
}

interface Return {
  startPolling: (jobId: string) => void;
  cancelPolling: () => void;  // called by socket result handler to stop the race
}

const POLL_INTERVAL_MS = 900;
const MAX_POLLS        = 67; // ~60 s

export function useJobPoller({ onResult, onError, onRunning }: Options): Return {
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const countRef  = useRef(0);
  const cancelledRef = useRef(false);

  const cancelPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    cancelledRef.current = true;
    countRef.current     = 0;
  }, []);

  useEffect(() => () => cancelPolling(), [cancelPolling]);

  const startPolling = useCallback((jobId: string) => {
    cancelPolling();
    cancelledRef.current = false;
    countRef.current     = 0;
    onRunning(true);

    timerRef.current = setInterval(async () => {
      if (cancelledRef.current) return;
      countRef.current += 1;

      if (countRef.current > MAX_POLLS) {
        cancelPolling();
        onRunning(false);
        onError('Job timed out after 60 seconds.');
        return;
      }

      try {
        const job: RunJob = await execApi.poll(jobId);

        if (job.status === 'completed' || job.status === 'failed') {
          cancelPolling();
          onRunning(false);

          const lines: OutputLine[] = [];
          job.stdout?.split('\n').filter(Boolean).forEach((l) => lines.push({ type: 'stdout', text: l }));
          job.stderr?.split('\n').filter(Boolean).forEach((l) => lines.push({ type: 'stderr', text: l }));
          if (!lines.length) lines.push({ type: 'system', text: '(no output)' });

          onResult(lines, { time: job.executionTimeMs, exit: job.exitCode });
        }
      } catch (err: any) {
        cancelPolling();
        onRunning(false);
        onError(err?.message ?? 'Failed to poll job.');
      }
    }, POLL_INTERVAL_MS);
  }, [cancelPolling, onResult, onError, onRunning]);

  return { startPolling, cancelPolling };
}