const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const hubCss = readFileSync(path.join(__dirname, "../public/style.css"), "utf8").replace(/\r\n/g, "\n");

// A rule block for an exact selector, e.g. ".foo::before".
function ruleBody(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`));
  return match ? match[1] : null;
}

test("the hub header styles its connection dot", () => {
  // Game stylesheets stay disabled until a game starts, so anything that
  // styles hub markup must live in the hub stylesheet.
  const dot = ruleBody(hubCss, ".server-connection-status::before");
  assert.ok(dot, "hub css must style the connection dot");
  assert.match(dot, /border-radius:\s*50%/);
  assert.ok(ruleBody(hubCss, ".server-connection-status.text-bg-success::before"));
  assert.ok(ruleBody(hubCss, ".server-connection-status.text-bg-danger::before"));
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

test("in-game utility controls do not apply the phone safe area twice", () => {
  const controls = ruleBody(
    hubCss,
    "#gameplay-view>.app-utility-controls"
  );
  assert.match(controls ?? "", /top:\s*var\(--hub-toolbar-top\)/);
  assert.match(controls ?? "", /right:\s*var\(--hub-toolbar-edge\)/);
  assert.doesNotMatch(controls ?? "", /safe-area-inset/);
});


test("main menu and lobby retain their shared fluid sizing independently of blur", () => {
  const sizing = ruleBody(hubCss, "#entry-view,\n#lobby-view");
  assert.match(sizing ?? "", /width:\s*100%/);
  assert.match(sizing ?? "", /flex:\s*0 1 auto/);
  assert.doesNotMatch(sizing ?? "", /backdrop-filter/);
});
