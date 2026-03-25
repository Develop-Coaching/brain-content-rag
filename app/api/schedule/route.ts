import { NextResponse } from 'next/server';
import { scheduleApprovedPosts } from '../../../src/agent/scheduler';

export async function POST() {
  try {
    const result = await scheduleApprovedPosts();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
