/**
 * Presentation-only start-screen art. Keeping the URL beside the consuming UI
 * makes Vite fingerprint/copy the image without letting it enter simulation,
 * replay, or profile state.
 */
export const WILDGUARD_KEYART_URL = new URL(
  '../../../../assets/ui/keyart/storybook-wildguard-scout-v1.jpg',
  import.meta.url,
).href;
