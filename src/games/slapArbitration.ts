export const slapCollectionWindowMs = 200;
export const slapTieWindowMs = 50;
export const maxSlapLatencyCorrectionMs = 150;

export type TimedSlapCandidate = {
  adjustedArrivalTime: number;
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

export function getSlapCandidatesWithinTieWindow<
  T extends TimedSlapCandidate
>(
  candidates: readonly T[]
): T[] {
  if (candidates.length === 0) {
    return [];
  }

  const earliestArrivalTime = Math.min(
    ...candidates.map((candidate) => candidate.adjustedArrivalTime)
  );

  return candidates.filter(
    (candidate) =>
      candidate.adjustedArrivalTime - earliestArrivalTime <=
      slapTieWindowMs
  );
}
