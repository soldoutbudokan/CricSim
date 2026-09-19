// Feedback describes the stroke at contact / at the crease, never the current
// mouse button after the ball has gone. Timing is relative to the stroke's middle.

// A swing is a stroke that got past the commit point. Lifting the bat and backing
// off before that is a leave, as is holding a block out of the ball's way.
export const isSwing = stroke => Boolean(stroke?.attempted && !stroke.defending && stroke.committed);

export function describeShot(stroke, contact = null, bowled = false) {
  if (!stroke?.attempted) {
    return bowled
      ? { timing: 'Left', detail: 'That one was straight. Cover the stumps or play it.' }
      : { timing: 'Left', detail: 'Well left. You read the line and let it go.' };
  }
  if (stroke.defending) {
    if (contact) return { timing: 'Soft hands', detail: 'A controlled block.' };
    return bowled
      ? { timing: 'Beaten', detail: 'The block was off the line. Move the contact ring onto the ball.' }
      : { timing: 'Left', detail: 'Shouldered arms. The blade stayed out of the way.' };
  }
  if (!stroke.committed) {
    return bowled
      ? { timing: 'Backed off', detail: 'You lifted the bat and backed off a straight one. Play it or cover the stumps.' }
      : { timing: 'Backed off', detail: 'You lifted the bat and let it go. That counts as a leave.' };
  }
  if (stroke.phase === 'guard' || stroke.phase === 'recover' || stroke.progress > 0.72) {
    return { timing: 'Early', detail: 'The stroke passed its middle before the ball arrived. Start a little later.' };
  }
  if (stroke.progress < 0.32) return { timing: 'Late', detail: 'The bat was still coming down. Start the swipe a little sooner.' };
  return contact
    ? { timing: 'Well timed', detail: contact.edge ? 'Timing was good. Bring the contact ring closer to the ball.' : contact.quality > 0.7 ? 'Through the middle of the blade.' : 'Timing was good. Meet the ball nearer the middle of the blade.' }
    : { timing: 'Missed line', detail: 'The stroke arrived in time. Adjust the contact ring to meet the ball.' };
}

// A ball is under control when the bat met it, or when the batter did not swing
// at it and the stumps survived. Swinging and missing, or being bowled, is not.
export function isControlled(delivery, result) {
  if (!delivery) return false;
  if (delivery.hit) return true;
  if (result === 'Bowled') return false;
  return !isSwing(delivery.stroke);
}

// The headline for a delivery that passed the bat.
export function missTitle(delivery, result) {
  if (result === 'Bowled') return 'Bowled';
  return isSwing(delivery?.stroke) ? 'Played & missed' : 'Left alone';
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
  return { distance, where: parts.join(', '), sentence: `The ball passed ${parts.join(', ')}.` };
}
