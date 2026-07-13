// The working indicator a resident watches while Gavel thinks.
//
// These used to be jokes ("Consulting the office goldfish…"). On a civic-trust product that is the
// wrong register — someone is asking whether a data center is going next to their house. The loader
// is prime screen real estate, so it names the work instead: each line is a thing Gavel actually
// does (agenda lookup, property record, meeting transcript, local press, the neighborhood's own
// discussion). It reads as an agent showing its hands, not a spinner.

export const THINKING_STATUS = Object.freeze({
  status: 'Thinking…',
  loading_messages: Object.freeze([
    'Reading the agenda…',
    'Checking the property record…',
    'Searching the meeting transcript…',
    'Pulling the local reporting…',
    'Checking what the neighborhood already said…',
    'Citing the sources…',
  ]),
});
