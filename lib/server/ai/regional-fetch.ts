import { forwardGemini } from '../../../workers/gemini-outbound';

// Historical export name retained for callers. The boundary runs locally:
// native fetch goes directly to Google, with no Worker service-binding hop.
// Keep URL/header/body limits and upstream diagnostics, plus existing DO state.
export const regionalGeminiFetch: typeof fetch = (input, init) =>
  forwardGemini(new Request(input, init), (url, options) =>
    fetch(url, options),
  );
