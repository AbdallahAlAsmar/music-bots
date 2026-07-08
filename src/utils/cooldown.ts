export class CooldownGuard {
  private readonly entries = new Map<string, number>();

  constructor(private readonly cooldownMs: number) {}

  hit(key: string): boolean {
    const now = Date.now();
    const until = this.entries.get(key) ?? 0;
    if (until > now) {
      return false;
    }
    this.entries.set(key, now + this.cooldownMs);
    return true;
  }
}
