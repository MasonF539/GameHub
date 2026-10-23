window.GameHubRegisterGameClientModule("fixture-game", {
  mount(context) {
    const root = context.root.querySelector("#fixture-game-view");
    return {
      receiveState(state) { root.textContent = `Actions: ${state.actionCount}`; },
      receiveEvent() {},
      destroy() { root.textContent = ""; }
    };
  }
});
export {};
