export class PipelineError extends Error {
  constructor(public readonly code: string, public readonly publicMessage: string) { super(publicMessage); this.name = "PipelineError"; }
}
