export class AgentPollingLoop {
  constructor(
    private readonly runtime: { runOnce(): Promise<boolean> },
    private readonly dependencies: { sleep(milliseconds: number, signal: AbortSignal): Promise<void>; onError(error: unknown): void } = {
      sleep: abortableSleep,
      onError: () => undefined,
    },
  ) {}

  async run(signal: AbortSignal): Promise<void> {
    let failures = 0;
    while (!signal.aborted) {
      try {
        const processed = await this.runtime.runOnce();
        failures = 0;
        if (!processed) await this.dependencies.sleep(2_000, signal);
      } catch (error) {
        if (signal.aborted) return;
        this.dependencies.onError(error);
        failures += 1;
        await this.dependencies.sleep(Math.min(30_000, 1_000 * 2 ** (failures - 1)), signal);
      }
    }
  }
}

function abortableSleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}
