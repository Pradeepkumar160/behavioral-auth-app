/**
 * Behavioral Biometrics Collector Hook
 * Collects keystroke dynamics and mouse dynamics locally,
 * then submits batches to the server every 10 seconds.
 * 
 * Privacy: No raw keystrokes or absolute positions are stored.
 * Only timing metrics (hold time, flight time) and derived mouse metrics.
 */
import { useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";

export interface CollectorState {
  typingCount: number;
  mouseCount: number;
}

interface TypingRaw {
  key: string;
  pressTime: number;
  releaseTime?: number;
}

interface MouseRaw {
  x: number;
  y: number;
  t: number;
}

export function useBehaviorCollector(
  sessionId: string | null,
  enabled = true,
  onRiskUpdate?: (result: {
    anomalyScore: number;
    riskLevel: string;
    riskAction: string;
    requiresReauth: boolean;
    isBlocked: boolean;
    trainingProgress: number;
  }) => void
) {
  const typingBuffer = useRef<Array<{ holdTime: number; flightTime: number }>>([]);
  const mouseBuffer = useRef<Array<{ speed: number; distance: number; acceleration: number }>>([]);
  const keyMap = useRef<Map<string, TypingRaw>>(new Map());
  const lastKey = useRef<TypingRaw | null>(null);
  const mouseHistory = useRef<MouseRaw[]>([]);

  const submitMutation = trpc.behavior.submitBatch.useMutation({
    onSuccess: (data) => {
      onRiskUpdate?.(data);
    },
  });

  const flush = useCallback(() => {
    if (!sessionId) return;
    const typing = [...typingBuffer.current];
    const mouse = [...mouseBuffer.current];
    typingBuffer.current = [];
    mouseBuffer.current = [];
    if (typing.length === 0 && mouse.length === 0) return;
    submitMutation.mutate({ sessionId, typingEvents: typing, mouseEvents: mouse });
  }, [sessionId, submitMutation]);

  useEffect(() => {
    if (!enabled || !sessionId) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const key = e.key;
      keyMap.current.set(key, { key, pressTime: performance.now() });
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const key = e.key;
      const pressed = keyMap.current.get(key);
      if (!pressed) return;
      const releaseTime = performance.now();
      const holdTime = releaseTime - pressed.pressTime;

      let flightTime = 0;
      if (lastKey.current?.releaseTime !== undefined) {
        flightTime = pressed.pressTime - lastKey.current.releaseTime;
      }

      pressed.releaseTime = releaseTime;
      lastKey.current = pressed;
      keyMap.current.delete(key);

      if (holdTime > 0 && holdTime < 2000 && flightTime >= 0 && flightTime < 2000) {
        typingBuffer.current.push({ holdTime, flightTime });
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      const now = performance.now();
      const history = mouseHistory.current;

      history.push({ x: e.clientX, y: e.clientY, t: now });
      if (history.length > 3) history.shift();

      if (history.length >= 2) {
        const prev = history[history.length - 2];
        const curr = history[history.length - 1];
        const dx = curr.x - prev.x;
        const dy = curr.y - prev.y;
        const dt = curr.t - prev.t;
        if (dt < 1) return;

        const distance = Math.sqrt(dx * dx + dy * dy);
        const speed = distance / dt; // px/ms

        let acceleration = 0;
        if (history.length >= 3) {
          const prev2 = history[history.length - 3];
          const dx2 = prev.x - prev2.x;
          const dy2 = prev.y - prev2.y;
          const dt2 = prev.t - prev2.t;
          if (dt2 > 1) {
            const speed2 = Math.sqrt(dx2 * dx2 + dy2 * dy2) / dt2;
            acceleration = (speed - speed2) / dt;
          }
        }

        if (speed >= 0 && speed < 10 && distance > 2) {
          mouseBuffer.current.push({ speed, distance, acceleration });
        }
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    document.addEventListener("mousemove", onMouseMove);

    const interval = setInterval(flush, 10_000);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("mousemove", onMouseMove);
      clearInterval(interval);
    };
  }, [enabled, sessionId, flush]);

  return {
    typingCount: typingBuffer.current.length,
    mouseCount: mouseBuffer.current.length,
    flushNow: flush,
  };
}
