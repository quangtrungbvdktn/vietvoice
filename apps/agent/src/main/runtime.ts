export interface ClaimedJob {
  id: string;
  leaseId: string;
  projectId?: string;
  sourceIds: string[];
  mode: "translate_subtitle" | "translate_dub";
  concurrency: number;
}

export interface CompletedArtifact { path: string; sha256: string }

export class AgentRuntime {
  constructor(
    private readonly configuration: { apiUrl: string; deviceToken: string },
    private readonly dependencies: { request: typeof fetch; execute(job: ClaimedJob): Promise<CompletedArtifact> },
  ) {}

  async runOnce(): Promise<boolean> {
    const headers = { authorization: `Bearer ${this.configuration.deviceToken}` };
    const claim = await this.dependencies.request(`${this.baseUrl()}/v1/agent/jobs/claim`, { method: "POST", headers });
    if (claim.status === 204) return false;
    if (!claim.ok) throw new Error(`AGENT_CLAIM_FAILED_${claim.status}`);
    const job = await claim.json() as ClaimedJob;
    let artifact: CompletedArtifact;
    try {
      artifact = await this.dependencies.execute(job);
    } catch (error) {
      const failure = publicFailure(error);
      const failed = await this.dependencies.request(`${this.baseUrl()}/v1/agent/jobs/${job.id}/fail`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ leaseId: job.leaseId, ...failure }),
      });
      if (!failed.ok) throw new Error(`AGENT_FAIL_REPORT_FAILED_${failed.status}`);
      return true;
    }
    const completed = await this.dependencies.request(`${this.baseUrl()}/v1/agent/jobs/${job.id}/complete`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ leaseId: job.leaseId, artifact }),
    });
    if (!completed.ok) throw new Error(`AGENT_COMPLETE_FAILED_${completed.status}`);
    return true;
  }

  private baseUrl(): string { return this.configuration.apiUrl.replace(/\/$/, ""); }
}

function publicFailure(error: unknown): { code: string; message: string } {
  if (!error || typeof error !== "object") return { code: "JOB_FAILED", message: "Xử lý video thất bại. Hãy thử lại." };
  const candidate = error as { code?: unknown; publicMessage?: unknown };
  const code = typeof candidate.code === "string" && /^[A-Z0-9_]{1,64}$/.test(candidate.code) ? candidate.code : "JOB_FAILED";
  const message = typeof candidate.publicMessage === "string" && candidate.publicMessage.length <= 500
    ? candidate.publicMessage
    : "Xử lý video thất bại. Hãy thử lại.";
  return { code, message };
}
