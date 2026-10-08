import type { GameDefinition } from "../gameDefinition.js";
import {
  gameHubGameApiVersion,
  type GamePluginManifest
} from "../../game-sdk/manifest.js";

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
  chatEnabled: true,

  minPlayers: 2,
  maxPlayers: 6,

  rules: [
    "The server shuffles the deck, deals every card face down, and randomly selects the first player.",
    "Players cannot view or shuffle their decks.",
    "Each player has the configured number of seconds to take their turn. If time expires, the server plays that player's top card automatically.",
    "On a turn, a player flips the top card of their deck onto the central pile.",
    "Play proceeds clockwise until someone plays a face card (Jack, Queen, or King), an Ace, or a Joker.",
    "The next player must respond with another face card, Ace, or Joker. A Jack allows 1 attempt, a Queen 2 attempts, a King 3 attempts, an Ace 4 attempts, and a Joker 5 attempts.",
    "If the challenged player reveals another face card, Ace, or Joker, the challenge passes to the next player with the new number of attempts.",
    "If the challenged player uses every attempt without revealing a face card, Ace, or Joker, the player who most recently played a challenge card wins the pile unless the final card creates a valid slap combination.",
    "When the final failed challenge card creates a valid slap combination, players may slap until the turn timer expires; if nobody slaps, the most recent challenge card player wins the pile.",
    "If the challenged player runs out of cards before completing their attempts, the next player with cards inherits the challenge with the remaining attempts.",
    "A player who runs out of cards is skipped until they reenter by winning a valid slap.",
    "A player who wins the pile places all of its cards at the bottom of their deck without shuffling and begins the next pile.",
    "When a valid slap combination appears, the first player to slap wins the central pile.",
    "Slapping without a valid combination forfeits the configured number of cards face down to the bottom of the pile, or all remaining cards if fewer remain. Penalty cards do not create slap combinations.",
    "When only one player still has cards, that player wins unless the current face-up pile has a valid slap that allows an eliminated player to reenter.",
    "If multiple slaps have no clear winner, nobody takes the pile and play continues.",
    "The winner is the player who collects every card."
  ],

  settings: [
    {
      type: "number",
      key: "deckCount",
      label: "Number of Decks",
      description:
        "Choose whether the game uses one, two, or three complete decks of cards.",
      defaultValue: 1,
      options: [1, 2, 3],
      unit: "deck"
    },
    {
      key: "includeJokers",
      label: "Include Jokers",
      description:
        "Add two Jokers per deck. Playing a Joker starts a five-attempt challenge and makes the pile slappable.",
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
    },
    {
      type: "number",
      key: "falseSlapPenaltyCards",
      label: "False Slap Penalty",
      description:
        "Cards forfeited to the bottom of the pile when a player slaps an invalid combination.",
      defaultValue: 2,
      options: [1, 2, 3],
      unit: "card"
    },
    {
      type: "number",
      control: "range",
      key: "turnTimerSeconds",
      label: "Player Timer",
      description:
        "Seconds each player has to play a card before the server plays their top card automatically.",
      defaultValue: 15,
      min: 5,
      max: 120,
      step: 1,
      unit: "second"
    }
  ]
};

// Egyptian War still uses GameHub's embedded client while its browser UI and
// server lifecycle are moved behind the plugin contracts.
export const egyptianWarManifest: GamePluginManifest = {
  apiVersion: gameHubGameApiVersion,
  packageVersion: "1.0.0",
  definition: egyptianWar,
  client: {
    delivery: "embedded"
  }
};
