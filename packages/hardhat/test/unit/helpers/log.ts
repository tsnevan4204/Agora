/**
 * Verbose console logging for Hardhat + Mocha tests (local developer trace).
 * Emojis make long test runs easy to scan in the terminal.
 */
export function installVerboseHooks(suiteLabel: string): void {
  beforeEach(function () {
    const title = this.currentTest?.title ?? "(unknown test)";
    console.log(`\n${"=".repeat(72)}`);
    console.log(`▶️  [${suiteLabel}] 🏁 START | ${title}`);
  });

  afterEach(function () {
    const title = this.currentTest?.title ?? "(unknown test)";
    const state = this.currentTest?.state ?? "unknown";
    const icon = state === "passed" ? "✅" : state === "failed" ? "❌" : "⏸️ ";
    console.log(`${icon} [${suiteLabel}] 🏁 END   | ${title} | ${state}`);
    console.log(`${"=".repeat(72)}`);
  });
}

/** One-off step line inside a test (amounts, tx intent, etc.). */
export function logStep(message: string, detail?: Record<string, string | number | bigint>): void {
  if (detail && Object.keys(detail).length > 0) {
    const parts = Object.entries(detail).map(([k, v]) => `${k}=${String(v)}`);
    console.log(`  👣 [step] ${message} (${parts.join(", ")})`);
  } else {
    console.log(`  👣 [step] ${message}`);
  }
}
