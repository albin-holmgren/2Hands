'use strict'

const assert = require('node:assert')
const { welcomeMessage, onboardingSteps } = require('../src/onboarding')

let failures = 0

function check(fn, label) {
  try {
    fn()
    console.log(`ok - ${label}`)
  } catch (error) {
    failures++
    console.log(`not ok - ${label}: ${error.message}`)
  }
}

check(() => assert.strictEqual(welcomeMessage('Ada'), 'Welcome, Ada!'), 'welcomeMessage greets the user by name')
check(() => assert.deepStrictEqual(onboardingSteps(), ['create-account', 'verify-email', 'first-task']), 'onboardingSteps ordered')

if (failures > 0) {
  console.log(`FAILED: ${failures} test(s)`)
  process.exit(1)
}
console.log('PASSED: all tests')
