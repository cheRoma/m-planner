import { Injectable } from "@nestjs/common";

// Минимальный in-process счётчик (§11.8). Позже можно экспортировать в Prometheus.
@Injectable()
export class MetricsService {
  private counters = new Map<string, number>();
  inc(name: string, by = 1): void { this.counters.set(name, (this.counters.get(name) ?? 0) + by); }
  snapshot(): Record<string, number> { return Object.fromEntries(this.counters); }
}
