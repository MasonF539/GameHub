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
  status: "playing";
};

export type PublicEgyptianWarState = {
  status: EgyptianWarState["status"];
  currentPlayerId: string;
  pileCardCount: number;
  topCard: Card | null;
  players: Array<{
    id: string;
    name: string;
    avatar: string;
    cardCount: number;
    isEliminated: boolean;
    isCurrentPlayer: boolean;
  }>;
};

export type RandomInteger = (maxExclusive: number) => number;

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
    status: "playing"
  };
}

export function createPublicEgyptianWarState(
  state: EgyptianWarState
): PublicEgyptianWarState {
  const topCard = state.pile.at(-1) ?? null;

  return {
    status: state.status,
    currentPlayerId: state.players[state.currentPlayerIndex].id,
    pileCardCount: state.pile.length,
    topCard,
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
