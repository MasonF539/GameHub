import type { GameDefinition } from "./gameDefinition.js";

export type CardSuit =
  | "clubs"
  | "diamonds"
  | "hearts"
  | "spades";

export type CardRank =
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "jack"
  | "queen"
  | "king"
  | "ace"
  | "joker";

export type Card = {
  id: string;
  suit: CardSuit | null;
  rank: CardRank;
};

export const egyptianWar: GameDefinition = {
  id: "egyptian-war",
  name: "Egyptian War",
  description:
    "Play cards into a central pile, survive face-card challenges, and race to slap special combinations. The last player holding all the cards wins.",
  isPlayable: true,

  minPlayers: 2,
  maxPlayers: 6,

  rules: [
    "The server shuffles the deck, deals every card face down, and randomly selects the first player.",
    "Players cannot view or shuffle their decks.",
    "On a turn, a player flips the top card of their deck onto the central pile.",
    "Play proceeds clockwise until someone plays a face card: Jack, Queen, and King, or an Ace.",
    "The next player must respond with another face card or Ace. A Jack allows 1 attempt, a Queen 2 attempts, a King 3 attempts, and an Ace 4 attempts.",
    "If the challenged player reveals another face card or Ace, the challenge passes to the next player with the new number of attempts.",
    "If the challenged player uses every attempt without revealing a face card or Ace, they win the central pile.",
    "If the challenged player runs out of cards before completing their attempts and does not reveal another face card or Ace, they win the central pile and can continue playing.",
    "A player who wins the pile places all of its cards at the bottom of their deck without shuffling and begins the next pile.",
    "When a valid slap combination appears, the first player to slap wins the central pile.",
    "An eliminated player may continue watching and can reenter the game by winning a valid slap.",
    "If multiple slaps have no clear winner, nobody takes the pile and play continues.",
    "The winner is the player who collects every card."
  ],

  settings: [
    {
      key: "includeJokers",
      label: "Include Jokers",
      description:
        "Add two Jokers to the deck. Playing a Joker makes the pile slappable.",
      defaultValue: true
    },
    {
      key: "allowDoubles",
      label: "Doubles",
      description:
        "Allow a slap when two consecutive cards have the same rank.",
      defaultValue: true
    },
    {
      key: "allowSandwiches",
      label: "Sandwiches",
      description:
        "Allow a slap when matching ranks have exactly one card between them.",
      defaultValue: true
    },
    {
      key: "allowFourInARow",
      label: "Four in a Row",
      description:
        "Allow a slap when four cards form an ascending or descending sequence.",
      defaultValue: true
    },
    {
      key: "allowTopBottom",
      label: "Top Bottom",
      description:
        "Allow a slap when the newest card matches the first card in the pile.",
      defaultValue: false
    },
    {
      key: "allowTens",
      label: "Tens",
      description:
        "Allow a slap when two number cards total ten, either consecutively or with one face card between them. An Ace counts as one.",
      defaultValue: false
    },
    {
      key: "allowMarriage",
      label: "Marriage",
      description:
        "Allow a slap when a King and Queen are played consecutively in either order.",
      defaultValue: false
    }
  ]
};
