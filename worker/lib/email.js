export async function sendMagicLink(env, email, link) {
  // Task 6 replaces this with a real Resend API call.
  env.__lastMagicLink = link; // test hook
}
