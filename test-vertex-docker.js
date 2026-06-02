const { vertex } = require('@ai-sdk/google-vertex');
const { generateText } = require('ai');
async function run() {
  process.env.GOOGLE_VERTEX_PROJECT = 'project-01fcebc5-4e77-4136-bb1';
  process.env.GOOGLE_VERTEX_LOCATION = 'us-central1';
  try {
    const res = await generateText({
      model: vertex('gemini-1.5-flash'),
      prompt: 'hello'
    });
    console.log('SUCCESS:', res.text);
  } catch (e) {
    console.log('ERROR:', e.message);
  }
}
run();
