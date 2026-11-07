import { useNativeTheme } from '@/hooks/use-native-theme';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { PageHeader, NAVY } from '@/components/page-header';
import { useAuth } from '@/contexts/auth-context';
import {
  fetchAssignments,
  type AssignmentListItem,
} from '@/lib/assignments-service';

type JobDocument = NonNullable<
  NonNullable<AssignmentListItem['quickAccess']>['documents']
>[number];
type JobNote = NonNullable<
  NonNullable<AssignmentListItem['quickAccess']>['notes']
>[number];

function pdfViewerUrl(url: string) {
  return `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(url)}`;
}

function DocumentCard({
  doc,
  onPreview,
}: {
  doc: JobDocument;
  onPreview: (doc: JobDocument) => void;
}) {
  const { themeColor } = useNativeTheme();
  const isRequired = doc.tag === 'Required';
  return (
    <View
      className="mb-3 rounded-2xl bg-white dark:bg-slate-800 p-3.5 border-[#dce4f0] dark:border-[#334155]"
      style={{ borderWidth: 1 }}
    >
      <View className="flex-row items-start gap-3">
        <View className="h-11 w-11 items-center justify-center rounded-xl bg-[#1c2e4a]">
          <Ionicons name="document-outline" size={22} color="#fff" />
        </View>
        <View className="min-w-0 flex-1">
          <View className="flex-row items-start justify-between gap-2">
            <Text className="flex-1 text-base font-bold text-[#1c2e4a] dark:text-[#f1f5f9]">
              {doc.title}
            </Text>
            <View
              className="rounded-full px-2.5 py-1"
              style={{
                backgroundColor: themeColor(
                  isRequired ? '#ffedd5' : '#f3e8ff',
                  'background',
                ),
              }}
            >
              <Text
                className="text-[11px] font-bold"
                style={{
                  color: themeColor(isRequired ? '#c2410c' : '#7e22ce', 'text'),
                }}
              >
                {doc.tag}
              </Text>
            </View>
          </View>
          <View className="mt-3 flex-row gap-2">
            <Pressable
              onPress={() => onPreview(doc)}
              className="flex-1 rounded-xl bg-[#CC0000] py-2.5 items-center active:opacity-90"
            >
              <Text className="text-sm font-bold text-white">Preview</Text>
            </Pressable>
            <Pressable
              onPress={() => void Linking.openURL(doc.url)}
              className="flex-1 rounded-xl border border-[#CC0000] bg-white dark:bg-slate-800 py-2.5 items-center active:opacity-90"
            >
              <Text className="text-sm font-bold text-[#CC0000] dark:text-red-400">
                Open
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

function NoteCard({ note }: { note: JobNote }) {
  const { themeColor } = useNativeTheme();
  return (
    <View
      className="mb-3 rounded-2xl bg-white dark:bg-slate-800 p-3.5 border-[#dce4f0] dark:border-[#334155]"
      style={{ borderWidth: 1 }}
    >
      <View className="flex-row items-start gap-3">
        <View className="h-11 w-11 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-900">
          <Ionicons
            name="document-text-outline"
            size={22}
            color={themeColor(NAVY)}
          />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-base font-bold text-[#1c2e4a] dark:text-[#f1f5f9]">
            {note.title}
          </Text>
          <Text className="mt-1 text-[13px] leading-5 text-[#74819a] dark:text-[#94a3b8]">
            {note.body}
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function JobDocumentsScreen() {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 16);
  const { token } = useAuth();
  const { assignmentId, section } = useLocalSearchParams<{
    assignmentId?: string;
    section?: string;
  }>();
  const assignmentsQuery = useQuery({
    queryKey: ['mobile-assignments-quick-docs', token],
    enabled: Boolean(token),
    queryFn: () => fetchAssignments({ token: token as string, status: 'all' }),
  });
  const assignment = assignmentsQuery.data?.find(
    (item) => item.id === assignmentId,
  );
  const notes = assignment?.quickAccess?.notes ?? [];
  const documents = assignment?.quickAccess?.documents ?? [];
  const showNotes = section !== 'documents';
  const showDocuments = section !== 'notes';
  const [previewDoc, setPreviewDoc] = useState<JobDocument | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);

  return (
    <View className="flex-1 bg-[#eef3fb] dark:bg-[#0f172a]">
      <StatusBar style="light" backgroundColor="#1c2e4a" translucent={false} />
      <PageHeader
        title={
          section === 'notes'
            ? 'Notes'
            : section === 'documents'
              ? 'Documents'
              : 'Job Documents'
        }
        subtitle={[assignment?.title, assignment?.location]
          .filter(Boolean)
          .join(' - ')}
      />
      <SafeAreaView edges={['top', 'left', 'right']} className="flex-1">
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 8 }}
        >
          {assignmentsQuery.isLoading ? (
            <Text className="mt-4 text-sm font-semibold text-slate-500 dark:text-slate-400">
              Loading...
            </Text>
          ) : (
            <View className="mt-4">
              {showNotes && notes.length > 0 ? (
                <>
                  <Text className="mb-2 text-lg font-extrabold text-[#1c2e4a] dark:text-[#f1f5f9]">
                    Notes
                  </Text>
                  {notes.map((note) => (
                    <NoteCard key={note.id} note={note} />
                  ))}
                </>
              ) : null}
              {showDocuments && documents.length > 0 ? (
                <>
                  <Text className="mb-2 mt-2 text-lg font-extrabold text-[#1c2e4a] dark:text-[#f1f5f9]">
                    Documents
                  </Text>
                  {documents.map((doc) => (
                    <DocumentCard
                      key={doc.id}
                      doc={doc}
                      onPreview={(item) => {
                        setViewerLoading(true);
                        setPreviewDoc(item);
                      }}
                    />
                  ))}
                </>
              ) : null}
              {(!showNotes || notes.length === 0) &&
              (!showDocuments || documents.length === 0) ? (
                <Text className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                  No notes or documents available.
                </Text>
              ) : null}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
      <Modal
        visible={Boolean(previewDoc)}
        animationType="slide"
        onRequestClose={() => setPreviewDoc(null)}
      >
        <StatusBar
          style="light"
          backgroundColor="#1c2e4a"
          translucent={false}
        />
        <SafeAreaView
          edges={['bottom']}
          className="flex-1 bg-slate-100 dark:bg-slate-900"
        >
          <PageHeader
            title={previewDoc?.title || 'Document'}
            back={() => setPreviewDoc(null)}
            rightSlot={
              previewDoc?.url ? (
                <Pressable
                  onPress={() => void Linking.openURL(previewDoc.url)}
                  className="h-10 flex-row items-center gap-1.5 rounded-xl bg-[#CC0000] px-3 active:opacity-90"
                >
                  <Ionicons name="open-outline" size={16} color="#fff" />
                  <Text className="text-sm font-extrabold text-white">
                    Open
                  </Text>
                </Pressable>
              ) : null
            }
          />
          <View className="flex-1 bg-slate-100 dark:bg-slate-900">
            {previewDoc ? (
              <WebView
                source={{ uri: pdfViewerUrl(previewDoc.url) }}
                startInLoadingState
                onLoadStart={() => setViewerLoading(true)}
                onLoadEnd={() => setViewerLoading(false)}
                className="flex-1"
              />
            ) : null}
            {viewerLoading ? (
              <View className="absolute inset-0 items-center justify-center bg-white/80">
                <ActivityIndicator size="large" color="#CC0000" />
                <Text className="mt-3 text-sm font-semibold text-slate-600 dark:text-slate-200">
                  Loading document...
                </Text>
              </View>
            ) : null}
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}
