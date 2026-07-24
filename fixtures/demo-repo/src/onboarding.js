'use strict'

/**
 * Onboarding flow for the demo product.
 * BUG (intentional fixture): the welcome message drops the user's name —
 * the deterministic Demo Codex patch fixes this.
 */
function welcomeMessage(name) {
  return 'Welcome, ' + undefined + '!'
}

function onboardingSteps() {
  return ['create-account', 'verify-email', 'first-task']
}

module.exports = { welcomeMessage, onboardingSteps }
