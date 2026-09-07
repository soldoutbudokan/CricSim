// Feedback describes the stroke at contact / at the crease, never the current
// mouse button after the ball has gone. Timing is relative to the stroke's middle.
export function describeShot(stroke, contact = null) {
  if (!stroke?.attempted) return { timing: 'No stroke', detail: 'Hold and swipe to play, or select Defend and hold to block.' };
  if (stroke.defending) return { timing: 'Soft hands', detail: contact ? 'A controlled block.' : 'Move the contact ring onto the line of the ball.' };
  if (stroke.phase === 'follow' || stroke.phase === 'recover') return { timing: 'Released early', detail: 'Keep holding through contact. Let go after the ball meets the bat.' };
  if (stroke.phase === 'guard' || stroke.progress > 0.72) {
    return { timing: 'Early', detail: 'The stroke passed its middle before the ball arrived. Start a little later.' };
  }
  if (stroke.progress < 0.32) return { timing: 'Late', detail: 'The bat was still coming down. Start the swipe a little sooner.' };
  return contact
    ? { timing: 'Well timed', detail: contact.edge ? 'Timing was good. Bring the contact ring closer to the ball.' : contact.quality > 0.7 ? 'Through the middle of the blade.' : 'Timing was good. Meet the ball nearer the middle of the blade.' }
    : { timing: 'Missed line', detail: 'The stroke arrived in time. Adjust the contact ring to meet the ball.' };
}
