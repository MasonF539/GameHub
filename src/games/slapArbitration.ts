import { randomInt } from "node:crypto";

export const slapCollectionWindowMs = 200;
export const maxSlapLatencyCorrectionMs = 150;

export const minimumSlapWindowMs = 20;
export const maximumSlapWindowMs = 50;
export const maximumLatencySamples = 12;
export const minimumTrustedLatencySamples = 4;
export const defaultSlapJitterMs = 25;
export const rttSmoothingFactor = 0.2;

const secureRandomRange = 0x1_0000_0000;

function secureRandomUnitInterval(): number {
  return randomInt(secureRandomRange) / secureRandomRange;
}

export function appendRttSample(
  samples: readonly number[],
  sample: number
): number[] {
  const validSamples = samples.filter(
    (existingSample) =>
      Number.isFinite(existingSample) && existingSample >= 0
  );

  if (!Number.isFinite(sample) || sample < 0) {
    return validSamples.slice(-maximumLatencySamples);
  }

  return [...validSamples, sample].slice(-maximumLatencySamples);
}

export function calculateRttJitter(
  samples: readonly number[]
): number {
  const validSamples = samples.filter(
    (sample) => Number.isFinite(sample) && sample >= 0
  );

  if (validSamples.length < minimumTrustedLatencySamples) {
    return defaultSlapJitterMs;
  }

  const average =
    validSamples.reduce((total, sample) => total + sample, 0) /
    validSamples.length;

  const variance =
    validSamples.reduce(
      (total, sample) =>
        total + (sample - average) ** 2,
      0
    ) / validSamples.length;

  return Math.sqrt(variance);
}

export function calculateSmoothedRttEstimate(
  samples: readonly number[]
): number {
  const validSamples = samples.filter(
    (sample) => Number.isFinite(sample) && sample >= 0
  );

  if (validSamples.length < minimumTrustedLatencySamples) {
    return 0;
  }

  const sortedSamples = [...validSamples].sort(
    (first, second) => first - second
  );
  const lastIndex = sortedSamples.length - 1;
  const lowerQuartile =
    sortedSamples[Math.floor(lastIndex * 0.25)] ?? 0;
  const upperQuartile =
    sortedSamples[Math.floor(lastIndex * 0.75)] ?? lowerQuartile;
  const interquartileRange = upperQuartile - lowerQuartile;
  const lowerFence = lowerQuartile - interquartileRange * 1.5;
  const upperFence = upperQuartile + interquartileRange * 1.5;
  const inlierSamples = validSamples.filter(
    (sample) => sample >= lowerFence && sample <= upperFence
  );
  const firstSample = inlierSamples[0];

  if (firstSample === undefined) {
    return 0;
  }

  return inlierSamples.slice(1).reduce(
    (smoothedRtt, sample) =>
      smoothedRtt * (1 - rttSmoothingFactor) +
      sample * rttSmoothingFactor,
    firstSample
  );
}

export function getSlapComparisonWindow(
  firstJitterMs: number,
  secondJitterMs: number
): number {
  const normalizeJitter = (jitterMs: number): number =>
    Number.isFinite(jitterMs)
      ? Math.max(0, jitterMs)
      : defaultSlapJitterMs;
  const combinedJitter =
    normalizeJitter(firstJitterMs) +
    normalizeJitter(secondJitterMs);

  return Math.min(
    maximumSlapWindowMs,
    Math.max(minimumSlapWindowMs, combinedJitter)
  );
}

export type TimedSlapCandidate = {
  adjustedArrivalTime: number;
  jitterMs: number;
};

export function estimateSlapLatencyCorrection(
  roundTripTimeMs: number
): number {
  if (!Number.isFinite(roundTripTimeMs) || roundTripTimeMs < 0) {
    return 0;
  }

  return Math.min(
    maxSlapLatencyCorrectionMs,
    roundTripTimeMs / 2
  );
}

export function selectWeightedSlapWinner<
  T extends TimedSlapCandidate
>(
  candidates: readonly T[],
  randomValue: number = secureRandomUnitInterval()
): T | undefined {
  const validCandidates = candidates.filter(
    (candidate) =>
      Number.isFinite(candidate.adjustedArrivalTime) &&
      Number.isFinite(candidate.jitterMs)
  );

  if (validCandidates.length === 0) {
    return undefined;
  }

  const orderedCandidates = [...validCandidates].sort(
    (first, second) =>
      first.adjustedArrivalTime - second.adjustedArrivalTime
  );

  const earliestCandidate = orderedCandidates[0];

  if (!earliestCandidate) {
    return undefined;
  }

  const weightedCandidates = orderedCandidates
    .map((candidate) => {
      const difference =
        candidate.adjustedArrivalTime -
        earliestCandidate.adjustedArrivalTime;

      const comparisonWindow = getSlapComparisonWindow(
        earliestCandidate.jitterMs,
        candidate.jitterMs
      );

      if (difference > comparisonWindow) {
        return {
          candidate,
          weight: 0
        };
      }

      return {
        candidate,
        weight: Math.exp(
          (-3 * difference) / comparisonWindow
        )
      };
    })
    .filter((entry) => entry.weight > 0);

  const totalWeight = weightedCandidates.reduce(
    (total, entry) => total + entry.weight,
    0
  );

  const safeRandomValue = Number.isFinite(randomValue)
    ? Math.min(
      Math.max(randomValue, 0),
      0.999999999999
    )
    : 0;

  let selectionPoint = safeRandomValue * totalWeight;

  for (const entry of weightedCandidates) {
    selectionPoint -= entry.weight;

    if (selectionPoint < 0) {
      return entry.candidate;
    }
  }

  return earliestCandidate;
}
