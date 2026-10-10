const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const hubCss = readFileSync(path.join(__dirname, "../public/style.css"), "utf8");
const gameCss = readFileSync(
  path.join(__dirname, "../games/egyptian-war/public/style.css"),
  "utf8"
);

// A rule block for an exact selector, e.g. ".foo::before".
function ruleBody(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`));
  return match ? match[1] : null;
}

test("the hub header's connection dot is styled by the hub, not by a game", () => {
  // Game stylesheets stay disabled until a game starts, so anything that
  // styles hub markup must live in the hub stylesheet.
  const dot = ruleBody(hubCss, ".server-connection-status::before");
  assert.ok(dot, "hub css must style the connection dot");
  assert.match(dot, /border-radius:\s*50%/);
  assert.ok(ruleBody(hubCss, ".server-connection-status.text-bg-success::before"));
  assert.ok(ruleBody(hubCss, ".server-connection-status.text-bg-danger::before"));
  assert.equal(
    gameCss.includes(".server-connection-status"),
    false,
    "game css must not own the hub's connection indicator"
  );
});

test("a game's plugin root does not add a layout box around its panel", () => {
  // Without this the game's height: 100% chain collapses and the board
  // (which is sized by flex growth) ends up with no height at all.
  assert.match(ruleBody(hubCss, "[data-game-plugin-root]") ?? "", /display:\s*contents/);
  assert.match(
    ruleBody(hubCss, "[data-game-plugin-root][hidden]") ?? "",
    /display:\s*none/
  );
});
