import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

export async function adjustWorkerReliability(
  workerId: string,
  kind: 'worker_reject' | 'completed_late' | 'completed_ontime'
): Promise<void> {
  const ref = doc(db, 'users', workerId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data();
  const profile = data.profile || {};
  const stats = profile.reliabilityStats || { cancellations: 0, delays: 0, onTimeCompletes: 0 };
  let score: number = typeof profile.reliabilityScore === 'number' ? profile.reliabilityScore : 100;

  if (kind === 'worker_reject') {
    stats.cancellations = (stats.cancellations || 0) + 1;
    score = Math.max(0, score - 4);
  } else if (kind === 'completed_late') {
    stats.delays = (stats.delays || 0) + 1;
    score = Math.max(0, score - 5);
  } else if (kind === 'completed_ontime') {
    stats.onTimeCompletes = (stats.onTimeCompletes || 0) + 1;
    score = Math.min(100, score + 0.5);
  }

  await updateDoc(ref, {
    'profile.reliabilityStats': stats,
    'profile.reliabilityScore': Math.round(score * 10) / 10,
  });
}
