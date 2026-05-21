#!/usr/bin/env tsx
// Smoke test: queue a tiny manual-mode post for "now" and run a tick.
// Doesn't touch any external API beyond Slack notify (manual mode).
//   npm run publish:test

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import { publishTick } from '../src/publisher/dispatcher.js';

async function main() {
  const supa = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supa
    .from('greg_content_queue')
    .insert({
      platform: 'linkedin',
      post_type: 'test_post',
      draft_content: '🧪 Publisher smoke test — please ignore.\n\n#test',
      scheduled_date: new Date().toISOString().slice(0, 10),
      scheduled_time: new Date().toISOString(),
      status: 'scheduled',
      publish_mode: 'manual',
    })
    .select()
    .single();

  if (error) {
    console.error(error);
    process.exit(1);
  }
  console.log('Inserted test row', data.id);

  // Force this one to manual mode so we don't accidentally publish anywhere
  process.env.PUBLISHER_PLATFORM_MODE = 'linkedin:manual';
  const result = await publishTick();
  console.log(JSON.stringify(result, null, 2));

  // Cleanup so we don't leave junk in the queue
  await supa.from('greg_content_queue').delete().eq('id', data.id);
  console.log('Cleaned up test row');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
