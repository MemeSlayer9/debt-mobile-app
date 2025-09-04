import AsyncStorage from '@react-native-async-storage/async-storage';        // :contentReference[oaicite:10]{index=10}
import NetInfo from '@react-native-community/netinfo';                    // :contentReference[oaicite:11]{index=11}
import { supabase } from '../supabase/supabaseClient';

type Mutation =
  | { type: 'insert'; table: string; payload: any }
  | { type: 'update'; table: string; payload: any; match: any }
  | { type: 'delete'; table: string; payload: any };

const QUEUE_KEY = 'OFFLINE_QUEUE';

async function getQueue(): Promise<Mutation[]> {
  const json = await AsyncStorage.getItem(QUEUE_KEY);
  return json ? JSON.parse(json) : [];
}

async function setQueue(queue: Mutation[]) {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function addToQueue(m: Mutation) {
  const queue = await getQueue();
  queue.push(m);
  await setQueue(queue);
}

export async function processQueue() {
  const queue = await getQueue();
  const failures: Mutation[] = [];

  for (const m of queue) {
    let res;
    if (m.type === 'insert') {
      res = await supabase.from(m.table).insert(m.payload);
    } else if (m.type === 'update') {
      res = await supabase.from(m.table).update(m.payload).match(m.match);
    } else {
      res = await supabase.from(m.table).delete().match(m.payload);
    }
    if (res.error) {
      failures.push(m);
    }
  }

  await setQueue(failures);
}

export function initQueueListener() {
  NetInfo.addEventListener(state => {                             // :contentReference[oaicite:12]{index=12}
    if (state.isConnected) {
      processQueue();                                             // :contentReference[oaicite:13]{index=13}
    }
  });
}
