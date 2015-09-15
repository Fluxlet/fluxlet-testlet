// # Testlet

// A **given**/**when**/**then** style testing framework for fluxlets.
//
// Example of usage inside a Jasmine test case:
//
//     given
//         .fluxlet()
//         .validator(validateState)
//         .state(initialState)
//         .actions({ setWords })
//         .calculations({ countWords })
//
//     when.setWords("Hello World")
//
//     then(state => {
//         expect(state.words).toBe("Hello World")
//         expect(state.count).toBe(2)
//     })
//
// Although in reality, you'd probably do most of the *given* calls in a
// *beforeEach*.
//

import fluxlet, { extend } from "fluxlet"

// ## API
//
// Note most of the API is initially undefined, it will be initialised by the
// reset() function and modified at various other stages.

// ### Given
//
// Expose methods to setup the fluxlet.
//
// Initially a fluxlet must be created with the .fluxlet() call before any
// other methods.
//
//    given
//        .fluxlet()
//        .validator(validateState)
//
// Once a fluxlet has been created, any other methods can be called directly
// from the given:
//
//    given.state({ foo: 1 })
//
export let given

// ### When
//
// Returns all dispatchers from the fluxlet for calling within the test, eg:
//
//     when.someAction("foo")
//
export let when

// ### Then
//
// Call a fn passing the new and previous state, in which assertions can be
// performed about the expected state, eg:
//
//     then(state => {
//         expect(state.foo).toBe("bar")
//     })
//
export let then

// Register a conditional side effect in which to perform assertions, useful
// for async tests using the done function passed in by jasmine, eg:
//
//     const fooHasChanged = (state, prev) => state.foo !== prev.foo
//
//     describe("something", (done) => {
//         ...
//         waitUntil(fooHasChanged).then(state => {
//             expect(state.foo).toBe("bar")
//             done()
//         })
//     })
//
export let waitUntil

// ### Spies
//
// All actions, calculations and side effects are wrapped in spies, and this
// provides access to those for use in expect calls, eg:
//
//     expect(spy.action.someAction).toHaveBeenCalled();
//     expect(spy.action.someCalculation.then).toHaveBeenCalled();
//
export const spy = {
    action: {},
    calculation: {},
    sideEffect: {}
}

// Wrap all named functions or when & then of fluxlet conditionals in a spy and
// register the spy
export function spyOn(type, namedConditionals) {
    return Object.keys(namedConditionals).reduce((ret, name) => {
        spy[type][name] = ret[name] = fluxletSpy(type, name, namedConditionals[name])
        return ret
    }, {})
}

// A no-operation mock action
export const mockAction = () => state => state

// ### Initialise
// This should be called in beforeEach to initialise the state of the API
// a spy creation function can be passed in the opts object.
//
// For Sinon spies:
//
//     initTestlet({
//       createSpy(desc, fn) {
//         fn.displayName = desc
//         return sinon.spy(fn)
//       }
//     })
//
// For Jasmine spies:
//
//     initTestlet({
//       createSpy(desc, fn) {
//         jasmine.createSpy(desc, fn).and.callThrough()
//       }
//     })
//
export function initTestlet(opts = {}) {
    createSpy = opts.createSpy || ((desc, fn) => fn)
    instance = undefined
    Object.keys(spy).forEach(key => spy[key] = {})
    given = createGiven()
    when = undefined
    then = unavailableFn("then")
    waitUntil = unavailableFn("waitUntil")
}

// ## Internals

// Holds the fluxlet created by *given.fluxlet()*
let instance

// Holds the spy creation function passed into *initTestlet()*
let createSpy

// ### Given
function createGiven() {
    if (!instance) {
        return {
            // Create a fluxlet for testing against
            fluxlet() {
                instance = fluxlet()
                // Register a side effect that gathers the state and end
                // states that are passed to the side effects after the
                // action and calculation fns have been called in a dispatch.
                .sideEffects({
                    gatherState: (...args) => {
                        then = createThen(...args)
                    }
                })

                given = createGiven()
                waitUntil = createWaitUntil()

                return given
            },

            // Other methods will throw an error if called before the fluxlet
            // has been created
            logging: unavailableFn("logging"),
            validator: unavailableFn("validator"),
            state: unavailableFn("state"),
            actions: unavailableFn("actions"),
            calculations: unavailableFn("calculations"),
            sideEffects: unavailableFn("sideEffects")
        }
    } else {
        return {
            // Throw an error if the fluxlet has already been created
            fluxlet() {
                throw new Error("a fluxlet has already been created")
            },

            // Adjust logging levels
            logging(categories) {
                instance.logging(categories)
                return given
            },

            // Set the state validator function, this should be called before
            // setting the initial state
            validator(validator) {
                instance.validator(validator)
                return given
            },

            // Set the initial state.
            // Generally called in a beforeEach with the default state, but may
            // also be called in individual test cases with a function to
            // override parts of the default state.
            state(initialState) {
                instance.state(initialState)
                const state = instance.debug.state()
                then = createThen(state, state)
                return given
            },

            // Register actions for testing
            actions(namedActions) {
                instance.actions(spyOn("action", namedActions))
                when = createWhen()
                return given
            },

            // Register calculations for testing
            calculations(namedCalculations) {
                instance.calculations(spyOn("calculation", namedCalculations))
                return given
            },

            // Register side effects for testing
            sideEffects(namedSideEffects) {
                instance.sideEffects(spyOn("sideEffect", namedSideEffects))
                return given
            }
        }
    }
}

// ### When
function createWhen() {
    return instance.debug.dispatchers()
}

// ### Then
function createThen(...args) {
    return fn => fn(...args)
}

// ### WaitUntil
function createWaitUntil() {
    return when => ({
        then(then) {
            instance.sideEffects({
                testExpectedStateChange: { when, then }
            })
        }
    })
}

// ### API Helper
// Create the stubs for function unavailable prior to fluxlet creation
function unavailableFn(fnName) {
    return () => {
        throw new Error(`Cannot call '${fnName}' until a fluxlet has been created`)
    }
}

// ### Spies
// Create the spy for an individual action, calculation or side-effect
function fluxletSpy(type, name, fnOrCond) {

    function spy(fn, suffix) {
        return fn ? createSpy(suffix ? `${type} ${name}.${suffix}` : `${type} ${name}`, fn) : undefined
    }

    if (typeof fnOrCond === "object") {
        return extend({}, fnOrCond, {
            when: spy(fnOrCond.when, 'when'),
            then: spy(fnOrCond.then, 'then')
        })
    } else {
        return spy(fnOrCond)
    }
}
