import { NightControlRequestError, type NightFeatureKey, type NightFeatureSetting } from '../../services/security/nightControl';

export const ALL_FEATURES = '__ALL__';

/** "All features" for a grant without a feature, else the feature's label (or its key). */
export function grantFeatureLabel(featureKey: NightFeatureKey | null, features: Array<Pick<NightFeatureSetting, 'featureKey' | 'label'>>): string {
  if (featureKey === null) return 'All features';
  return features.find((f) => f.featureKey === featureKey)?.label || featureKey;
}

/** What is wrong with a note, if anything (Security wants 3 to 500 characters). */
export function noteProblem(note: string): string | undefined {
  const length = note.trim().length;
  if (length < 3) return 'Write a note of at least 3 characters.';
  if (length > 500) return 'Keep the note within 500 characters.';
  return undefined;
}

/** Whether HH:MM is a valid India time for a start or end. */
export function isHhMm(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value.trim());
}

/** The message a SuperAdmin reads when giving access fails. */
export function grantErrorMessage(error: unknown): string {
  if (error instanceof NightControlRequestError) {
    if (error.status === 409) return 'This person already has this access.';
    if (error.status === 404) return 'This person or feature was not found. Refresh and try again.';
    if (error.status === 403) return 'Only SuperAdmin can give night access.';
  }
  return error instanceof Error && error.message ? error.message : 'Access could not be given. Please try again.';
}

/** The message a SuperAdmin reads when removing access fails. */
export function revokeErrorMessage(error: unknown): string {
  if (error instanceof NightControlRequestError && error.status === 404) return 'This access was already removed. The list has been refreshed.';
  return error instanceof Error && error.message ? error.message : 'Access could not be removed. Please try again.';
}
