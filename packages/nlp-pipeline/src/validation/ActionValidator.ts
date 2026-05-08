import { RawAction } from '../claude/ClaudeExtractor';
import { ActionType, ActionUrgency } from '@ehr/shared';

export interface ScoredAction {
  type: ActionType;
  details: Record<string, unknown>;
  verbatim_source: string;
  urgency: ActionUrgency;
  confidence: number;
}

/**
 * Assigns a confidence score (0.0–1.0) to each extracted action.
 * This is a heuristic — Claude does not provide calibrated probabilities.
 *
 * High (0.9+):  clear verbatim source, rich details
 * Medium (0.7–0.9): action present but details sparse
 * Low (<0.7):   weak verbatim source or minimal details — flagged for human review
 */
export function scoreAction(action: RawAction): ScoredAction {
  let score = 0.9;

  // Deduct if verbatim source is too short to be meaningful
  if (!action.verbatim_source || action.verbatim_source.trim().length < 5) {
    score -= 0.1;
  }

  // Deduct if details object is sparse
  if (Object.keys(action.details ?? {}).length < 2) {
    score -= 0.1;
  }

  // Deduct if follow_up has no timeframe
  if (action.type === 'follow_up' && !action.details?.timeframe) {
    score -= 0.1;
  }

  // Deduct if medication action has no medication name
  if (
    ['medication_change', 'new_medication', 'discontinue_medication'].includes(action.type) &&
    !action.details?.medication_name
  ) {
    score -= 0.1;
  }

  return {
    ...action,
    confidence: Math.max(0.0, Math.min(1.0, score)),
  };
}

export function scoreAll(actions: RawAction[]): ScoredAction[] {
  return actions.map(scoreAction);
}
