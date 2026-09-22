export type WorkKind = "download" | "cloud_ai" | "local_render";
export interface WorkItem { id: string; kind: WorkKind }

export class WorkQueues {
  private readonly queues: Record<WorkKind, WorkItem[]> = { download: [], cloud_ai: [], local_render: [] };
  constructor(public readonly concurrency: number) { if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 3) throw new Error("QUEUE_CONCURRENCY_INVALID"); }
  enqueue(item: WorkItem): void { this.queues[item.kind].push(item); }
  take(kind: WorkKind): WorkItem | undefined { return this.queues[kind].shift(); }
}
