// Feedback describes the stroke at contact / at the crease, never the current
// mouse button after the ball has gone. Timing is relative to the stroke's middle.

import { BALL, batBasis, clamp } from './physics.js?v=85c5bf6cbdfe4cef';

// Standard clicks commit a full shot, including after release and recovery.
// Manual mode retains its existing held/released leave convention.
export const isSwing = stroke => Boolean(stroke?.attempted && !stroke.defending && stroke.committed &&
  (stroke.mode === 'standard' ? !stroke.cancelled : stroke.held));
// Defence has its own held state: it does not use swipe commitment or `held`.
// A block kept up as the ball passes is still a shot attempt.
export const isPlayingShot = stroke => Boolean(stroke?.attempted && stroke.defending) || isSwing(stroke);
const isDismissal = result => result === 'Bowled' || result === 'LBW';

export function describeShot(stroke, contact = null, bowled = false, miss = null) {
  if (!stroke?.attempted) {
    return bowled
      ? { timing: 'Left', detail: 'That one was straight. Cover the stumps or play it.' }
      : { timing: 'Left', detail: 'Well left. You read the line and let it go.' };
  }
  if (stroke.defending) {
    if (contact) return { timing: 'Soft hands', detail: 'A controlled block.' };
    return { timing: 'Beaten', detail: 'The block missed the ball. Move the contact ring onto its line.' };
  }
  if (stroke.mode === 'standard' && stroke.committed && !stroke.cancelled) {
    // Sampled at contact or at the crease. A released button and a recovered
    // animation cannot erase the intent or rewrite the stroke's timing.
    const offset = (stroke.elapsed - stroke.idealContactTime) * 1000;
    if (Number.isFinite(offset) && offset >= 35) return {
      timing: 'Early', detail: contact ? 'You made contact, but started early. Click or tap a little later for the strongest stroke.' : 'The stroke arrived before the ball. Click or tap a little later.',
    };
    if (Number.isFinite(offset) && offset <= -35) return {
      timing: 'Late', detail: contact ? 'You made contact late. Click or tap a little sooner for the strongest stroke.' : 'The ball arrived before the stroke. Click or tap a little sooner.',
    };
    if (contact) return { timing: 'Well timed', detail: contact.edge ? 'Good timing, but an edge. Move the blade outline closer to the ball’s line.' : contact.quality > .7 ? 'Through the middle of the blade.' : 'Good timing. Meet the ball nearer the middle of the blade.' };
    const line = miss && Math.abs(miss.x) > .054 + BALL.radius;
    const height = miss && Math.abs(miss.y) > .31 + BALL.radius;
    if (height) return { timing: line ? 'Wrong line & height' : 'Wrong height', detail: line ? 'The swing was on time. Adjust both the line and height of the blade outline.' : 'The swing was on time. Move the blade outline to the ball’s arrival height.' };
    return { timing: line ? 'Wrong line' : 'Missed line', detail: 'The swing was on time. Aim the blade outline where the ball will arrive, rather than following its distant screen position.' };
  }
  if (!contact && (!stroke.held || !stroke.committed)) {
    return bowled
      ? { timing: 'Backed off', detail: 'You lifted the bat and backed off a straight one. Play it or cover the stumps.' }
      : { timing: 'Backed off', detail: 'You backed off and let the ball go. Well left.' };
  }
  if (stroke.phase === 'guard' || stroke.phase === 'recover' || stroke.progress > 0.72) {
    return { timing: 'Early', detail: 'The stroke passed its middle before the ball arrived. Start a little later.' };
  }
  if (stroke.progress < 0.32) return { timing: 'Late', detail: 'The bat was still coming down. Start the swipe a little sooner.' };
  return contact
    ? { timing: 'Well timed', detail: contact.edge ? 'Timing was good. Bring the contact ring closer to the ball.' : contact.quality > 0.7 ? 'Through the middle of the blade.' : 'Timing was good. Meet the ball nearer the middle of the blade.' }
    : { timing: 'Missed line', detail: 'The stroke arrived in time. Adjust the contact ring to meet the ball.' };
}

// A ball is under control when the bat met it, or when the batter left it and
// the stumps survived. Missing a held swing or block, or being bowled, is not.
export function isControlled(delivery, result) {
  if (!delivery) return false;
  if (isDismissal(result)) return false;
  if (delivery.hit) return true;
  return !isPlayingShot(delivery.stroke);
}

// The headline for a delivery that passed the bat.
export function missTitle(delivery, result) {
  if (isDismissal(result)) return result;
  return isPlayingShot(delivery?.stroke) ? 'Played & missed' : 'Left alone';
}

// Where the ball passed, in the bat's frame: x across the blade (hand = +1 for a
// right-hander, so x * hand > 0 is the outside edge), y along it, handle up.
export function describeMiss(miss, hand = 1) {
  if (!miss) return null;
  const cm = value => Math.round(value * 100);
  const across = Math.abs(miss.x) - 0.054, along = Math.abs(miss.y) - 0.31;
  const parts = [];
  if (across > 0.005) parts.push(`${cm(across)} cm past the ${miss.x * hand > 0 ? 'outside' : 'inside'} edge`);
  if (along > 0.005) parts.push(`${cm(along)} cm ${miss.y > 0 ? 'above the blade' : 'below the toe'}`);
  if (parts.length === 0) parts.push(Math.abs(miss.depth) > 0.06 ? (miss.depth > 0 ? 'in front of the face before the blade arrived' : 'behind the face after the blade had gone') : 'on the line of the blade');
  const distance = miss.gap < 0.01 ? 'a whisker' : `${cm(miss.gap)} cm`;
  const { ball, nearest } = missView(miss);
  const dx = ball.x - nearest.x, dy = ball.y - nearest.y;
  const directions = [];
  if (Math.abs(dx) > 0.005) directions.push(dx > 0 ? 'right' : 'left');
  if (Math.abs(dy) > 0.005) directions.push(dy > 0 ? 'above' : 'below');
  const direction = directions.length ? directions.join(' / ') : 'in line · timing';
  return { distance, direction, where: parts.join(', '), sentence: `The ball passed ${parts.join(', ')}.` };
}

// An orthographic view from the batter's side: right stays right in both
// stances, and a cut shows the blade lying across the screen. Fit the ball and
// the bat together so distant misses retain their direction without clipping.
function missView(miss) {
  const basis = batBasis(miss.bat || { yaw: 0, loft: 0, roll: 0 });
  const project = (x, y, depth = 0) => ({
    x: x * basis.w.x + y * basis.u.x + depth * basis.n.x,
    y: x * basis.w.y + y * basis.u.y + depth * basis.n.y,
  });
  return {
    blade: [[-.054, -.31], [.054, -.31], [.054, .31], [-.054, .31]].map(([x, y]) => project(x, y)),
    handle: [project(0, .31), project(0, .49)],
    ball: project(miss.x, miss.y, miss.depth),
    nearest: project(clamp(miss.x, -.054, .054), clamp(miss.y, -.31, .31), clamp(miss.depth, -.018, .018)),
  };
}

export function missDiagram(miss) {
  const view = missView(miss), { ball } = view;
  const points = [...view.blade, ...view.handle, { x: ball.x - BALL.radius, y: ball.y - BALL.radius }, { x: ball.x + BALL.radius, y: ball.y + BALL.radius }];
  const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x));
  const minY = Math.min(...points.map(p => p.y)), maxY = Math.max(...points.map(p => p.y));
  const scale = Math.min(108 / Math.max(.108, maxX - minX), 76 / Math.max(.62, maxY - minY));
  const map = p => ({ x: 60 + (p.x - (minX + maxX) / 2) * scale, y: 44 - (p.y - (minY + maxY) / 2) * scale });
  return { blade: view.blade.map(map), handle: view.handle.map(map), ball: map(ball), nearest: map(view.nearest), radius: Math.max(2.5, BALL.radius * scale) };
}
