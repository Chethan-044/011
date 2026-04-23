/**
 * Quick standalone test to verify Gemini is reachable
 * via the OpenAI-compatible endpoint.
 *
 * Usage: node test_gemini.js
 */
require('dotenv').config();

async function main() {
  const key = process.env.GEMINI_API_KEY;
  console.log('GEMINI_API_KEY present:', Boolean(key && key !== 'YOUR_GEMINI_API_KEY_HERE'));
  console.log('Key prefix:', key ? key.substring(0, 8) + '...' : '(empty)');

  if (!key || key === 'YOUR_GEMINI_API_KEY_HERE') {
    console.error('\n❌ ERROR: GEMINI_API_KEY is not set in .env');
    console.error('   Paste your real API key from https://aistudio.google.com/apikey');
    process.exit(1);
  }

  const OpenAI = require('openai').default || require('openai');
  const openai = new OpenAI({
    apiKey: key,
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  });

  console.log('\nCalling Gemini (gemini-2.0-flash)...');

  try {
    const res = await openai.chat.completions.create({
      model: 'gemini-2.0-flash',
      messages: [{ role: 'user', content: 'Say hello in one sentence.' }],
      max_tokens: 50,
    });
    const text = res.choices[0]?.message?.content;
    console.log('\n✅ Gemini responded:', text);
    console.log('\nGemini is working! You can now restart the backend.');
  } catch (err) {
    console.error('\n❌ Gemini call FAILED:', err.message);
    if (err.status === 401 || err.message?.includes('API key')) {
      console.error('   → Your API key is invalid. Get a new one at https://aistudio.google.com/apikey');
    }
  }
}

main();
