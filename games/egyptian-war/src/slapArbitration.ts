import { randomInt } from "node:crypto";

export const slapCollectionWindowMs = 200;

export const minimumSlapWindowMs = 20;
export const maximumSlapWindowMs = 50;
export const defaultSlapJitterMs = 25;

const secureRandomRange = 0x1_0000_0000;

function secureRandomUnitInterval(): number {
  return randomInt(secureRandomRange) / secureRandomRange;
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
