import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

type QueueWorker = {
  id: string;
  name: string;
  workOrderLine: string;
  st: number;
  ot: number;
  dt: number;
};

const MOCK_QUEUE: QueueWorker[] = [
  {
    id: '1',
    name: 'Freddy Moran',
    workOrderLine: '#WO-2026-003 - Redwood Blvd',
    st: 8,
    ot: 3,
    dt: 0,
  },
  {
    id: '2',
    name: 'Pena Zamora',
    workOrderLine: '#WO-2026-003 - Redwood Blvd',
    st: 8,
    ot: 3,
    dt: 0,
  },
];

function WorkerCard({ worker }: { worker: QueueWorker }) {
  const total = worker.st + worker.ot + worker.dt;
  return (
    <View className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3.5 mb-3">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 min-w-0">
          <Text className="text-base font-bold text-[#1c2e4a] dark:text-slate-100">
            {worker.name}
          </Text>
          <Text className="text-[13px] text-slate-500 dark:text-slate-400 mt-1">
            {worker.workOrderLine}
          </Text>
          <Text className="text-[13px] text-slate-500 dark:text-slate-400 mt-1">
            ST {worker.st} | OT {worker.ot} | DT {worker.dt} | Total {total}
          </Text>
        </View>
        <View className="rounded-full bg-orange-100 dark:bg-[#431407] px-3 py-1 self-start">
          <Text className="text-xs font-bold text-red-600 dark:text-[#fca5a5]">
            Pending
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function SignatureQueueScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-[#E8EDF5] dark:bg-slate-900">
      <StatusBar style="auto" />
      <SafeAreaView edges={['top', 'left', 'right']} className="flex-1">
        <ScrollView
          className="flex-1"
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: insets.bottom + 24,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="rounded-[24px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
            <Text className="text-[22px] font-bold text-[#1c2e4a] dark:text-slate-100">
              Signature Queue
            </Text>
            <Text className="text-[14px] text-slate-500 dark:text-slate-400 mt-2 leading-5">
              Each worker should review their hours, lunch status, notes, and
              then sign.
            </Text>

            <View className="mt-4 rounded-2xl px-3.5 py-3 border border-red-100 dark:border-[#991b1b] bg-[#fef2f2] dark:bg-[#450a0a]">
              <Text className="text-[13px] leading-5 text-[#1c2e4a] dark:text-slate-100">
                <Text className="font-bold">Recommended field flow:</Text> the
                foreman starts the sequence, passes the device to each worker,
                the worker reviews their own time entry, signs, and the app
                automatically moves to the next person.
              </Text>
            </View>

            <View className="mt-5">
              {MOCK_QUEUE.map((w) => (
                <WorkerCard key={w.id} worker={w} />
              ))}
            </View>

            <Pressable
              className="mt-2 rounded-2xl bg-[#CC0000] py-4 items-center active:opacity-90"
              onPress={() => {}}
            >
              <Text className="text-base font-bold text-white">
                Start Signature Flow
              </Text>
            </Pressable>

            <Pressable
              className="mt-3 rounded-2xl bg-slate-200 dark:bg-slate-800 py-4 items-center active:opacity-90"
              onPress={() => router.back()}
            >
              <Text className="text-base font-bold text-[#1c2e4a] dark:text-slate-100">
                Back to Timesheet
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
