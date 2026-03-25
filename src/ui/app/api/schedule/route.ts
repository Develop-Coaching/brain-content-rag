import { NextResponse } from 'next/server';
import { scheduleApprovedPosts } from '../../../../agent/scheduler.js';

export async function POST() {
  try {
    const result = await scheduleApprovedPosts();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
