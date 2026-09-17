// audit-core#304 moved manual verification off Audit onto the Task Queue
// (MANUAL_VERIFICATION_REVIEW task, resolved entirely through the standalone
// Documents page's own field-correction flow -- see that PR's module
// docstring). The dedicated GET/resolve endpoints this file used to call
// were never actually wired to any UI and are gone; this helper survives
// because ReviewQueuePage.tsx still uses it to recognize the rule-key shape
// a MANUAL_VERIFICATION_REVIEW task's payload carries, same as it did for
// the finding this task type replaced.
export function isManualVerificationRule(ruleKey: string | null | undefined): boolean {
  return Boolean(ruleKey && ruleKey.startsWith('MANUAL_VERIFICATION:'));
}
