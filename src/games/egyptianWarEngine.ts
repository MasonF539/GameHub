import { randomInt } from "node:crypto";
import type { Card, CardRank, CardSuit } from "./egyptianWar.js";

export type EgyptianWarSettings = {
  includeJokers: boolean;
  allowDoubles: boolean;
  allowSandwiches: boolean;
  allowFourInARow: boolean;
  allowTopBottom: boolean;
  allowTens: boolean;
  allowMarriage: boolean;
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
  currentPlayerIndex: number;
  settings: EgyptianWarSettings;
  challenge: {
    challengerId: string;
    responderId: string;
    attemptsRemaining: number;
  } | null;
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
  topCard: Card | null;
  isSlappable: boolean;
  challenge: EgyptianWarState["challenge"];
  activityMessage: string;
  players: Array<{
    id: string;
    name: string;
    avatar: string;
    cardCount: number;
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

export function createDeck(includeJokers: boolean): Card[] {
  const deck: Card[] = suits.flatMap((suit) =>
    standardRanks.map((rank) => ({
      id: `${suit}-${rank}`,
      suit,
      rank
    }))
  );

  if (includeJokers) {
    deck.push(
      { id: "joker-1", suit: null, rank: "joker" },
      { id: "joker-2", suit: null, rank: "joker" }
    );
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
    createDeck(settings.includeJokers),
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
    currentPlayerIndex,
    settings: { ...settings },
    challenge: null,
    totalCardCount: deck.length,
    winnerId: null,
    status: "playing",
    activityMessage: "The game is ready. The highlighted player plays first."
  };
}

const faceCardAttempts: Partial<Record<CardRank, number>> = {
  jack: 1,
  queen: 2,
  king: 3,
  ace: 4
};

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
): void {
  const owners = state.players.filter((player) => player.cards.length > 0);

  if (
    owners.length === 1 &&
    owners[0].cards.length + state.pile.length === state.totalCardCount
  ) {
    owners[0].cards.push(...state.pile);
    state.pile = [];
    state.winnerId = owners[0].id;
    state.status = "finished";
    state.challenge = null;
    state.currentPlayerIndex = state.players.indexOf(owners[0]);
    state.activityMessage = `${owners[0].name} has collected every card and wins!`;
  }
}

function awardPile(
  state: EgyptianWarState,
  playerId: string,
  message: string
): void {
  const winnerIndex = state.players.findIndex(
    (player) => player.id === playerId
  );
  const winner = state.players[winnerIndex];

  winner.cards.push(...state.pile);
  state.pile = [];
  winner.isEliminated = false;
  state.currentPlayerIndex = winnerIndex;
  state.challenge = null;
  state.activityMessage = message;
  endIfOnePlayerOwnsRemainingCards(state);
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
  return Object.hasOwn(faceCardAttempts, rank);
}

export function isEgyptianWarPileSlappable(
  pile: readonly Card[],
  settings: EgyptianWarSettings
): boolean {
  if (pile.length === 0) {
    return false;
  }

  if (pile.some((card) => card.rank === "joker")) {
    return true;
  }

  const last = pile[pile.length - 1].rank;

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

  if (settings.allowTopBottom && last === pile[0].rank) {
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

  const playerIndex = state.players.findIndex(
    (player) => player.id === playerId
  );

  if (playerIndex < 0) {
    throw new EgyptianWarRuleError("You are not a player in this game.");
  }

  const player = state.players[playerIndex];

  if (action === "slap") {
    if (!isEgyptianWarPileSlappable(state.pile, state.settings)) {
      throw new EgyptianWarRuleError("There is no valid slap combination.");
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
    awardPile(
      state,
      playerId,
      `${player.name} could not complete the challenge and won the pile.`
    );
    return state.activityMessage;
  }

  if (player.isEliminated || player.cards.length === 0) {
    player.isEliminated = true;
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

  if (state.challenge !== null) {
    if (isFaceCard(card.rank)) {
      const nextIndex = nextPlayerIndex(
        state,
        playerIndex,
        playerId
      );

      if (nextIndex === null) {
        awardPile(
          state,
          playerId,
          `${player.name} played ${card.rank} with no opponent able to answer and won the pile.`
        );
        return state.activityMessage;
      }

      state.challenge = {
        challengerId: playerId,
        responderId: state.players[nextIndex].id,
        attemptsRemaining: faceCardAttempts[card.rank] ?? 0
      };
      state.currentPlayerIndex = nextIndex;
      state.activityMessage =
        `${player.name} played ${card.rank}. ` +
        `${state.players[nextIndex].name} must answer within ` +
        `${state.challenge.attemptsRemaining} ${state.challenge.attemptsRemaining === 1 ? "attempt" : "attempts"}.`;
      return state.activityMessage;
    }

    state.challenge.attemptsRemaining -= 1;

    if (state.challenge.attemptsRemaining === 0) {
      awardPile(
        state,
        playerId,
        `${player.name} used the last challenge attempt without revealing a face card and won the pile.`
      );
      return state.activityMessage;
    }

    if (player.cards.length === 0) {
      awardPile(
        state,
        playerId,
        `${player.name} ran out of cards before completing the challenge and won the pile.`
      );
      return state.activityMessage;
    }

    state.activityMessage =
      `${player.name} played ${card.rank}. ` +
      `${state.challenge.attemptsRemaining} challenge ` +
      `${state.challenge.attemptsRemaining === 1 ? "attempt remains" : "attempts remain"}.`;
    return state.activityMessage;
  }

  if (isFaceCard(card.rank)) {
    const nextIndex = nextPlayerIndex(state, playerIndex, playerId);

    if (nextIndex === null) {
      awardPile(
        state,
        playerId,
        `${player.name} played ${card.rank} with no opponent able to answer and won the pile.`
      );
      return state.activityMessage;
    }

    state.challenge = {
      challengerId: playerId,
      responderId: state.players[nextIndex].id,
      attemptsRemaining: faceCardAttempts[card.rank] ?? 0
    };
    state.currentPlayerIndex = nextIndex;
    state.activityMessage =
      `${player.name} played ${card.rank}. ` +
      `${state.players[nextIndex].name} must answer within ` +
      `${state.challenge.attemptsRemaining} ${state.challenge.attemptsRemaining === 1 ? "attempt" : "attempts"}.`;
    return state.activityMessage;
  }

  if (player.cards.length === 0) {
    player.isEliminated = true;
    state.activityMessage = `${player.name} is out of cards and has been eliminated.`;
  } else {
    state.activityMessage = `${player.name} played ${card.rank}.`;
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

export function createPublicEgyptianWarState(
  state: EgyptianWarState
): PublicEgyptianWarState {
  const topCard = state.pile.at(-1) ?? null;
  const currentPlayer = state.players[state.currentPlayerIndex];

  return {
    status: state.status,
    currentPlayerId: currentPlayer?.id ?? null,
    winnerId: state.winnerId,
    pileCardCount: state.pile.length,
    topCard,
    isSlappable: isEgyptianWarPileSlappable(
      state.pile,
      state.settings
    ),
    challenge: state.challenge ? { ...state.challenge } : null,
    activityMessage: state.activityMessage,
    players: state.players.map((player, index) => ({
      id: player.id,
      name: player.name,
      avatar: player.avatar,
      cardCount: player.cards.length,
      isEliminated: player.isEliminated,
      isCurrentPlayer: index === state.currentPlayerIndex
    }))
  };
}
