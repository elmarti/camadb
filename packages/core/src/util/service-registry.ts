export class ServiceRegistry {
  private readonly services = new Map<symbol, unknown>();

  set<T>(key: symbol, value: T): this {
    this.services.set(key, value);
    return this;
  }

  get<T>(key: symbol): T {
    if (!this.services.has(key)) {
      throw new Error(`Service is not registered: ${String(key)}`);
    }
    return this.services.get(key) as T;
  }
}
