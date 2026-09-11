export class TranslatorTtsAttemptRegistry {
  private readonly autoplayTurnIds = new Set<string>();
  private readonly failureAttemptIds = new Set<string>();

  claimAutoplay(turnId: string) {
    if (this.autoplayTurnIds.has(turnId)) return false;
    this.autoplayTurnIds.add(turnId);
    return true;
  }

  releaseAutoplay(turnId: string) {
    this.autoplayTurnIds.delete(turnId);
  }

  claimFailureEvent(attemptId: string) {
    if (this.failureAttemptIds.has(attemptId)) return false;
    this.failureAttemptIds.add(attemptId);
    return true;
  }

  reset() {
    this.autoplayTurnIds.clear();
    this.failureAttemptIds.clear();
  }
}
