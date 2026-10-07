import { randomInt } from "node:crypto";
import type { Card, CardRank, CardSuit } from "./definition.js";

export type EgyptianWarSettings = {
  deckCount: number;
  includeJokers: boolean;
  allowDoubles: boolean;
  allowSandwiches: boolean;
  allowFourInARow: boolean;
  allowTopBottom: boolean;
  allowTens: boolean;
  allowMarriage: boolean;
  falseSlapPenaltyCards: number;
};

export type EgyptianWarPlayerInput = {
  id: string;
  name: string;
  avatar: string;
};

export type EgyptianWarPlayerState = EgyptianWarPlayerInput & {
  cards: Card[];
  isEliminated: boolean;
};

export type EgyptianWarState = {
  players: EgyptianWarPlayerState[];
  pile: Card[];
  deferredCards: Card[];
  penaltyPileCardCount: number;
  currentPlayerIndex: number;
  settings: EgyptianWarSettings;
  challenge: {
    challengerId: string;
    responderId: string;
    attemptsRemaining: number;
  } | null;
  pendingPileWinnerId: string | null;
  totalCardCount: number;
  winnerId: string | null;
  status: "playing" | "finished";
  activityMessage: string;
};

export type PublicEgyptianWarState = {
  status: EgyptianWarState["status"];
  currentPlayerId: string | null;
  winnerId: string | null;
  pileCardCount: number;
  hasFaceUpCards: boolean;
  topCard: Card | null;
  recentCards: Card[];
  isSlappable: boolean;
  isPaused: boolean;
  pauseMessage: string | null;
  isAnimating: boolean;
  isSlapWindow: boolean;
  turnTimerSeconds: number;
  turnTimeRemainingMs: number | null;
  challenge: EgyptianWarState["challenge"];
  activityMessage: string;
  players: Array<{
    id: string;
    name: string;
    avatar: string;
    cardCount: number;
    isConnected: boolean;
    isEliminated: boolean;
    isCurrentPlayer: boolean;
  }>;
};

export type EgyptianWarAction = "play-card" | "slap";

export type RandomInteger = (maxExclusive: number) => number;

export class EgyptianWarRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EgyptianWarRuleError";
  }
}

const suits: CardSuit[] = [
  "clubs",
  "diamonds",
  "hearts",
  "spades"
];

const standardRanks: Exclude<CardRank, "joker">[] = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "jack",
  "queen",
  "king",
  "ace"
];

export function createDeck(
  includeJokers: boolean,
  deckCount = 1
): Card[] {
  if (!Number.isInteger(deckCount) || deckCount < 1 || deckCount > 3) {
    throw new RangeError("Egyptian War requires between 1 and 3 decks.");
  }

  const deck: Card[] = [];

  for (let deckIndex = 1; deckIndex <= deckCount; deckIndex += 1) {
    deck.push(
      ...suits.flatMap((suit) =>
        standardRanks.map((rank) => ({
          id: `deck-${deckIndex}-${suit}-${rank}`,
          suit,
          rank
        }))
      )
    );

    if (includeJokers) {
      deck.push(
        {
          id: `deck-${deckIndex}-joker-1`,
          suit: null,
          rank: "joker"
        },
        {
          id: `deck-${deckIndex}-joker-2`,
          suit: null,
          rank: "joker"
        }
      );
    }
  }

  return deck;
}

export function shuffleDeck(
  cards: readonly Card[],
  randomInteger: RandomInteger = randomInt
): Card[] {
  const shuffledCards = [...cards];

  for (let index = shuffledCards.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInteger(index + 1);

    if (
      !Number.isInteger(swapIndex) ||
      swapIndex < 0 ||
      swapIndex > index
    ) {
      throw new RangeError(
        `Random index must be an integer between 0 and ${index}.`
      );
    }

    [shuffledCards[index], shuffledCards[swapIndex]] = [
      shuffledCards[swapIndex],
      shuffledCards[index]
    ];
  }

  return shuffledCards;
}

export function createEgyptianWarState(
  playerInputs: readonly EgyptianWarPlayerInput[],
  settings: EgyptianWarSettings,
  randomInteger: RandomInteger = randomInt
): EgyptianWarState {
  if (playerInputs.length < 2 || playerInputs.length > 6) {
    throw new RangeError("Egyptian War requires between 2 and 6 players.");
  }

  const playerIds = new Set(playerInputs.map((player) => player.id));

  if (playerIds.size !== playerInputs.length) {
    throw new Error("Egyptian War players must have unique IDs.");
  }

  const players = playerInputs.map((player) => ({
    ...player,
    cards: [] as Card[],
    isEliminated: false
  }));

  const deck = shuffleDeck(
    createDeck(settings.includeJokers, settings.deckCount),
    randomInteger
  );

  for (let index = 0; index < deck.length; index += 1) {
    players[index % players.length].cards.push(deck[index]);
  }

  const currentPlayerIndex = randomInteger(players.length);

  if (
    !Number.isInteger(currentPlayerIndex) ||
    currentPlayerIndex < 0 ||
    currentPlayerIndex >= players.length
  ) {
    throw new RangeError(
      "Random first-player index must identify a player."
    );
  }

  return {
    players,
    pile: [],
    deferredCards: [],
    penaltyPileCardCount: 0,
    currentPlayerIndex,
    settings: { ...settings },
    challenge: null,
    pendingPileWinnerId: null,
    totalCardCount: deck.length,
    winnerId: null,
    status: "playing",
    activityMessage: "The game is ready. The highlighted player plays first."
  };
}

const challengeAttempts: Partial<Record<CardRank, number>> = {
  jack: 1,
  queen: 2,
  king: 3,
  ace: 4,
  joker: 5
};

function describeCardRank(rank: CardRank): string {
  return `${rank === "ace" ? "an" : "a"} ${rank}`;
}

function nextPlayerIndex(
  state: EgyptianWarState,
  fromIndex: number,
  excludedPlayerId?: string
): number | null {
  for (let offset = 1; offset <= state.players.length; offset += 1) {
    const index = (fromIndex + offset) % state.players.length;
    const player = state.players[index];

    if (
      player.id !== excludedPlayerId &&
      !player.isEliminated &&
      player.cards.length > 0
    ) {
      return index;
    }
  }

  return null;
}

function endIfOnePlayerOwnsRemainingCards(
  state: EgyptianWarState
): boolean {
  const owners = state.players.filter((player) => player.cards.length > 0);
  const faceUpPile = state.pile.slice(state.penaltyPileCardCount);

  if (
    owners.length === 1 &&
    owners[0].cards.length +
      state.pile.length +
      state.deferredCards.length === state.totalCardCount &&
    !isEgyptianWarPileSlappable(faceUpPile, state.settings)
  ) {
    owners[0].cards.push(...state.pile);
    owners[0].cards.push(...state.deferredCards);
    state.pile = [];
    state.deferredCards = [];
    state.penaltyPileCardCount = 0;
    state.winnerId = owners[0].id;
    state.status = "finished";
    state.challenge = null;
    state.currentPlayerIndex = state.players.indexOf(owners[0]);
    state.activityMessage = `${owners[0].name} has collected every card and wins!`;
    return true;
  }

  return false;
}

function awardPile(
  state: EgyptianWarState,
  playerId: string,
  message: string
): void {
  const deferredCardCount = state.deferredCards.length;
  const winnerIndex = state.players.findIndex(
    (player) => player.id === playerId
  );
  const winner = state.players[winnerIndex];

  winner.cards.push(...state.pile);
  state.pile = [];
  state.penaltyPileCardCount = 0;
  if (state.deferredCards.length > 0) {
    state.pile.push(...state.deferredCards);
    state.penaltyPileCardCount = state.deferredCards.length;
    state.deferredCards = [];
  }
  winner.isEliminated = false;
  state.currentPlayerIndex = winnerIndex;
  state.challenge = null;
  state.pendingPileWinnerId = null;
  state.activityMessage = message;
  endIfOnePlayerOwnsRemainingCards(state);
  if (deferredCardCount > 0) {
    const deferredCardLabel =
      `${deferredCardCount} ${deferredCardCount === 1 ? "card" : "cards"}`;
    const verb = deferredCardCount === 1 ? "was" : "were";
    state.activityMessage += state.status === "playing"
      ? ` ${deferredCardLabel} ${verb} added face-down to the next pile.`
      : ` ${deferredCardLabel} ${verb} included face-down in the winning pile.`;
  }
}

export function removeEgyptianWarPlayer(
  state: EgyptianWarState,
  playerId: string
): string {
  if (state.status !== "playing") {
    throw new EgyptianWarRuleError("This game has already finished.");
  }

  const removedIndex = state.players.findIndex(
    (player) => player.id === playerId
  );

  if (removedIndex < 0) {
    throw new EgyptianWarRuleError("That player is no longer in the game.");
  }

  const removedPlayer = state.players[removedIndex];
  const removedCardCount = removedPlayer.cards.length;
  const challenge = state.challenge;
  const wasCurrentPlayer = state.currentPlayerIndex === removedIndex;

  state.deferredCards.push(...removedPlayer.cards);
  state.players.splice(removedIndex, 1);

  if (state.players.length === 0) {
    state.pile = [];
    state.deferredCards = [];
    state.penaltyPileCardCount = 0;
    state.challenge = null;
    state.pendingPileWinnerId = null;
    state.status = "finished";
    state.winnerId = null;
    state.activityMessage = `${removedPlayer.name} was removed. The game ended.`;
    return state.activityMessage;
  }

  if (state.currentPlayerIndex > removedIndex) {
    state.currentPlayerIndex -= 1;
  } else if (wasCurrentPlayer) {
    state.currentPlayerIndex %= state.players.length;
  }

  const survivingChallengePlayer = challenge
    ? state.players.find((player) =>
      player.id === (
        challenge.responderId === playerId
          ? challenge.challengerId
          : challenge.responderId
      )
    )
    : undefined;

  if (
    challenge?.responderId === playerId &&
    survivingChallengePlayer
  ) {
    awardPile(
      state,
      survivingChallengePlayer.id,
      `${removedPlayer.name} was removed during a challenge. ` +
        `${survivingChallengePlayer.name} won the pile.`
    );
  } else if (
    challenge?.challengerId === playerId &&
    survivingChallengePlayer
  ) {
    awardPile(
      state,
      survivingChallengePlayer.id,
      `${removedPlayer.name} was removed during a challenge. ` +
        `${survivingChallengePlayer.name} won the pile.`
    );
  } else if (state.pendingPileWinnerId === playerId) {
    state.pendingPileWinnerId = null;
    const currentPlayer =
      state.players[state.currentPlayerIndex]?.cards.length
        ? state.players[state.currentPlayerIndex]
        : state.players.find(
          (player) => !player.isEliminated && player.cards.length > 0
        );

    if (currentPlayer) {
      awardPile(
        state,
        currentPlayer.id,
        `${removedPlayer.name} was removed before the pile was claimed. ` +
          `${currentPlayer.name} won the pile.`
      );
    }
  } else if (wasCurrentPlayer) {
    const nextPlayer = state.players.find(
      (player, index) =>
        index >= state.currentPlayerIndex &&
        !player.isEliminated &&
        player.cards.length > 0
    ) ?? state.players.find(
      (player) => !player.isEliminated && player.cards.length > 0
    );

    if (nextPlayer) {
      state.currentPlayerIndex = state.players.indexOf(nextPlayer);
    }
  }

  if (state.players.length === 1 && state.status === "playing") {
    const winner = state.players[0];
    winner.cards.push(...state.pile, ...state.deferredCards);
    state.pile = [];
    state.deferredCards = [];
    state.penaltyPileCardCount = 0;
    state.challenge = null;
    state.pendingPileWinnerId = null;
    state.currentPlayerIndex = 0;
    state.winnerId = winner.id;
    state.status = "finished";
    state.activityMessage =
      `${winner.name} wins because they are the only player remaining.`;
  } else if (state.status === "playing") {
    endIfOnePlayerOwnsRemainingCards(state);
    if (state.status === "playing") {
      state.activityMessage =
        `${removedPlayer.name} was removed by the host.`;
    }
  }

  if (state.status === "playing") {
    state.activityMessage += removedCardCount > 0
      ? ` Their ${removedCardCount} ${removedCardCount === 1 ? "card" : "cards"} will be added face-down to the next pile.`
      : " They had no cards to add to the next pile.";
  }

  return state.activityMessage;
}

function passChallengeAfterElimination(
  state: EgyptianWarState,
  playerIndex: number
): void {
  const player = state.players[playerIndex];
  const challenge = state.challenge;

  if (!challenge) {
    throw new Error("Cannot pass a challenge that is not active.");
  }

  player.isEliminated = true;
  if (endIfOnePlayerOwnsRemainingCards(state)) {
    return;
  }

  const nextIndex = nextPlayerIndex(
    state,
    playerIndex,
    player.id
  );

  if (nextIndex === null) {
    const challenger = state.players.find(
      (candidate) => candidate.id === challenge.challengerId
    );

    if (!challenger) {
      throw new Error("The challenge owner is no longer in the game.");
    }

    awardPile(
      state,
      challenger.id,
      `${player.name} ran out of cards. No player could continue the challenge, so ${challenger.name} won the pile.`
    );
    return;
  }

  const nextPlayer = state.players[nextIndex];
  state.challenge = {
    ...challenge,
    responderId: nextPlayer.id
  };
  state.currentPlayerIndex = nextIndex;
  state.activityMessage =
    `${player.name} ran out of cards. ` +
    `${nextPlayer.name} continues the challenge with ` +
    `${challenge.attemptsRemaining} ` +
    `${challenge.attemptsRemaining === 1 ? "attempt" : "attempts"} remaining.`;
}

function cardRankValue(rank: CardRank): number | null {
  if (rank === "ace") {
    return 1;
  }

  if (rank === "joker") {
    return null;
  }

  const values: Record<Exclude<CardRank, "ace" | "joker">, number> = {
    "2": 2,
    "3": 3,
    "4": 4,
    "5": 5,
    "6": 6,
    "7": 7,
    "8": 8,
    "9": 9,
    "10": 10,
    jack: 11,
    queen: 12,
    king: 13
  };

  return values[rank];
}

function isFaceCard(rank: CardRank): boolean {
  return rank === "jack" || rank === "queen" || rank === "king";
}

function isChallengeCard(rank: CardRank): boolean {
  return Object.hasOwn(challengeAttempts, rank);
}

export function isEgyptianWarPileSlappable(
  pile: readonly Card[],
  settings: EgyptianWarSettings
): boolean {
  if (pile.length === 0) {
    return false;
  }

  const last = pile[pile.length - 1].rank;

  if (last === "joker") {
    return true;
  }

  if (settings.allowDoubles && pile.length >= 2) {
    if (last === pile[pile.length - 2].rank) {
      return true;
    }
  }

  if (settings.allowSandwiches && pile.length >= 3) {
    if (last === pile[pile.length - 3].rank) {
      return true;
    }
  }

  if (settings.allowFourInARow && pile.length >= 4) {
    const cards = pile.slice(-4);
    const aceLowValues = cards.map((card) => cardRankValue(card.rank));
    const aceHighValues = cards.map((card) =>
      card.rank === "ace" ? 14 : cardRankValue(card.rank)
    );
    const isSequence = (values: Array<number | null>): boolean =>
      values.every((value) => value !== null) &&
      (
        values[1] === values[0] + 1 &&
        values[2] === values[1] + 1 &&
        values[3] === values[2] + 1 ||
        values[1] === values[0] - 1 &&
        values[2] === values[1] - 1 &&
        values[3] === values[2] - 1
      );

    if (isSequence(aceLowValues) || isSequence(aceHighValues)) {
      return true;
    }
  }

  if (
    settings.allowTopBottom &&
    pile.length >= 2 &&
    last === pile[0].rank
  ) {
    return true;
  }

  if (settings.allowTens) {
    const lastValue = cardRankValue(last);

    if (lastValue !== null && lastValue <= 10) {
      for (const previousIndex of [pile.length - 2, pile.length - 3]) {
        if (previousIndex < 0) {
          continue;
        }

        const previousCard = pile[previousIndex];
        const previousValue = cardRankValue(previousCard.rank);
        const hasAllowedGap =
          previousIndex === pile.length - 2 ||
          isFaceCard(pile[pile.length - 2].rank);

        if (
          hasAllowedGap &&
          previousValue !== null &&
          previousValue <= 10 &&
          previousValue + lastValue === 10
        ) {
          return true;
        }
      }
    }
  }

  if (settings.allowMarriage && pile.length >= 2) {
    const previous = pile[pile.length - 2].rank;
    if (
      last === "king" && previous === "queen" ||
      last === "queen" && previous === "king"
    ) {
      return true;
    }
  }

  return false;
}

export function applyEgyptianWarAction(
  state: EgyptianWarState,
  playerId: string,
  action: EgyptianWarAction
): string {
  if (state.status !== "playing") {
    throw new EgyptianWarRuleError("This game has already finished.");
  }

  if (action === "play-card" && state.pendingPileWinnerId !== null) {
    throw new EgyptianWarRuleError(
      "Wait for the slap window to end before playing a card."
    );
  }

  const playerIndex = state.players.findIndex(
    (player) => player.id === playerId
  );

  if (playerIndex < 0) {
    throw new EgyptianWarRuleError("You are not a player in this game.");
  }

  const player = state.players[playerIndex];

  if (action === "slap") {
    const faceUpPile = state.pile.slice(state.penaltyPileCardCount);
    if (faceUpPile.length === 0) {
      throw new EgyptianWarRuleError("There are no face-up cards to slap.");
    }

    if (!isEgyptianWarPileSlappable(faceUpPile, state.settings)) {
      const cardsForfeited = player.cards.splice(
        0,
        state.settings.falseSlapPenaltyCards
      );
      state.pile.unshift(...cardsForfeited);
      state.penaltyPileCardCount += cardsForfeited.length;

      if (player.cards.length === 0) {
        player.isEliminated = true;
        if (endIfOnePlayerOwnsRemainingCards(state)) {
          return state.activityMessage;
        }

        if (state.challenge?.responderId === playerId) {
          passChallengeAfterElimination(state, playerIndex);
          return state.activityMessage;
        }

        if (state.currentPlayerIndex === playerIndex) {
          const nextIndex = nextPlayerIndex(state, playerIndex);

          if (nextIndex !== null) {
            state.currentPlayerIndex = nextIndex;
          } else {
            endIfOnePlayerOwnsRemainingCards(state);
          }
        }
      }

      state.activityMessage = cardsForfeited.length > 0
        ? `${player.name} slapped too early and forfeited ${cardsForfeited.length} ${cardsForfeited.length === 1 ? "card" : "cards"} to the pile.`
        : `${player.name} slapped too early but had no cards to forfeit.`;
      return state.activityMessage;
    }

    awardPile(
      state,
      playerId,
      `${player.name} slapped first and won the pile.`
    );
    return state.activityMessage;
  }

  if (playerIndex !== state.currentPlayerIndex) {
    throw new EgyptianWarRuleError("It is not your turn.");
  }

  if (
    player.cards.length === 0 &&
    state.challenge?.responderId === playerId
  ) {
    passChallengeAfterElimination(state, playerIndex);
    return state.activityMessage;
  }

  if (player.isEliminated || player.cards.length === 0) {
    player.isEliminated = true;
    if (endIfOnePlayerOwnsRemainingCards(state)) {
      return state.activityMessage;
    }

    const nextIndex = nextPlayerIndex(state, playerIndex);

    if (nextIndex === null) {
      awardPile(
        state,
        playerId,
        `${player.name} collected the final cards and wins.`
      );
      return state.activityMessage;
    }

    state.currentPlayerIndex = nextIndex;
    state.activityMessage = `${player.name} is out of cards and has been eliminated.`;
    return state.activityMessage;
  }

  const card = player.cards.shift();

  if (!card) {
    throw new Error("No card is available to play.");
  }

  state.pile.push(card);

  if (player.cards.length === 0) {
    player.isEliminated = true;
    if (endIfOnePlayerOwnsRemainingCards(state)) {
      return state.activityMessage;
    }
  }

  if (state.challenge !== null) {
    if (isChallengeCard(card.rank)) {
      const nextIndex = nextPlayerIndex(
        state,
        playerIndex,
        playerId
      );

      if (nextIndex === null) {
        awardPile(
          state,
          playerId,
          `${player.name} played ${describeCardRank(card.rank)} with no opponent able to answer and won the pile.`
        );
        return state.activityMessage;
      }

      if (player.cards.length === 0) {
        player.isEliminated = true;
      }

      state.challenge = {
        challengerId: playerId,
        responderId: state.players[nextIndex].id,
        attemptsRemaining: challengeAttempts[card.rank] ?? 0
      };
      state.currentPlayerIndex = nextIndex;
      state.activityMessage =
        `${player.name} played ${describeCardRank(card.rank)}. ` +
        `${state.players[nextIndex].name} must answer within ` +
        `${state.challenge.attemptsRemaining} ${state.challenge.attemptsRemaining === 1 ? "attempt" : "attempts"}.`;
      return state.activityMessage;
    }

    state.challenge.attemptsRemaining -= 1;

    if (state.challenge.attemptsRemaining === 0) {
      const challenger = state.players.find(
        (candidate) => candidate.id === state.challenge?.challengerId
      );

      if (!challenger) {
        throw new Error("The challenge owner is no longer in the game.");
      }

      state.challenge = null;

      if (
        isEgyptianWarPileSlappable(
          state.pile.slice(state.penaltyPileCardCount),
          state.settings
        )
      ) {
        state.pendingPileWinnerId = challenger.id;
        const nextIndex = nextPlayerIndex(
          state,
          playerIndex,
          playerId
        );

        if (nextIndex !== null) {
          state.currentPlayerIndex = nextIndex;
        }

        state.activityMessage =
          `The challenge ended. The timer will continue until the pile is awarded.`;
      } else {
        awardPile(
          state,
          challenger.id,
          `${player.name} used the last challenge attempt without revealing a face card. ${challenger.name} won the pile.`
        );
      }
      return state.activityMessage;
    }

    if (player.cards.length === 0) {
      passChallengeAfterElimination(state, playerIndex);
      return state.activityMessage;
    }

    state.activityMessage =
      `${player.name} played ${describeCardRank(card.rank)}. ` +
      `${state.challenge.attemptsRemaining} challenge ` +
      `${state.challenge.attemptsRemaining === 1 ? "attempt remains" : "attempts remain"}.`;
    return state.activityMessage;
  }

  if (isChallengeCard(card.rank)) {
    const nextIndex = nextPlayerIndex(state, playerIndex, playerId);

    if (nextIndex === null) {
      awardPile(
        state,
        playerId,
        `${player.name} played ${describeCardRank(card.rank)} with no opponent able to answer and won the pile.`
      );
      return state.activityMessage;
    }

    if (player.cards.length === 0) {
      player.isEliminated = true;
    }

    state.challenge = {
      challengerId: playerId,
      responderId: state.players[nextIndex].id,
      attemptsRemaining: challengeAttempts[card.rank] ?? 0
    };
    state.currentPlayerIndex = nextIndex;
    state.activityMessage =
      `${player.name} played ${describeCardRank(card.rank)}. ` +
      `${state.players[nextIndex].name} must answer within ` +
      `${state.challenge.attemptsRemaining} ${state.challenge.attemptsRemaining === 1 ? "attempt" : "attempts"}.`;
    return state.activityMessage;
  }

  if (player.cards.length === 0) {
    player.isEliminated = true;
    state.activityMessage = `${player.name} is out of cards and has been eliminated.`;
  } else {
    state.activityMessage =
      `${player.name} played ${describeCardRank(card.rank)}.`;
  }

  const nextIndex = nextPlayerIndex(state, playerIndex);

  if (nextIndex === null) {
    awardPile(
      state,
      playerId,
      `${player.name} collected the final cards and wins.`
    );
    return state.activityMessage;
  }

  state.currentPlayerIndex = nextIndex;
  endIfOnePlayerOwnsRemainingCards(state);
  return state.activityMessage;
}

export function resolveEgyptianWarTurnTimeout(
  state: EgyptianWarState
): string {
  if (state.status !== "playing") {
    throw new EgyptianWarRuleError("This game has already finished.");
  }

  if (state.pendingPileWinnerId !== null) {
    const winner = state.players.find(
      (player) => player.id === state.pendingPileWinnerId
    );

    if (!winner) {
      throw new Error("The pending pile winner is no longer in the game.");
    }

    awardPile(
      state,
      winner.id,
      `The slap window expired. ${winner.name} won the pile.`
    );
    return state.activityMessage;
  }

  const currentPlayer = state.players[state.currentPlayerIndex];

  if (!currentPlayer) {
    throw new Error("There is no current player to take a turn.");
  }

  return applyEgyptianWarAction(
    state,
    currentPlayer.id,
    "play-card"
  );
}

export function createPublicEgyptianWarState(
  state: EgyptianWarState,
  isPaused = false,
  isAnimating = false,
  turnTimerSeconds = 15,
  turnTimeRemainingMs: number | null = null,
  pauseMessage: string | null = null,
  connectedPlayerIds: ReadonlySet<string> = new Set(
    state.players.map((player) => player.id)
  )
): PublicEgyptianWarState {
  const faceUpCards = state.pile.slice(state.penaltyPileCardCount);
  const topCard = faceUpCards.at(-1) ?? null;
  const currentPlayer = state.players[state.currentPlayerIndex];

  return {
    status: state.status,
    currentPlayerId: currentPlayer?.id ?? null,
    winnerId: state.winnerId,
    pileCardCount: state.pile.length,
    hasFaceUpCards: faceUpCards.length > 0,
    topCard,
    recentCards: faceUpCards.slice(-5),
    isSlappable: isEgyptianWarPileSlappable(
      state.pile.slice(state.penaltyPileCardCount),
      state.settings
    ),
    isPaused,
    pauseMessage,
    isAnimating,
    isSlapWindow: state.pendingPileWinnerId !== null,
    turnTimerSeconds,
    turnTimeRemainingMs,
    challenge: state.challenge ? { ...state.challenge } : null,
    activityMessage: state.activityMessage,
    players: state.players.map((player, index) => ({
      id: player.id,
      name: player.name,
      avatar: player.avatar,
      cardCount: player.cards.length,
      isConnected: connectedPlayerIds.has(player.id),
      isEliminated: player.isEliminated,
      isCurrentPlayer: index === state.currentPlayerIndex
    }))
  };
}
