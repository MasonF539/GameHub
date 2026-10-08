(function initializeEgyptianWarClient(globalScope) {
let currentContext = null;
let currentSettings = {};
let timerInterval = null;

const egyptianWarTurn = document.querySelector("#egyptian-war-turn");
const egyptianWarTurnTimer = document.querySelector("#egyptian-war-turn-timer");
const egyptianWarTurnTimerBar = document.querySelector("#egyptian-war-turn-timer-bar");
const egyptianWarTurnTimerValue = document.querySelector("#egyptian-war-turn-timer-value");
const egyptianWarChallenge = document.querySelector("#egyptian-war-challenge");
const egyptianWarPileCount = document.querySelector("#egyptian-war-pile-count");
const egyptianWarTopCard = document.querySelector("#egyptian-war-top-card");
const egyptianWarPlayers = document.querySelector("#egyptian-war-players");
const egyptianWarArena = document.querySelector("#egyptian-war-arena");
const egyptianWarPileStack = document.querySelector("#egyptian-war-pile-stack");
const egyptianWarPlayCardButton = document.querySelector("#egyptian-war-play-card");
const egyptianWarSlapButton = document.querySelector("#egyptian-war-slap");
const egyptianWarPauseButton = document.querySelector("#egyptian-war-pause");
const egyptianWarExitButton = document.querySelector("#egyptian-war-exit-game");
const egyptianWarHostControls = document.querySelector("#egyptian-war-host-controls");
const egyptianWarSlapRulesList = document.querySelector("#egyptian-war-slap-rules-list");
const toggleSlapRulesButton = document.querySelector("#toggle-slap-rules");
const egyptianWarMessage = document.querySelector("#egyptian-war-message");
const egyptianWarVictory = document.querySelector("#egyptian-war-victory");
const egyptianWarAnimationLayer = document.querySelector("#egyptian-war-animation-layer");
const egyptianWarChat = document.querySelector("#egyptian-war-chat");
const egyptianWarChatForm = document.querySelector("#egyptian-war-chat-form");
const egyptianWarChatInput = document.querySelector("#egyptian-war-chat-input");
const egyptianWarChatMessages = document.querySelector("#egyptian-war-chat-messages");
const egyptianWarSpectators = document.querySelector("#egyptian-war-spectators");
const egyptianWarSpectatorList = document.querySelector("#egyptian-war-spectator-list");
const showGameChatButton = document.querySelector("#show-game-chat");
const showGameSpectatorsButton = document.querySelector("#show-game-spectators");
const toggleGameSidePanelButton = document.querySelector("#toggle-game-side-panel");
const egyptianWarSidePanel = document.querySelector(".egyptian-war-side-panel");

let previousEgyptianWarState = null;
let visibleEgyptianWarCards = [];
let activeEgyptianWarAnimation = null;
let lastEgyptianWarAnimationId = 0;
let egyptianWarAnimationTimeout = null;
let egyptianWarTransferTimeout = null;
let egyptianWarWinnerRevealTimeout = null;
let egyptianWarSoundTimeouts = [];
let revealedEgyptianWarWinnerAnimationId = null;
let egyptianWarTimerDurationMs = 15000;
let egyptianWarTimerRemainingMs = null;
let egyptianWarTimerDeadline = null;

function getAudio() {
  return currentContext?.audio ?? globalScope.GameHubAudio ?? {
    playEffect() {},
    setScene() {}
  };
}

function createKickPlayerButton(member, className) {
  const button = document.createElement("button");
  button.className = className;
  button.type = "button";
  button.textContent = "Kick";
  button.setAttribute("aria-label", `Kick ${member.name}`);
  button.addEventListener("click", async () => {
    const response = await currentContext.removeMember(member.id);
    if (response.message) currentContext.notify(response.message);
  });
  return button;
}
function renderEgyptianWarSlapRules(settings) {
  const rules = [
    settings.includeJokers && "Joker: always slappable",
    settings.allowDoubles && "Doubles: matching consecutive ranks",
    settings.allowSandwiches && "Sandwich: matching ranks with one between",
    settings.allowFourInARow && "Four in a row: ascending/descending sequence",
    settings.allowTopBottom && "Top-bottom: newest matches the first card",
    settings.allowTens && "Tens: number cards total 10",
    settings.allowMarriage && "Marriage: King and Queen consecutively"
  ].filter(Boolean);

  egyptianWarSlapRulesList.replaceChildren();

  for (const rule of rules) {
    const item = document.createElement("li");
    item.textContent = rule;
    egyptianWarSlapRulesList.appendChild(item);
  }

  if (rules.length === 0) {
    const item = document.createElement("li");
    item.textContent = "No slap patterns are enabled.";
    egyptianWarSlapRulesList.appendChild(item);
  }

  const penalty = settings.falseSlapPenaltyCards ?? 2;
  const penaltyItem = document.createElement("li");
  penaltyItem.textContent =
    `False slap: forfeit up to ${penalty} ` +
    `${penalty === 1 ? "card" : "cards"}.`;
  egyptianWarSlapRulesList.appendChild(penaltyItem);
}

function setEgyptianWarTimerHidden(isHidden) {
  egyptianWarTurnTimer.classList.toggle("is-hidden", isHidden);
  egyptianWarTurnTimer.setAttribute(
    "aria-hidden",
    String(isHidden)
  );
}

function clearEgyptianWarSoundTimeouts() {
  for (const timeout of egyptianWarSoundTimeouts) {
    clearTimeout(timeout);
  }

  egyptianWarSoundTimeouts = [];
}

function queueEgyptianWarSound(effectName, delayMs = 0) {
  if (delayMs <= 0) {
    getAudio().playEffect(effectName);
    return;
  }

  const timeout = setTimeout(() => {
    getAudio().playEffect(effectName);
    egyptianWarSoundTimeouts = egyptianWarSoundTimeouts.filter(
      (candidate) => candidate !== timeout
    );
  }, delayMs);
  egyptianWarSoundTimeouts.push(timeout);
}

function renderEgyptianWarTurnTimer() {
  if (egyptianWarTurnTimer.classList.contains("is-hidden")) {
    return;
  }

  const remainingMs = egyptianWarTimerDeadline === null
    ? egyptianWarTimerRemainingMs
    : Math.max(0, egyptianWarTimerDeadline - performance.now());

  if (remainingMs === null) {
    setEgyptianWarTimerHidden(true);
    return;
  }

  const percentRemaining = egyptianWarTimerDurationMs > 0
    ? Math.max(0, Math.min(100,
      remainingMs / egyptianWarTimerDurationMs * 100))
    : 0;
  const secondsRemaining = Math.ceil(remainingMs / 1000);

  egyptianWarTurnTimerBar.style.width = `${percentRemaining}%`;
  egyptianWarTurnTimerValue.textContent = `${secondsRemaining}s`;
  const progress = egyptianWarTurnTimerBar.parentElement;
  progress.setAttribute("aria-valuenow", String(Math.round(percentRemaining)));
}

function showEgyptianWarGame(game) {
  getAudio().setScene("egyptian-war");
  previousEgyptianWarState = null;
  visibleEgyptianWarCards = [];
  activeEgyptianWarAnimation = null;
  lastEgyptianWarAnimationId = 0;
  revealedEgyptianWarWinnerAnimationId = null;
  clearTimeout(egyptianWarAnimationTimeout);
  clearTimeout(egyptianWarTransferTimeout);
  clearTimeout(egyptianWarWinnerRevealTimeout);
  clearEgyptianWarSoundTimeouts();
  egyptianWarAnimationLayer.replaceChildren();
  egyptianWarVictory.hidden = true;
  setEgyptianWarTimerHidden(true);
  egyptianWarTimerRemainingMs = null;
  egyptianWarTimerDeadline = null;
  egyptianWarHostControls.classList.toggle(
    "d-none",
    !currentContext.isHost
  );
  egyptianWarPauseButton.textContent =
    game.isPaused ? "Resume" : "Pause";
  egyptianWarPauseButton.setAttribute(
    "aria-pressed",
    String(game.isPaused === true)
  );
  currentSettings = game.settings ?? currentSettings;
  renderEgyptianWarSlapRules(currentSettings);
  setEgyptianWarSidePanelExpanded(false);
  configureEgyptianWarSidePanel(game.chatEnabled === true);
  egyptianWarChatMessages.replaceChildren();
}

function destroyEgyptianWarGame() {
  clearTimeout(egyptianWarAnimationTimeout);
  clearTimeout(egyptianWarTransferTimeout);
  clearTimeout(egyptianWarWinnerRevealTimeout);
  clearEgyptianWarSoundTimeouts();
  activeEgyptianWarAnimation = null;
  revealedEgyptianWarWinnerAnimationId = null;
  egyptianWarAnimationLayer.replaceChildren();
  egyptianWarVictory.hidden = true;
  setEgyptianWarTimerHidden(true);
  egyptianWarTimerRemainingMs = null;
  egyptianWarTimerDeadline = null;
  egyptianWarChat.hidden = true;
  egyptianWarHostControls.classList.add("d-none");
}

function showEgyptianWarSidePanel(panel) {
  const showChat =
    panel === "chat" && !showGameChatButton.disabled;
  egyptianWarChat.hidden = !showChat;
  egyptianWarSpectators.hidden = showChat;
  showGameChatButton.setAttribute("aria-selected", String(showChat));
  showGameSpectatorsButton.setAttribute(
    "aria-selected",
    String(!showChat)
  );
  showGameChatButton.classList.toggle("btn-light", showChat);
  showGameChatButton.classList.toggle("btn-outline-light", !showChat);
  showGameSpectatorsButton.classList.toggle("btn-light", !showChat);
  showGameSpectatorsButton.classList.toggle(
    "btn-outline-light",
    showChat
  );
}

function configureEgyptianWarSidePanel(chatEnabled) {
  showGameChatButton.disabled = !chatEnabled;
  showEgyptianWarSidePanel(chatEnabled ? "chat" : "spectators");
}

function setEgyptianWarSidePanelExpanded(isExpanded) {
  egyptianWarSidePanel.classList.toggle("is-expanded", isExpanded);
  toggleGameSidePanelButton.setAttribute(
    "aria-expanded",
    String(isExpanded)
  );
  const actionLabel = isExpanded ? "Collapse panel" : "Expand panel";
  toggleGameSidePanelButton.setAttribute("aria-label", actionLabel);
  toggleGameSidePanelButton.title = actionLabel;
  toggleGameSidePanelButton.classList.toggle("is-collapse", isExpanded);
  const chevrons = Array.from({ length: 2 }, () => {
    const line = document.createElement("span");
    line.setAttribute("aria-hidden", "true");
    return line;
  });
  toggleGameSidePanelButton.replaceChildren(...chevrons);
}

function updateEgyptianWarTurnTimer(state) {
  egyptianWarTimerDurationMs = state.turnTimerSeconds * 1000;
  egyptianWarTimerRemainingMs = state.turnTimeRemainingMs;
  egyptianWarTimerDeadline =
    state.status === "playing" &&
      !state.isPaused &&
      !state.isAnimating &&
      state.turnTimeRemainingMs !== null
      ? performance.now() + state.turnTimeRemainingMs
      : null;
  setEgyptianWarTimerHidden(
    state.status !== "playing" ||
    state.isAnimating ||
    state.turnTimeRemainingMs === null
  );
  renderEgyptianWarTurnTimer();
}




function createEgyptianWarCard(card, offset = 0) {
  const rankLabels = {
    jack: "J",
    queen: "Q",
    king: "K",
    ace: "A",
    joker: "J"
  };
  const suitSymbols = {
    clubs: "♣",
    diamonds: "♦",
    hearts: "♥",
    spades: "♠"
  };
  const rankLabel = rankLabels[card.rank] ?? card.rank;
  const suitSymbol = card.suit === null ? "★" : suitSymbols[card.suit];
  const description = card.suit === null
    ? "Joker"
    : `${rankLabel} of ${card.suit}`;
  const cardElement = document.createElement("div");

  cardElement.className = "playing-card";
  cardElement.dataset.cardId = card.id;
  cardElement.setAttribute("role", "img");
  cardElement.setAttribute("aria-label", description);
  cardElement.style.setProperty("--stack-x", `${offset * 12}px`);
  cardElement.style.setProperty("--stack-y", `${Math.abs(offset) * 2}px`);
  cardElement.style.setProperty(
    "--stack-rotation",
    `${offset * 5}deg`
  );

  if (card.suit === "diamonds" || card.suit === "hearts") {
    cardElement.classList.add("is-red");
  }

  if (card.suit === null) {
    cardElement.classList.add("is-joker");
  }

  if (["jack", "queen", "king"].includes(card.rank)) {
    cardElement.classList.add("is-face-card");
  }

  const corner = document.createElement("span");
  corner.className = "playing-card-corner";
  corner.textContent = card.suit === null
    ? "JOKER"
    : `${rankLabel}\n${suitSymbol}`;

  const oppositeCorner = corner.cloneNode(true);
  oppositeCorner.classList.add("is-opposite");

  const center = document.createElement("span");
  center.className = "playing-card-center";

  if (card.suit === null) {
    const jokerMonogram = document.createElement("span");
    jokerMonogram.className = "playing-card-joker-monogram";
    jokerMonogram.textContent = "J";

    const jokerOrnament = document.createElement("span");
    jokerOrnament.className = "playing-card-joker-ornament";
    jokerOrnament.textContent = "★ ◆ ★";
    center.append(jokerMonogram, jokerOrnament);
  } else {
    center.textContent = suitSymbol;
  }

  cardElement.append(corner, center, oppositeCorner);
  return cardElement;
}

function getEgyptianWarCenter(element, within) {
  const rect = element.getBoundingClientRect();
  const parentRect = within.getBoundingClientRect();

  return {
    x: rect.left + rect.width / 2 - parentRect.left,
    y: rect.top + rect.height / 2 - parentRect.top
  };
}

function animateEgyptianWarOutcome(animation) {
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;
  clearEgyptianWarSoundTimeouts();
  egyptianWarAnimationLayer.replaceChildren();
  const arena = document.querySelector("#egyptian-war-arena");
  const center = getEgyptianWarCenter(
    egyptianWarPileStack,
    arena
  );
  const actorSeat = egyptianWarPlayers.querySelector(
    `[data-player-id="${CSS.escape(animation.actorId)}"]`
  );
  const winnerSeat = animation.winnerId
    ? egyptianWarPlayers.querySelector(
      `[data-player-id="${CSS.escape(animation.winnerId)}"]`
    )
    : null;
  const actorCenter = actorSeat
    ? getEgyptianWarCenter(actorSeat, arena)
    : center;
  const winnerCenter = winnerSeat
    ? getEgyptianWarCenter(winnerSeat, arena)
    : center;

  if (
    animation.playedCard &&
    actorSeat &&
    animation.action !== "slap" &&
    !prefersReducedMotion
  ) {
    const directionX = center.x - actorCenter.x;
    const directionY = center.y - actorCenter.y;
    const distance = Math.hypot(directionX, directionY) || 1;
    const normalizedX = directionX / distance;
    const normalizedY = directionY / distance;
    const dealtCard = egyptianWarPileStack.querySelector(
      ".playing-card.is-dealing"
    );
    const dealtCardRect = dealtCard?.getBoundingClientRect();
    const dealtCardWidth = dealtCardRect?.width || 84;
    const dealtCardHeight = dealtCardRect?.height || 120;
    const horizontalEdgeDistance = Math.abs(normalizedX) > 0.001
      ? dealtCardWidth / 2 / Math.abs(normalizedX)
      : Number.POSITIVE_INFINITY;
    const verticalEdgeDistance = Math.abs(normalizedY) > 0.001
      ? dealtCardHeight / 2 / Math.abs(normalizedY)
      : Number.POSITIVE_INFINITY;
    const cardEdgeDistance = Math.min(
      horizontalEdgeDistance,
      verticalEdgeDistance
    );
    const handLandingOffset =
      cardEdgeDistance + dealtCardWidth * 0.22;
    const effectiveHandLandingOffset = Math.min(
      handLandingOffset,
      distance * 0.82
    );
    const handTargetX =
      center.x - normalizedX * effectiveHandLandingOffset;
    const handTargetY =
      center.y - normalizedY * effectiveHandLandingOffset;
    const handTravelX = handTargetX - actorCenter.x;
    const handTravelY = handTargetY - actorCenter.y;
    const rotation =
      Math.atan2(directionY, directionX) * (180 / Math.PI) + 90;
    const hand = document.createElement("span");
    const handGlyph = document.createElement("span");

    hand.className = "egyptian-war-card-play-hand";
    handGlyph.className = "egyptian-war-card-play-hand-glyph";
    handGlyph.textContent = "🖐️";
    hand.appendChild(handGlyph);
    hand.style.left = `${actorCenter.x}px`;
    hand.style.top = `${actorCenter.y}px`;
    hand.style.setProperty(
      "--play-hand-x",
      `${handTravelX}px`
    );
    hand.style.setProperty(
      "--play-hand-y",
      `${handTravelY}px`
    );
    hand.style.setProperty(
      "--play-hand-retreat-x",
      `${handTravelX * 0.82}px`
    );
    hand.style.setProperty(
      "--play-hand-retreat-y",
      `${handTravelY * 0.82}px`
    );
    hand.style.setProperty(
      "--play-hand-rotation",
      `${rotation}deg`
    );
    egyptianWarAnimationLayer.appendChild(hand);
  }

  if (animation.playedCard && animation.action !== "slap") {
    queueEgyptianWarSound(
      "card-play",
      prefersReducedMotion ? 0 : 420
    );
  }

  const slapAttempts =
    Array.isArray(animation.slapAttempts) &&
      animation.slapAttempts.length > 0
      ? animation.slapAttempts
      : [
        {
          playerId: animation.actorId,
          delayMs: 0,
          isWinner: true
        }
      ];

  if (animation.action === "slap") {
    slapAttempts.forEach((attempt, index) => {
      const playerId = attempt.playerId;
      const playerSeat = egyptianWarPlayers.querySelector(
        `[data-player-id="${CSS.escape(playerId)}"]`
      );

      if (!playerSeat) {
        return;
      }

      const playerCenter = getEgyptianWarCenter(
        playerSeat,
        arena
      );

      const directionX = center.x - playerCenter.x;
      const directionY = center.y - playerCenter.y;

      const distance =
        Math.hypot(directionX, directionY) || 1;

      const normalizedX = directionX / distance;
      const normalizedY = directionY / distance;

      // Leave each hand slightly toward its player's table position.
      const visiblePileCard = egyptianWarPileStack.querySelector(
        ".playing-card"
      );
      const renderedCardWidth =
        visiblePileCard?.getBoundingClientRect().width ?? 0;
      const pileOffset = Math.max(14, renderedCardWidth * 0.25);
      const destinationX =
        center.x - normalizedX * pileOffset;
      const destinationY =
        center.y - normalizedY * pileOffset;

      const rotation =
        Math.atan2(directionY, directionX) *
        (180 / Math.PI) +
        90;

      const hand = document.createElement("span");
      hand.className = "egyptian-war-flying-hand";
      const handGlyph = document.createElement("span");
      handGlyph.className = "egyptian-war-flying-hand-glyph";
      handGlyph.textContent = "🖐️";
      hand.appendChild(handGlyph);

      hand.style.left = `${playerCenter.x}px`;
      hand.style.top = `${playerCenter.y}px`;
      hand.style.zIndex = String(5 + index);
      const delayMs =
        !prefersReducedMotion && Number.isFinite(attempt.delayMs)
          ? Math.max(0, attempt.delayMs)
          : 0;

      hand.style.animationDelay = `${delayMs}ms`;

      queueEgyptianWarSound(
        "slap",
        prefersReducedMotion ? 0 : delayMs + 520
      );

      hand.style.setProperty(
        "--hand-x",
        `${destinationX - playerCenter.x}px`
      );

      hand.style.setProperty(
        "--hand-y",
        `${destinationY - playerCenter.y}px`
      );

      hand.style.setProperty(
        "--hand-rotation",
        `${rotation}deg`
      );

      egyptianWarAnimationLayer.appendChild(hand);
    });
  }

  const transferCount = animation.isFinalWin
    ? 24
    : Math.min(
      animation.transferCardCount > 0
        ? animation.transferCardCount
        : animation.penaltyCardCount,
      8
    );
  const isPileTransfer = animation.transferCardCount > 0;
  const source = isPileTransfer
    ? center
    : actorCenter;
  const destination = isPileTransfer
    ? winnerCenter
    : center;

  const showTransfer = () => {
    for (let index = 0; index < transferCount; index += 1) {
      const back = document.createElement("span");
      back.className =
        animation.isFinalWin
          ? "egyptian-war-flying-card is-final-card"
          : isPileTransfer
            ? "egyptian-war-flying-card is-transferring"
            : "egyptian-war-flying-card is-penalty-card";
      back.textContent = animation.isFinalWin ? "★" : "";
      back.style.left = `${source.x + (index % 5) * 3}px`;
      back.style.top = `${source.y + (index % 7) * 2}px`;
      back.style.setProperty(
        "--card-x",
        `${destination.x - source.x}px`
      );
      back.style.setProperty(
        "--card-y",
        `${destination.y - source.y}px`
      );
      back.style.animationDelay = prefersReducedMotion
        ? "0ms"
        : `${animation.isFinalWin ? index * 45 : index * 35}ms`;
      egyptianWarAnimationLayer.appendChild(back);
    }
  };

  const latestSlapDelay = slapAttempts.reduce(
    (latestDelay, attempt) =>
      Math.max(
        latestDelay,
        Number.isFinite(attempt.delayMs)
          ? Math.max(0, attempt.delayMs)
          : 0
      ),
    0
  );

  const lastHandLandingDelay =
    prefersReducedMotion ? 1 : latestSlapDelay + 520;

  const transferDelay = animation.transferCardCount > 0
    ? prefersReducedMotion
      ? 0
      : animation.action === "slap"
        ? lastHandLandingDelay + 250
        : animation.playedCard
          ? 700
          : 350
    : 0;

  clearTimeout(egyptianWarTransferTimeout);

  if (transferCount > 0 && transferDelay > 0) {
    egyptianWarTransferTimeout = setTimeout(
      showTransfer,
      transferDelay
    );
  } else if (transferCount > 0) {
    showTransfer();
  }

  clearTimeout(egyptianWarWinnerRevealTimeout);

  const revealPileWinner = () => {
    revealedEgyptianWarWinnerAnimationId = animation.id;
    const currentWinnerSeat = animation.winnerId
      ? egyptianWarPlayers.querySelector(
        `[data-player-id="${CSS.escape(animation.winnerId)}"]`
      )
      : null;
    currentWinnerSeat?.classList.add("is-pile-winner");

    if (
      animation.action === "slap" &&
      !animation.isFinalWin &&
      typeof animation.activityMessage === "string"
    ) {
      egyptianWarMessage.textContent = animation.activityMessage;
    }

    if (animation.action === "slap") {
      getAudio().playEffect(
        animation.isFinalWin ? "game-win" : "pile-win"
      );
    }
  };

  if (winnerSeat && animation.action === "slap") {
    egyptianWarWinnerRevealTimeout = setTimeout(
      revealPileWinner,
      lastHandLandingDelay
    );
  } else if (winnerSeat) {
    revealPileWinner();
    queueEgyptianWarSound(
      animation.isFinalWin ? "game-win" : "pile-win",
      animation.playedCard && !prefersReducedMotion ? 620 : 0
    );
  }

  if (animation.isFinalWin) {
    const winner = animation.winnerId
      ? animation.players?.find(
        (player) => player.id === animation.winnerId
      )
      : null;
    egyptianWarVictory.hidden = false;
    const collected = document.createElement("span");
    collected.className = "egyptian-war-victory-heading";
    collected.textContent = "ALL CARDS COLLECTED";

    const winnerAvatar = document.createElement("span");
    winnerAvatar.className = "egyptian-war-victory-avatar";
    winnerAvatar.textContent = winner?.avatar ?? "🏆";
    winnerAvatar.setAttribute("aria-hidden", "true");

    const winnerDetails = document.createElement("span");
    winnerDetails.className = "egyptian-war-victory-details";

    const winnerMessage = document.createElement("span");
    winnerMessage.className = "egyptian-war-victory-winner";
    winnerMessage.textContent = winner
      ? `${winner.name} wins!`
      : "Game won!";

    const championLabel = document.createElement("span");
    championLabel.className = "egyptian-war-victory-champion";
    championLabel.textContent = winner
      ? `🏆 Champion • ${winner.cardCount} cards`
      : "🏆 Egyptian War champion";

    winnerDetails.append(collected, winnerMessage, championLabel);
    egyptianWarVictory.replaceChildren(winnerAvatar, winnerDetails);
  }

  const duration = animation.isFinalWin
    ? 3600
    : animation.transferCardCount > 0
      ? 2400
      : animation.action === "slap"
        ? 1050
        : animation.playedCard
          ? 650
          : 450;
  const presentationDuration = prefersReducedMotion
    ? 100
    : duration;

  clearTimeout(egyptianWarAnimationTimeout);
  egyptianWarAnimationTimeout = setTimeout(() => {
    egyptianWarAnimationLayer.replaceChildren();
    clearTimeout(egyptianWarTransferTimeout);
    clearTimeout(egyptianWarWinnerRevealTimeout);
    clearEgyptianWarSoundTimeouts();
    egyptianWarPlayers
      .querySelectorAll(".is-pile-winner")
      .forEach((seat) => seat.classList.remove("is-pile-winner"));
    activeEgyptianWarAnimation = null;
    if (!animation.isFinalWin) {
      egyptianWarVictory.hidden = true;
    }
  }, presentationDuration);
}

function renderEgyptianWarState(state) {
  const previousState = previousEgyptianWarState;
  const animation = activeEgyptianWarAnimation;
  const currentPlayer = state.players.find(
    (player) => player.id === state.currentPlayerId
  );
  const winner = state.players.find(
    (player) => player.id === state.winnerId
  );
  const isNewAnimation =
    animation !== null &&
    animation.id !== lastEgyptianWarAnimationId;
  const isShowingCollectedPile =
    state.isAnimating &&
    animation?.transferCardCount > 0;
  const isWaitingForSlapWinnerReveal =
    animation?.action === "slap" &&
    animation.winnerId !== null &&
    revealedEgyptianWarWinnerAnimationId !== animation.id;

  if (previousState === null) {
    visibleEgyptianWarCards = state.recentCards.map((card) => ({
      card,
      playerId: null
    }));
  }

  updateEgyptianWarTurnTimer(state);

  egyptianWarTurn.textContent = state.isPaused
    ? state.pauseMessage ?? "Game is paused"
    : winner
      ? `${winner.name} wins!`
      : currentPlayer
        ? `${currentPlayer.name}'s turn`
        : "Game complete";

  if (state.challenge) {
    const challenger = state.players.find(
      (player) => player.id === state.challenge.challengerId
    );
    const responder = state.players.find(
      (player) => player.id === state.challenge.responderId
    );

    egyptianWarChallenge.textContent =
      `${challenger?.name ?? "A player"} challenged ` +
      `${responder?.name ?? "the next player"}: ` +
      `${state.challenge.attemptsRemaining} ` +
      `${state.challenge.attemptsRemaining === 1 ? "attempt" : "attempts"} remaining.`;
  } else {
    egyptianWarChallenge.textContent = "";
  }

  const displayedPileCardCount = isShowingCollectedPile
    ? animation.pileCardCountBeforeTransfer
    : state.pileCardCount;

  egyptianWarPileCount.textContent =
    `${displayedPileCardCount} ${displayedPileCardCount === 1 ? "card" : "cards"}`;

  const pileWasCollected =
    previousState !== null &&
    state.pileCardCount < previousState.pileCardCount;

  if (
    !isShowingCollectedPile &&
    (
      state.pileCardCount === 0 ||
      pileWasCollected ||
      !state.hasFaceUpCards
    )
  ) {
    visibleEgyptianWarCards = [];
  }

  const playedCard =
    animation?.playedCard ??
    state.topCard;

  const hasNewCard =
    playedCard !== null &&
    playedCard !== undefined &&
    animation?.playedCard !== null &&
    animation?.playedCard !== undefined &&
    (isNewAnimation || (
      state.pileCardCount > 0 &&
      (previousState === null ||
        (
          state.pileCardCount > previousState.pileCardCount &&
          state.topCard?.id !== previousState.topCard?.id
        ))
    ));

  if (hasNewCard) {
    visibleEgyptianWarCards.push({
      card: playedCard,
      playerId: animation?.actorId ??
        previousState?.currentPlayerId ??
        null
    });

    if (visibleEgyptianWarCards.length > 5) {
      visibleEgyptianWarCards.shift();
    }
  }

  egyptianWarPlayers.replaceChildren();

  const playerCount = state.players.length;

  state.players.forEach((player, index) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * index) / playerCount;
    const seat = document.createElement("div");
    seat.className = "egyptian-war-seat";
    seat.dataset.playerId = player.id;
    seat.classList.toggle("is-current", player.isCurrentPlayer);
    seat.classList.toggle("is-eliminated", player.isEliminated);
    seat.classList.toggle("is-disconnected", !player.isConnected);
    seat.classList.toggle(
      "is-pile-winner",
      animation?.winnerId === player.id &&
      !isWaitingForSlapWinnerReveal
    );
    seat.style.left = `${50 + Math.cos(angle) * 40}%`;
    seat.style.top = `${50 + Math.sin(angle) * 37}%`;

    const avatar = document.createElement("span");
    avatar.className = "player-avatar";
    avatar.textContent = player.avatar;

    const details = document.createElement("div");
    details.className = "egyptian-war-seat-details";

    const name = document.createElement("span");
    name.className = "player-name";
    name.textContent = player.name;

    const cardCount = document.createElement("span");
    cardCount.className = "egyptian-war-card-count";
    cardCount.textContent =
      `${player.cardCount} ${player.cardCount === 1 ? "card" : "cards"}`;
    details.append(name, cardCount);

    if (player.isEliminated) {
      const eliminated = document.createElement("span");
      eliminated.className = "badge text-bg-secondary";
      eliminated.textContent = "Out";
      details.appendChild(eliminated);
    }

    seat.append(avatar, details);
    if (!player.isConnected) {
      const disconnectedActions = document.createElement("div");
      disconnectedActions.className =
        "egyptian-war-disconnected-actions";

      const disconnectedAlert = document.createElement("span");
      disconnectedAlert.className = "badge text-bg-warning";
      disconnectedAlert.textContent = "Disconnected";
      disconnectedActions.appendChild(disconnectedAlert);

      if (currentContext.isHost) {
        disconnectedActions.appendChild(
          createKickPlayerButton(
            player,
            "btn btn-outline-danger btn-sm"
          )
        );
      }

      seat.appendChild(disconnectedActions);
    }
    egyptianWarPlayers.appendChild(seat);
  });

  egyptianWarPileStack
    .querySelectorAll(".playing-card")
    .forEach((card) => card.remove());

  visibleEgyptianWarCards.forEach((visibleCard, index) => {
    const cardElement = createEgyptianWarCard(
      visibleCard.card,
      index - (visibleEgyptianWarCards.length - 1) / 2
    );
    cardElement.style.zIndex = String(index + 1);

    const isLatestCard =
      index === visibleEgyptianWarCards.length - 1 && hasNewCard;

    if (isLatestCard) {
      cardElement.classList.add("is-dealing");
    }

    egyptianWarPileStack.appendChild(cardElement);

    if (isLatestCard && visibleCard.playerId !== null) {
      const sourceSeat = egyptianWarPlayers.querySelector(
        `[data-player-id="${CSS.escape(visibleCard.playerId)}"]`
      );

      if (sourceSeat) {
        const sourceCenter = getEgyptianWarCenter(
          sourceSeat,
          egyptianWarArena
        );
        const targetCenter = getEgyptianWarCenter(
          egyptianWarPileStack,
          egyptianWarArena
        );
        cardElement.style.setProperty(
          "--fly-x",
          `${sourceCenter.x - targetCenter.x}px`
        );
        cardElement.style.setProperty(
          "--fly-y",
          `${sourceCenter.y - targetCenter.y}px`
        );
      }
    }
  });

  egyptianWarTopCard.hidden = visibleEgyptianWarCards.length > 0;
  egyptianWarMessage.textContent = state.status === "finished"
    ? ""
    : isWaitingForSlapWinnerReveal
      ? previousState?.activityMessage ?? ""
      : state.activityMessage;
  egyptianWarPlayCardButton.disabled =
    (currentContext.role === "spectator") ||
    state.status !== "playing" ||
    state.isPaused ||
    state.isAnimating ||
    state.isSlapWindow ||
    state.currentPlayerId !== currentContext.memberId;
  egyptianWarSlapButton.disabled =
    (currentContext.role === "spectator") ||
    state.status !== "playing" ||
    state.isPaused ||
    state.isAnimating ||
    !state.hasFaceUpCards;
  egyptianWarHostControls.classList.toggle(
    "d-none",
    !currentContext.isHost || state.status !== "playing"
  );
  egyptianWarPauseButton.textContent =
    state.isPaused ? "Resume" : "Pause";
  egyptianWarPauseButton.setAttribute(
    "aria-pressed",
    String(state.isPaused)
  );

  if (isNewAnimation) {
    lastEgyptianWarAnimationId = animation.id;
    animateEgyptianWarOutcome({
      ...animation,
      activityMessage: state.activityMessage,
      players: state.players
    });
  }

  previousEgyptianWarState = state;
}


function renderSpectators(spectators) {
  egyptianWarSpectatorList.replaceChildren();
  for (const spectator of spectators) {
    const item = document.createElement("li");
    item.className = "list-group-item d-flex align-items-center gap-3";
    const avatar = document.createElement("span");
    avatar.className = "player-avatar";
    avatar.textContent = spectator.avatar;
    avatar.setAttribute("aria-label", `${spectator.name}'s avatar: ${spectator.avatar}`);
    const name = document.createElement("span");
    name.className = "player-name";
    name.textContent = spectator.name;
    item.append(avatar, name);
    if (!spectator.isConnected) {
      const label = document.createElement("span");
      label.className = "badge text-bg-warning";
      label.textContent = "Disconnected";
      item.appendChild(label);
    }
    if (currentContext.isHost) {
      item.appendChild(createKickPlayerButton(spectator, "btn btn-outline-danger btn-sm ms-auto"));
    }
    egyptianWarSpectatorList.appendChild(item);
  }
}

function renderChatMessage(chatMessage) {
  const item = document.createElement("li");
  item.className = "egyptian-war-chat-message";
  const name = document.createElement("strong");
  name.textContent = `${chatMessage.senderName}: `;
  const message = document.createElement("span");
  message.textContent = chatMessage.message;
  item.append(name, message);
  egyptianWarChatMessages.appendChild(item);
  egyptianWarChatMessages.scrollTop = egyptianWarChatMessages.scrollHeight;
}

toggleSlapRulesButton.addEventListener("click", () => {
  const expanded = toggleSlapRulesButton.getAttribute("aria-expanded") !== "true";
  toggleSlapRulesButton.setAttribute("aria-expanded", String(expanded));
  toggleSlapRulesButton.textContent = expanded ? "Hide" : "Show";
  egyptianWarSlapRulesList.hidden = !expanded;
});
egyptianWarPlayCardButton.addEventListener("click", async () => {
  const response = await currentContext?.submitAction({ type: "play-card" });
  if (response && !response.success) currentContext.notify(response.message);
});
egyptianWarSlapButton.addEventListener("click", async () => {
  const response = await currentContext?.submitAction({ type: "slap" });
  if (response && !response.success) currentContext.notify(response.message);
});
egyptianWarPauseButton.addEventListener("click", async () => {
  if (!currentContext?.isHost) return;
  const isPaused = egyptianWarPauseButton.getAttribute("aria-pressed") !== "true";
  const response = await currentContext.requestPause(isPaused);
  if (!response.success) currentContext.notify(response.message);
});
egyptianWarExitButton.addEventListener("click", () => currentContext?.requestExit());
egyptianWarChatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = egyptianWarChatInput.value.trim();
  const response = await currentContext.sendChat(message);
  if (!response.success) currentContext.notify(response.message);
  else egyptianWarChatInput.value = "";
});
showGameChatButton.addEventListener("click", () => showEgyptianWarSidePanel("chat"));
showGameSpectatorsButton.addEventListener("click", () => showEgyptianWarSidePanel("spectators"));
toggleGameSidePanelButton.addEventListener("click", () => {
  setEgyptianWarSidePanelExpanded(!egyptianWarSidePanel.classList.contains("is-expanded"));
});

const egyptianWarClientModule = {
  mount(context) {
    currentContext = context;
    currentSettings = context.launchData.settings ?? {};
    showEgyptianWarGame(context.launchData);
    timerInterval = setInterval(renderEgyptianWarTurnTimer, 100);
    return {
      receiveState: renderEgyptianWarState,
      receiveEvent(event) {
        if (event.type === "animation") activeEgyptianWarAnimation = event.payload;
        if (event.type === "pause-changed") {
          const paused = Boolean(event.payload?.isPaused);
          egyptianWarPauseButton.textContent = paused ? "Resume" : "Pause";
          egyptianWarPauseButton.setAttribute("aria-pressed", String(paused));
        }
      },
      receivePlatformEvent(event) {
        if (event.type === "spectators") renderSpectators(event.payload);
        if (event.type === "chat-message") renderChatMessage(event.payload);
      },
      destroy() {
        destroyEgyptianWarGame();
        clearInterval(timerInterval);
        timerInterval = null;
        currentContext = null;
      }
    };
  }
};

globalScope.GameHubRegisterGameClientModule?.("egyptian-war", egyptianWarClientModule);
if (typeof module !== "undefined" && module.exports) {
  module.exports = { animateEgyptianWarOutcome, egyptianWarClientModule };
}
})(typeof window === "undefined" ? globalThis : window);
