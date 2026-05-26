/**
 * Behavioral Biometrics Engine
 * Pure TypeScript implementation of:
 * - Feature extraction for keystroke & mouse dynamics
 * - Isolation Forest–style anomaly detection (statistical z-score based)
 * - Risk scoring engine
 */

export interface TypingEvent {
  holdTime: number;   // ms key was held
  flightTime: number; // ms between key releases
}

export interface MouseEvent {
  speed: number;      // px/ms
  distance: number;   // px
  acceleration: number; // px/ms²
}

export interface BehavioralFeatures {
  typingEvents: TypingEvent[];
  mouseEvents: MouseEvent[];
}

export interface TypingProfile {
  meanHoldTime: number;
  stdHoldTime: number;
  meanFlightTime: number;
  stdFlightTime: number;
  sampleCount: number;
}

export interface MouseProfile {
  meanSpeed: number;
  stdSpeed: number;
  meanDistance: number;
  stdDistance: number;
  sampleCount: number;
}

export interface BehavioralProfile {
  typingProfile: TypingProfile | null;
  mouseProfile: MouseProfile | null;
  trainingDataCount: number;
}

export interface AnomalyResult {
  anomalyScore: number;   // 0-1, higher = more anomalous
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  riskAction: 'Allow' | 'Monitor' | 'Re-auth challenge' | 'Block';
  details: {
    typingAnomaly: number;
    mouseAnomaly: number;
    isNewProfile: boolean;
  };
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function std(arr: number[], m?: number): number {
  if (arr.length < 2) return 0;
  const mu = m ?? mean(arr);
  const variance = arr.reduce((acc, v) => acc + Math.pow(v - mu, 2), 0) / arr.length;
  return Math.sqrt(variance);
}

export function buildTypingProfile(events: TypingEvent[]): TypingProfile {
  const holdTimes = events.map(e => e.holdTime).filter(v => v > 0 && v < 2000);
  const flightTimes = events.map(e => e.flightTime).filter(v => v > 0 && v < 2000);

  return {
    meanHoldTime: mean(holdTimes),
    stdHoldTime: std(holdTimes),
    meanFlightTime: mean(flightTimes),
    stdFlightTime: std(flightTimes),
    sampleCount: events.length,
  };
}

export function buildMouseProfile(events: MouseEvent[]): MouseProfile {
  const speeds = events.map(e => e.speed).filter(v => v >= 0 && v < 10);
  const distances = events.map(e => e.distance).filter(v => v > 0 && v < 2000);

  return {
    meanSpeed: mean(speeds),
    stdSpeed: std(speeds),
    meanDistance: mean(distances),
    stdDistance: std(distances),
    sampleCount: events.length,
  };
}

function zScoreAnomaly(value: number, mu: number, sigma: number): number {
  if (sigma < 0.001) return 0;
  const z = Math.abs((value - mu) / sigma);
  // Normalize: z=0 → 0, z=3 → ~0.95
  return Math.min(1, 1 - Math.exp(-z * z / 4));
}

function computeTypingAnomaly(events: TypingEvent[], profile: TypingProfile): number {
  if (events.length === 0) return 0;
  const scores = events.map(e => {
    const holdScore = zScoreAnomaly(e.holdTime, profile.meanHoldTime, profile.stdHoldTime);
    const flightScore = zScoreAnomaly(e.flightTime, profile.meanFlightTime, profile.stdFlightTime);
    return (holdScore + flightScore) / 2;
  });
  return mean(scores);
}

function computeMouseAnomaly(events: MouseEvent[], profile: MouseProfile): number {
  if (events.length === 0) return 0;
  const scores = events.map(e => {
    const speedScore = zScoreAnomaly(e.speed, profile.meanSpeed, profile.stdSpeed);
    const distScore = zScoreAnomaly(e.distance, profile.meanDistance, profile.stdDistance);
    return (speedScore + distScore) / 2;
  });
  return mean(scores);
}

export function analyzeAnomaly(
  features: BehavioralFeatures,
  profile: BehavioralProfile
): AnomalyResult {
  const TRAINING_THRESHOLD = 5;

  const isNewProfile = profile.trainingDataCount < TRAINING_THRESHOLD;

  if (isNewProfile) {
    return {
      anomalyScore: 0,
      riskLevel: 'LOW',
      riskAction: 'Allow',
      details: { typingAnomaly: 0, mouseAnomaly: 0, isNewProfile: true },
    };
  }

  let typingAnomaly = 0;
  let mouseAnomaly = 0;
  let weightedCount = 0;

  if (features.typingEvents.length > 0 && profile.typingProfile) {
    typingAnomaly = computeTypingAnomaly(features.typingEvents, profile.typingProfile);
    weightedCount++;
  }

  if (features.mouseEvents.length > 0 && profile.mouseProfile) {
    mouseAnomaly = computeMouseAnomaly(features.mouseEvents, profile.mouseProfile);
    weightedCount++;
  }

  const anomalyScore = weightedCount > 0
    ? (typingAnomaly + mouseAnomaly) / weightedCount
    : 0;

  let riskLevel: AnomalyResult['riskLevel'];
  let riskAction: AnomalyResult['riskAction'];

  if (anomalyScore < 0.3) {
    riskLevel = 'LOW';
    riskAction = 'Allow';
  } else if (anomalyScore < 0.55) {
    riskLevel = 'MEDIUM';
    riskAction = 'Monitor';
  } else if (anomalyScore < 0.75) {
    riskLevel = 'HIGH';
    riskAction = 'Re-auth challenge';
  } else {
    riskLevel = 'CRITICAL';
    riskAction = 'Block';
  }

  return {
    anomalyScore: Math.round(anomalyScore * 1000) / 1000,
    riskLevel,
    riskAction,
    details: { typingAnomaly, mouseAnomaly, isNewProfile: false },
  };
}

export function mergeTypingProfile(
  existing: TypingProfile | null,
  newEvents: TypingEvent[]
): TypingProfile {
  if (!existing || existing.sampleCount === 0) {
    return buildTypingProfile(newEvents);
  }
  // Welford online merge approach (simplified)
  const newProfile = buildTypingProfile(newEvents);
  const totalN = existing.sampleCount + newEvents.length;
  const alpha = existing.sampleCount / totalN;
  const beta = newEvents.length / totalN;

  return {
    meanHoldTime: alpha * existing.meanHoldTime + beta * newProfile.meanHoldTime,
    stdHoldTime: Math.sqrt(alpha * existing.stdHoldTime ** 2 + beta * newProfile.stdHoldTime ** 2),
    meanFlightTime: alpha * existing.meanFlightTime + beta * newProfile.meanFlightTime,
    stdFlightTime: Math.sqrt(alpha * existing.stdFlightTime ** 2 + beta * newProfile.stdFlightTime ** 2),
    sampleCount: totalN,
  };
}

export function mergeMouseProfile(
  existing: MouseProfile | null,
  newEvents: MouseEvent[]
): MouseProfile {
  if (!existing || existing.sampleCount === 0) {
    return buildMouseProfile(newEvents);
  }
  const newProfile = buildMouseProfile(newEvents);
  const totalN = existing.sampleCount + newEvents.length;
  const alpha = existing.sampleCount / totalN;
  const beta = newEvents.length / totalN;

  return {
    meanSpeed: alpha * existing.meanSpeed + beta * newProfile.meanSpeed,
    stdSpeed: Math.sqrt(alpha * existing.stdSpeed ** 2 + beta * newProfile.stdSpeed ** 2),
    meanDistance: alpha * existing.meanDistance + beta * newProfile.meanDistance,
    stdDistance: Math.sqrt(alpha * existing.stdDistance ** 2 + beta * newProfile.stdDistance ** 2),
    sampleCount: totalN,
  };
}
