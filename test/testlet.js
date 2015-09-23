import chai, { expect } from 'chai'
import sinon from 'sinon'
import sinonChai from 'sinon-chai'
import { initTestlet, given, when, then, waitUntil, mockAction, spy, spyOn } from 'src/testlet'

chai.use(sinonChai)

function expectFnToBeUnavailable(exec, name) {
    it(`'${name}' throws an error`, () => {
        expect(() => {
            exec()
        }).to.throw(Error, `Cannot call '${name}' until a fluxlet has been created`)
    })
}

describe("Testlet", () => {

    beforeEach(() => {
        initTestlet({
            createSpy(desc, fn) {
                fn.displayName = desc
                return sinon.spy(fn)
            }
        })
    })

    describe("given", () => {
        describe("(before fluxlet creation)", () => {
            expectFnToBeUnavailable(() => given.logging({}), "logging")
            expectFnToBeUnavailable(() => given.validator(null), "validator")
            expectFnToBeUnavailable(() => given.state({}), "state")
            expectFnToBeUnavailable(() => given.actions({}), "actions")
            expectFnToBeUnavailable(() => given.calculations({}), "calculations")
            expectFnToBeUnavailable(() => given.sideEffects({}), "sideEffects")
        })

        it("exposes a fluent API after creating the fluxlet", () => {
            expect(
                given.fluxlet()
                    .logging({})
                    .validator(null)
                    .state({})
                    .actions({})
                    .calculations({})
                    .sideEffects({})
                ).to.eql(given)
        })

        it("'fluxlet' throws an error if called again", () => {
            given.fluxlet()

            expect(() => {
                given.fluxlet()
            }).to.throw(Error, "a fluxlet has already been created")
        })
    })

    describe("(before fluxlet creation)", () => {
        expectFnToBeUnavailable(() => then(() => {}), "then");
        expectFnToBeUnavailable(() => waitUntil(() => {}), "waitUntil");
    })

    describe("example", () => {
        beforeEach(() => {
            let output

            const incAction = n => state => n === 0 ? state : ({
                counter: state.counter + n,
                multiple: state.multiple
            })

            const incLaterAction = n => state => ({
                counter: state.counter,
                multiple: state.multiple,
                delayedInc: n
            })

            const timesTenCalc = {
                when: (state, prev) => state.counter !== prev.counter,
                then: state => ({
                    counter: state.counter,
                    multiple: state.counter * 10
                })
            }

            const aSideEffect = {
                when: (state, prev) => state.multiple !== prev.multiple,
                then: state => {
                    output = state.multiple
                }
            }

            const aSideEffectWithoutWhen = {
                then: (state, prev) => {
                    console.log(prev, '->', state)
                }
            }

            const callIncAfterDelaySideEffect = {
                when: (state, prev) => state.delayedInc && state.delayedInc !== prev.delayedInc,
                then: (state, prev, { incAction }) => {
                    setTimeout(() => {
                        incAction(state.delayedInc)
                    }, 100)
                }
            }

            given
                .fluxlet()
                .logging({ timing: true })
                .validator(() => {})
                .state({
                    counter: 0,
                    multiple: 0
                })
                .actions({
                    incAction,
                    incLaterAction,
                    doNothing: mockAction
                })
                .calculations({
                    timesTenCalc
                })
                .sideEffects({
                    aSideEffect,
                    aSideEffectWithoutWhen,
                    callIncAfterDelaySideEffect
                })
        })

        describe("when & action spy", () => {
            it("has been called when the action is dispatched", () => {
                when.incAction(0)

                expect(spy.action.incAction).to.have.been.called
            })
        })

        describe("then", () => {
            it("calls its function param with new and prev state", () => {
                when.incAction(1)

                then((state, prev) => {
                    expect(state).to.be.defined
                    expect(prev).to.be.defined
                    expect(state).not.to.eql(prev)
                    expect(prev.counter).to.equal(0)
                    expect(state.counter).to.equal(1)
                })
            })
        })

        describe("calculation spy", () => {
            it("'then' is not called if 'when' was false", () => {
                when.incAction(0)

                then((state, prev) => {
                    expect(spy.calculation.timesTenCalc.when).to.have.been.called
                    expect(spy.calculation.timesTenCalc.when).to.have.returned(false)
                    expect(spy.calculation.timesTenCalc.then).not.to.have.been.called
                })
            })

            it("'then' is called if 'when' was true", () => {
                when.incAction(1)

                then((state, prev) => {
                    expect(spy.calculation.timesTenCalc.when).to.have.been.called
                    expect(spy.calculation.timesTenCalc.when).to.have.returned(true)
                    expect(spy.calculation.timesTenCalc.then).to.have.been.called
                })
            })
        })

        describe("sideEffect spy", () => {
            it("'when' is not called if state didn't change", () => {
                when.incAction(0)

                then((state, prev) => {
                    expect(spy.sideEffect.aSideEffect.when).not.to.have.been.called
                })
            })

            it("'when' is called if state has changed", () => {
                when.incAction(1)

                then((state, prev) => {
                    expect(spy.sideEffect.aSideEffect.when).to.have.been.called
                })
            })

            it("'then' is called if 'when' was true", () => {
                when.incAction(1)

                then((state, prev) => {
                    expect(spy.sideEffect.aSideEffect.when).to.have.returned(true)
                    expect(spy.sideEffect.aSideEffect.then).to.have.been.called
                })
            })

            it("copes with conditional without a 'when'", () => {
                when.incAction(1)

                then((state, prev) => {
                    expect(spy.sideEffect.aSideEffectWithoutWhen.then).to.have.been.called
                })
            })
        })

        describe("mockAction", () => {
            it("does nothing", () => {
                when.doNothing()

                then((state, prev) => {
                    expect(state).to.eql(prev)
                })
            })
        })

        describe("waitUntil", () => {
            it("will wait until the state becomes an expected state", (done) => {
                when.incLaterAction(5)

                then((state, prev) => {
                    expect(state.counter).to.equal(prev.counter)
                    expect(state.multiple).to.equal(prev.multiple)
                    expect(state.delayedInc).to.equal(5)
                })

                expect(spy.sideEffect.callIncAfterDelaySideEffect.then).to.have.been.called
                expect(spy.action.incAction).not.to.have.been.called

                waitUntil((state, prev) => state.counter !== prev.counter)
                .then((state, prev) => {
                    expect(spy.action.incAction).to.have.been.called
                    expect(state.counter).to.equal(5)
                    expect(state.multiple).to.equal(50)
                    expect(state.delayedInc).to.be.undefined
                    done()
                })
            })
        })
    })
})

describe("Testlet without spies", () => {

    beforeEach(() => {
        initTestlet()
    })

    it("passes unwrapped functions directly to fluxlet", () => {
        given.fluxlet()
            .actions({ mockAction })

        expect(spy.action.mockAction).to.eql(mockAction)
    })
})
