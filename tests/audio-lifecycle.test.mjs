import test from 'node:test';
import assert from 'node:assert/strict';
import { NetsAudio } from '../dist/audio.js';

function audioWithContext() {
  const audio = new NetsAudio(), transitions = [];
  audio.context = {
    state: 'running',
    async suspend() { transitions.push('suspend'); this.state = 'suspended'; },
    async resume() { transitions.push('resume'); this.state = 'running'; },
  };
  return { audio, transitions };
}

test('pause stops the audio graph; resume does not override mute', async () => {
  const { audio, transitions } = audioWithContext();
  audio.setSuspended(true); await audio.contextQueue;
  assert.equal(audio.context.state, 'suspended');
  audio.setEnabled(false); audio.setSuspended(false); await audio.contextQueue;
  assert.equal(audio.context.state, 'suspended');
  audio.setEnabled(true); await audio.contextQueue;
  assert.equal(audio.context.state, 'running');
  assert.deepEqual(transitions, ['suspend', 'resume']);
});

test('rapid hide/show changes settle at the latest requested audio state', async () => {
  const { audio } = audioWithContext();
  audio.setSuspended(true); audio.setSuspended(false); audio.setSuspended(true);
  await audio.contextQueue;
  assert.equal(audio.context.state, 'suspended');
  audio.setSuspended(false); await audio.contextQueue;
  assert.equal(audio.context.state, 'running');
});

test('a browser audio rejection does not prevent later state changes', async () => {
  const { audio } = audioWithContext();
  audio.context.suspend = async () => { throw new Error('context unavailable'); };
  audio.setSuspended(true); await assert.doesNotReject(audio.contextQueue);
  audio.setSuspended(false); await assert.doesNotReject(audio.contextQueue);
});
