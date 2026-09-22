import type { Provider, ProviderResult } from "./types.js";

export interface JsonHttpProviderOptions<T, I> {
  headers?(apiKey: string): Record<string, string>;
  body?(input: I, model: string): unknown;
  parse?(response: unknown): T;
}

export class JsonHttpProvider<T, I> implements Provider<T, I> {
  readonly #apiKey: string;

  constructor(public readonly id: string, private readonly model: string, private readonly endpoint: string, apiKey: string, private readonly options: JsonHttpProviderOptions<T, I> = {}) {
    this.#apiKey = apiKey;
  }

  async run(input: I, signal: AbortSignal): Promise<ProviderResult<T>> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: { ...(this.options.headers?.(this.#apiKey) ?? { authorization: `Bearer ${this.#apiKey}` }), "content-type": "application/json" },
      body: JSON.stringify(this.options.body?.(input, this.model) ?? input),
      signal,
    });
    if (!response.ok) throw new Error(response.status === 429 ? "PROVIDER_QUOTA" : "PROVIDER_ERROR");
    const json: unknown = await response.json();
    return { providerId: this.id, model: this.model, value: this.options.parse ? this.options.parse(json) : json as T };
  }
}
