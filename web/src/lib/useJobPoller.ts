import { useEffect, useRef, useCallback } from 'react';
import { execApi } from './api';
import type { RunJob, OutputLine } from '../types/index';

interface UseJobPollerOptions {
  onResult:  (lines: OutputLine[], stats: { time?: number; exit?: number }) => void;
  onError:   (msg: string) => void;
  onRunning: (v: boolean) => void;
}

interface UseJobPollerReturn {
  startPolling: (jobId: string) => void;
  stopPolling:  () => void;
}

const POLL_INTERVAL = 800;   // ms between polls
const MAX_POLLS     = 75;    // 75 × 800 ms ≈ 60 s timeout

export function useJobPoller({ onResult, onError, onRunning }: UseJobPollerOptions): UseJobPollerReturn {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countRef = useRef(0);

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    countRef.current = 0;
  }, []);

  // Cleanup on unmount
  useEffect(() => () => stopPolling(), [stopPolling]);

  const startPolling = useCallback((jobId: string) => {
    stopPolling();
    onRunning(true);
    countRef.current = 0;

    timerRef.current = setInterval(async () => {
      countRef.current += 1;

      // Hard timeout
      if (countRef.current > MAX_POLLS) {
        stopPolling();
        onRunning(false);
        onError('Job timed out after 60 seconds.');
        return;
      }

      try {
        const job: RunJob = await execApi.poll(jobId);

        if (job.status === 'completed' || job.status === 'failed') {
          stopPolling();
          onRunning(false);

          const lines: OutputLine[] = [];
          if (job.stdout) {
            job.stdout.split('\n').filter(Boolean).forEach((l) =>
              lines.push({ type: 'stdout', text: l }));
          }
          if (job.stderr) {
            job.stderr.split('\n').filter(Boolean).forEach((l) =>
              lines.push({ type: 'stderr', text: l }));
          }
          if (lines.length === 0) {
            lines.push({ type: 'system', text: '(no output)' });
          }

          onResult(lines, {
            time: job.executionTimeMs,
            exit: job.exitCode,
          });
        }
        // status === 'pending' | 'running' → keep polling
      } catch (err: any) {
        stopPolling();
        onRunning(false);
        onError(err?.message ?? 'Failed to poll job status.');
      }
    }, POLL_INTERVAL);
  }, [stopPolling, onResult, onError, onRunning]);

  return { startPolling, stopPolling };
}
