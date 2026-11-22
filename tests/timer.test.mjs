import test from 'node:test';
import assert from 'node:assert/strict';
import {newTimer,restoreTimer,toggleTimer,tick,timeLeft,resetPhase} from '../public/timer-core.js';
test('pause and resume preserve elapsed focus time',()=>{let t=toggleTimer(newTimer(),1000);t=toggleTimer(t,61000);assert.equal(timeLeft(t),24*60000);t=toggleTimer(t,70000);assert.equal(timeLeft(t,130000),23*60000);});
test('expired focus counts once and waits for user to start break',()=>{const t=tick(toggleTimer(newTimer(),0),1800000);assert.equal(t.rounds,1);assert.equal(t.phase,'short');assert.equal(t.focusMinutes,25);assert.equal(t.running,false);assert.deepEqual(tick(t,9000000),t);});
test('fourth focus round leads to long break',()=>{const t=tick(toggleTimer({...newTimer(),rounds:3},0),1500000);assert.equal(t.phase,'long');assert.equal(t.remainingMs,900000);});
test('break returns to focus without counting another round',()=>{const t=tick(toggleTimer({...newTimer(),phase:'short',remainingMs:300000,rounds:1},0),300000);assert.equal(t.phase,'focus');assert.equal(t.rounds,1);});
test('reload uses saved deadline instead of extending session',()=>{const t=restoreTimer(JSON.parse(JSON.stringify(toggleTimer(newTimer(),1000))),61000);assert.equal(timeLeft(t,61000),1440000);assert.equal(tick(t,1600000).phase,'short');});
test('invalid stored settings reset safely and reset does not count work',()=>{assert.deepEqual(restoreTimer({settings:{focus:-1}}),newTimer());const t=resetPhase(toggleTimer(newTimer(),0));assert.equal(t.rounds,0);assert.equal(t.running,false);assert.equal(t.remainingMs,1500000);});
