/**
 * Model-Aware Pricing Engine
 *
 * Replaces the flat tokensPerCredit heuristic with real model-cost-based
 * credit calculation. Applies dynamic margins per model to maximize
 * profitability while keeping the default route cheap for users.
 */

import { getModel, getDefaultModel, type ModelEntry } from './model-registry'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreditCalculation {
  /** Model used */
  modelId: string
  /** Raw provider cost in USD cents */
  rawCostCents: number
  /** Credits to charge the user */
  credits: number
  /** Effective margin multiplier applied */
  marginApplied: number
  /** Breakdown for logging */
  breakdown: {
    inputTokens: number
    outputTokens: number
    inputCostCents: number
    outputCostCents: number
    totalCostCents: number
    marginMultiplier: number
    floor: number
    ceiling: number
  }
}

// ---------------------------------------------------------------------------
// Core pricing function
// ---------------------------------------------------------------------------

/**
 * Calculate credits to charge for an AI completion.
 *
 * Formula:
 *   raw_cost = (input_tokens × input_price + output_tokens × output_price) / 1_000_000
 *   raw_cost_cents = raw_cost × 100
 *   credits = clamp(floor, ceil(raw_cost_cents × margin_multiplier), ceiling)
 */
export function calculateModelCredits(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): CreditCalculation {
  const model = getModel(modelId) || getDefaultModel()

  const inputCostUsd = (inputTokens * model.pricing.inputPer1M) / 1_000_000
  const outputCostUsd = (outputTokens * model.pricing.outputPer1M) / 1_000_000
  const totalCostUsd = inputCostUsd + outputCostUsd
  const totalCostCents = totalCostUsd * 100

  const rawCredits = Math.ceil(totalCostCents * model.margin.multiplier)
  const credits = Math.max(model.margin.floor, Math.min(rawCredits, model.margin.ceiling))

  return {
    modelId: model.id,
    rawCostCents: Math.round(totalCostCents * 10000) / 10000, // 4 decimal places
    credits,
    marginApplied: model.margin.multiplier,
    breakdown: {
      inputTokens,
      outputTokens,
      inputCostCents: Math.round(inputCostUsd * 100 * 10000) / 10000,
      outputCostCents: Math.round(outputCostUsd * 100 * 10000) / 10000,
      totalCostCents: Math.round(totalCostCents * 10000) / 10000,
      marginMultiplier: model.margin.multiplier,
      floor: model.margin.floor,
      ceiling: model.margin.ceiling,
    },
  }
}

/**
 * Estimate credits before a request (for budget gating / UI hints).
 * Uses average token estimates based on model and task type.
 */
export function estimateCredits(
  modelId: string,
  estimatedInputTokens: number,
  estimatedOutputTokens: number,
): number {
  const result = calculateModelCredits(modelId, estimatedInputTokens, estimatedOutputTokens)
  return result.credits
}

/**
 * Get the raw provider cost in USD cents for logging/analytics.
 */
export function getProviderCostCents(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const model = getModel(modelId) || getDefaultModel()
  const inputCostUsd = (inputTokens * model.pricing.inputPer1M) / 1_000_000
  const outputCostUsd = (outputTokens * model.pricing.outputPer1M) / 1_000_000
  return (inputCostUsd + outputCostUsd) * 100
}

/**
 * Legacy compatibility: flat token-to-credit conversion.
 * Used as a fallback when model ID is unknown or for backward compat.
 */
export function calculateCreditsFlat(totalTokens: number): number {
  const BASE = 5  // minimum per turn
  const TOKENS_PER_CREDIT = 1000
  return Math.max(BASE, Math.ceil(totalTokens / TOKENS_PER_CREDIT))
}
