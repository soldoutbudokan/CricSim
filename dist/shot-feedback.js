// Feedback describes the stroke at contact / at the crease, never the current
// mouse button after the ball has gone. Timing is relative to the stroke's middle.
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
  if (!stroke.committed && (stroke.phase === 'recover' || stroke.phase === 'guard')) {
    return { timing: 'Pulled out', detail: 'You let go before the swing committed. Swipe through the ball, then release.' };
  }
  if (stroke.phase === 'guard' || stroke.phase === 'recover' || stroke.progress > 0.72) {
    return { timing: 'Early', detail: 'The stroke passed its middle before the ball arrived. Start a little later.' };
  }
  if (stroke.progress < 0.32) return { timing: 'Late', detail: 'The bat was still coming down. Start the swipe a little sooner.' };
  return contact
    ? { timing: 'Well timed', detail: contact.edge ? 'Timing was good. Bring the contact ring closer to the ball.' : contact.quality > 0.7 ? 'Through the middle of the blade.' : 'Timing was good. Meet the ball nearer the middle of the blade.' }
    : { timing: 'Missed line', detail: 'The stroke arrived in time. Adjust the contact ring to meet the ball.' };
}

// A ball is under control when the bat met it, or when the batter chose not to
// play and the stumps survived. Playing and missing, or being bowled, is not.
export function isControlled(delivery, result) {
  if (!delivery) return false;
  if (delivery.hit) return true;
  if (result === 'Bowled') return false;
  const stroke = delivery.stroke;
  return !stroke?.attempted || Boolean(stroke.defending);
}

// The headline for a delivery that passed the bat.
export function missTitle(delivery, result) {
  if (result === 'Bowled') return 'Bowled';
  const stroke = delivery?.stroke;
  return !stroke?.attempted || stroke.defending ? 'Left alone' : 'Played & missed';
}
