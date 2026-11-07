import { useNativeTheme } from '@/hooks/use-native-theme';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Image as RNImage,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PageHeader, NAVY } from '@/components/page-header';
import { useAuth } from '@/contexts/auth-context';
import { fetchAssignmentById } from '@/lib/assignments-service';
import { shiftChatConversationTitle } from '@/lib/shift-chat-conversation';
import { StatusBar } from 'expo-status-bar';
import {
  connectShiftChatSocket,
  deleteShiftChatMessage,
  fetchShiftChatMessages,
  markShiftChatRead,
  sendShiftChatMessage,
  type ShiftChatMessage,
  uploadShiftChatMedia,
} from '@/lib/shift-chat-service';

const AUDIO_BARS = [
  12, 18, 10, 24, 16, 30, 14, 20, 28, 12, 22, 16, 26, 18, 11, 24, 15, 30, 20,
  13, 25, 17,
];

function timeLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function shiftDateLabel(value?: string) {
  if (!value) return '';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
}

function durationLabel(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const rounded = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(rounded / 60);
  const rest = String(rounded % 60).padStart(2, '0');
  return `${minutes}:${rest}`;
}

function assetName(uri: string, fallback: string) {
  const name = uri.split('/').pop()?.split('?')[0];
  return name || fallback;
}

function messagePreview(message: ShiftChatMessage) {
  if (message.body?.trim()) return message.body.trim().slice(0, 140);
  if (message.kind === 'image') return 'Photo';
  if (message.kind === 'audio') return 'Voice message';
  return 'Message';
}

function replyPayload(message: ShiftChatMessage | null) {
  if (!message) return {};
  return {
    replyToMessageId: message.id,
    replyToSenderName: message.senderName,
    replyToKind: message.kind,
    replyToPreview: messagePreview(message),
  };
}

function ReplyPreview({
  senderName,
  preview,
  isMine,
  onPress,
}: {
  senderName: string;
  preview: string;
  isMine?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      className={`mb-2 rounded-xl border-l-4 px-3 py-2 ${isMine ? 'border-white/80 bg-white/15' : 'border-blue-500 bg-blue-50 dark:bg-[#172554]'}`}
    >
      <Text
        className={`text-[11px] font-bold ${isMine ? 'text-white' : 'text-blue-700 dark:text-[#93c5fd]'}`}
        numberOfLines={1}
      >
        {senderName || 'Worker'}
      </Text>
      <Text
        className={`mt-0.5 text-xs ${isMine ? 'text-white/80' : 'text-slate-600 dark:text-slate-200'}`}
        numberOfLines={2}
      >
        {preview || 'Message'}
      </Text>
    </Pressable>
  );
}

function AudioMessageBubble({
  source,
  label,
  isMine,
}: {
  source: string;
  label?: string;
  isMine?: boolean;
}) {
  const { themeColor } = useNativeTheme();
  const player = useAudioPlayer(source, { updateInterval: 120 });
  const status = useAudioPlayerStatus(player);
  const duration = status.duration || 0;
  const currentTime = Math.min(
    status.currentTime || 0,
    duration || status.currentTime || 0,
  );
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;
  const playedBars = Math.round(progress * AUDIO_BARS.length);
  const foreground = isMine ? '#fff' : NAVY;
  const muted = isMine ? 'rgba(255,255,255,0.42)' : '#CBD5E1';
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!status.playing) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return undefined;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 420,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 420,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse, status.playing]);

  useEffect(() => {
    if (!status.didJustFinish) return;
    player.pause();
    void player.seekTo(0);
  }, [player, status.didJustFinish]);

  const togglePlayback = async () => {
    await setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: false,
    });
    if (status.playing) {
      player.pause();
      return;
    }
    if (
      status.didJustFinish ||
      (duration > 0 && currentTime >= duration - 0.15)
    ) {
      await player.seekTo(0);
    }
    player.play();
  };

  return (
    <View
      className={`mb-2 rounded-2xl px-3 py-3 ${isMine ? 'bg-white/15' : 'bg-slate-100 dark:bg-slate-900'}`}
    >
      <View className="flex-row items-center gap-3">
        <View className="relative">
          {status.playing ? (
            <View className="absolute -top-5 left-0 right-0 flex-row items-end justify-center gap-[3px]">
              {[0, 1, 2].map((index) => (
                <Animated.View
                  key={index}
                  style={{
                    width: 4,
                    borderRadius: 999,
                    backgroundColor: themeColor(foreground),
                    opacity: pulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: index === 1 ? [0.45, 1] : [0.25, 0.75],
                    }),
                    height: pulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: index === 1 ? [8, 18] : [14, 7],
                    }),
                  }}
                />
              ))}
            </View>
          ) : null}
          <Pressable
            onPress={togglePlayback}
            className={`h-9 w-9 items-center justify-center rounded-full ${isMine ? 'bg-white/20' : 'bg-white dark:bg-slate-800'}`}
          >
            <Ionicons
              name={status.playing ? 'pause' : 'play'}
              size={18}
              color={themeColor(foreground)}
            />
          </Pressable>
        </View>
        <View className="flex-1">
          <View className="h-8 flex-row items-center gap-[3px]">
            {AUDIO_BARS.map((height, index) => (
              <View
                key={`${source}-${index}`}
                style={{
                  height,
                  flex: 1,
                  borderRadius: 999,
                  backgroundColor: themeColor(
                    index <= playedBars ? foreground : muted,
                  ),
                  opacity: index <= playedBars ? 0.95 : 0.8,
                }}
              />
            ))}
          </View>
          <View className="mt-1 flex-row items-center justify-between">
            <Text
              className={`text-[11px] font-semibold ${isMine ? 'text-white/80' : 'text-slate-500 dark:text-slate-400'}`}
            >
              {durationLabel(
                status.playing || currentTime > 0 ? currentTime : duration,
              )}
            </Text>
            <Text
              className={`ml-2 flex-1 text-right text-[11px] ${isMine ? 'text-white/70' : 'text-slate-400'}`}
              numberOfLines={1}
            >
              {label || 'Voice message'}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export default function ShiftChatScreen() {
  const { themeColor } = useNativeTheme();
  const { assignmentId, shiftId, title, shiftDate } = useLocalSearchParams<{
    assignmentId?: string;
    shiftId?: string;
    title?: string;
    shiftDate?: string;
  }>();
  const { token, user } = useAuth();
  const [messages, setMessages] = useState<ShiftChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ShiftChatMessage | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<
    string | null
  >(null);
  const [pendingImage, setPendingImage] = useState<{
    uri: string;
    name: string;
    type: string;
  } | null>(null);
  const [viewingImage, setViewingImage] = useState<{
    url: string;
    senderName: string;
    createdAt: string;
  } | null>(null);
  const [pendingAudio, setPendingAudio] = useState<{
    uri: string;
    name: string;
    type: string;
    durationMillis: number;
  } | null>(null);
  const listRef = useRef<FlatList<ShiftChatMessage>>(null);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder, 250);

  const messagesQuery = useQuery({
    queryKey: ['shift-chat-messages', token, shiftId],
    enabled: Boolean(token && shiftId),
    queryFn: () =>
      fetchShiftChatMessages({
        token: token as string,
        shiftId: shiftId as string,
      }),
  });
  const assignmentQuery = useQuery({
    queryKey: ['shift-chat-assignment', token, assignmentId],
    enabled: Boolean(token && assignmentId),
    queryFn: () =>
      fetchAssignmentById({
        token: token as string,
        assignmentId: assignmentId as string,
      }),
  });

  useEffect(() => {
    setMessages(messagesQuery.data ?? []);
  }, [messagesQuery.data]);

  useEffect(() => {
    if (!token || !shiftId) return;
    void markShiftChatRead({ token, shiftId });
  }, [shiftId, token]);

  useEffect(() => {
    if (!token || !shiftId) return undefined;
    const socket = connectShiftChatSocket({
      token,
      shiftId,
      onMessage: (message) => {
        setMessages((current) =>
          current.some((item) => item.id === message.id)
            ? current
            : [...current, message],
        );
        if (message.senderUserId !== user?.id) {
          void markShiftChatRead({ token, shiftId });
        }
      },
      onMessageDeleted: ({ id }) => {
        setMessages((current) => current.filter((item) => item.id !== id));
        setReplyingTo((current) => (current?.id === id ? null : current));
      },
    });
    return () => {
      socket.disconnect();
    };
  }, [shiftId, token, user?.id]);

  useEffect(() => {
    if (messages.length === 0) return;
    const id = setTimeout(
      () => listRef.current?.scrollToEnd({ animated: true }),
      50,
    );
    return () => clearTimeout(id);
  }, [messages.length]);

  useEffect(() => {
    void setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: true,
    });
  }, []);

  const titleText = useMemo(() => {
    const assignment = assignmentQuery.data;
    const selectedShift = assignment?.shifts.find(
      (item) => item.id === shiftId,
    );
    if (assignment && selectedShift) {
      return shiftChatConversationTitle({
        projectNumber: assignment.projectNumber,
        projectName: assignment.projectName || assignment.title,
        shiftName: selectedShift.shiftName,
      });
    }
    return title || 'Shift Chat';
  }, [assignmentQuery.data, shiftId, title]);
  const dateText = useMemo(() => shiftDateLabel(shiftDate), [shiftDate]);

  const scrollToMessage = (messageId: string) => {
    const index = messages.findIndex((message) => message.id === messageId);
    if (index < 0) return;
    listRef.current?.scrollToIndex({
      index,
      animated: true,
      viewPosition: 0.35,
    });
    setHighlightedMessageId(messageId);
    setTimeout(
      () =>
        setHighlightedMessageId((current) =>
          current === messageId ? null : current,
        ),
      1600,
    );
  };

  const confirmDeleteMessage = (message: ShiftChatMessage) => {
    if (!token || !shiftId || message.senderUserId !== user?.id) return;
    Alert.alert(
      'Delete message',
      'Delete this message for everyone in this shift chat?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void deleteMessage(message);
          },
        },
      ],
    );
  };

  const deleteMessage = async (message: ShiftChatMessage) => {
    if (!token || !shiftId) return;
    const previous = messages;
    setMessages((current) => current.filter((item) => item.id !== message.id));
    setReplyingTo((current) => (current?.id === message.id ? null : current));
    try {
      await deleteShiftChatMessage({ token, shiftId, messageId: message.id });
    } catch (error) {
      setMessages(previous);
      Alert.alert(
        'Could not delete message',
        error instanceof Error ? error.message : 'Please try again.',
      );
    }
  };

  const sendText = async () => {
    if (!token || !shiftId || !draft.trim()) return;
    setSending(true);
    const body = draft.trim();
    setDraft('');
    try {
      await sendShiftChatMessage({
        token,
        shiftId,
        body,
        kind: 'text',
        ...replyPayload(replyingTo),
      });
      setReplyingTo(null);
    } catch (error) {
      setDraft(body);
      Alert.alert(
        'Could not send message',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setSending(false);
    }
  };

  const uploadAndSendMedia = async (
    asset: { uri: string; name: string; type: string },
    kind: 'image' | 'audio',
  ) => {
    if (!token || !shiftId) return;
    const upload = await uploadShiftChatMedia({ token, shiftId, asset });
    if (!upload) throw new Error('Upload failed.');
    const message = await sendShiftChatMessage({
      token,
      shiftId,
      kind,
      mediaUrl: upload.url,
      mediaName: upload.name,
      mediaContentType: upload.contentType,
      mediaSize: upload.size,
      ...replyPayload(replyingTo),
    });
    setMessages((current) =>
      current.some((item) => item.id === message.id)
        ? current
        : [...current, message],
    );
    setReplyingTo(null);
  };

  const pickImage = async (source: 'camera' | 'library') => {
    if (!token || !shiftId) return;
    try {
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Permission needed',
          source === 'camera'
            ? 'Allow camera access to take photos.'
            : 'Allow photo access to send images.',
        );
        return;
      }
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.82,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.85,
            });
      if (result.canceled || !result.assets[0]) return;
      const picked = result.assets[0];
      setPendingImage({
        uri: picked.uri,
        name: picked.fileName || assetName(picked.uri, 'chat-image.jpg'),
        type: picked.mimeType || 'image/jpeg',
      });
    } catch (error) {
      Alert.alert(
        'Could not prepare image',
        error instanceof Error ? error.message : 'Please try again.',
      );
    }
  };

  const chooseImageSource = () => {
    if (sending || recorderState.isRecording || pendingAudio || pendingImage)
      return;
    Alert.alert('Send photo', 'Choose a photo source.', [
      { text: 'Camera', onPress: () => void pickImage('camera') },
      { text: 'Gallery', onPress: () => void pickImage('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const sendPendingImage = async () => {
    if (!pendingImage || !token || !shiftId) return;
    setSending(true);
    try {
      await uploadAndSendMedia(pendingImage, 'image');
      setPendingImage(null);
    } catch (error) {
      Alert.alert(
        'Could not send image',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setSending(false);
    }
  };

  const startRecording = async () => {
    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Permission needed',
        'Allow microphone access to record voice messages.',
      );
      return;
    }
    await setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: true,
    });
    await audioRecorder.prepareToRecordAsync();
    audioRecorder.record();
  };

  const stopRecordingForPreview = async () => {
    try {
      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      if (!uri) throw new Error('No recording was created.');
      setPendingAudio({
        uri,
        name: assetName(uri, `voice-message-${Date.now()}.m4a`),
        type: Platform.OS === 'android' ? 'audio/mp4' : 'audio/mp4',
        durationMillis: recorderState.durationMillis || 0,
      });
    } catch (error) {
      Alert.alert(
        'Could not prepare voice message',
        error instanceof Error ? error.message : 'Please try again.',
      );
    }
  };

  const sendPendingAudio = async () => {
    if (!pendingAudio || !token || !shiftId) return;
    setSending(true);
    try {
      await uploadAndSendMedia(
        {
          uri: pendingAudio.uri,
          name: pendingAudio.name,
          type: pendingAudio.type,
        },
        'audio',
      );
      setPendingAudio(null);
    } catch (error) {
      Alert.alert(
        'Could not send voice message',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setSending(false);
    }
  };

  const toggleRecording = async () => {
    if (sending) return;
    try {
      if (recorderState.isRecording) {
        await stopRecordingForPreview();
      } else {
        setPendingAudio(null);
        await startRecording();
      }
    } catch (error) {
      Alert.alert(
        'Recording error',
        error instanceof Error ? error.message : 'Please try again.',
      );
      setSending(false);
    }
  };

  return (
    <SafeAreaView
      edges={['bottom', 'left', 'right']}
      className="flex-1 bg-[#E8EDF5] dark:bg-slate-900"
    >
      <StatusBar style="light" backgroundColor="#1c2e4a" translucent={false} />
      <Modal
        visible={Boolean(viewingImage)}
        transparent
        animationType="fade"
        onRequestClose={() => setViewingImage(null)}
      >
        <View className="flex-1 bg-black">
          <SafeAreaView className="flex-1">
            <View className="flex-row items-center gap-3 px-4 py-3">
              <Pressable
                onPress={() => setViewingImage(null)}
                className="h-10 w-10 items-center justify-center rounded-full bg-white/15"
              >
                <Ionicons name="close" size={22} color="#fff" />
              </Pressable>
              <View className="flex-1">
                <Text
                  className="text-sm font-bold text-white"
                  numberOfLines={1}
                >
                  {viewingImage?.senderName || 'Worker'}
                </Text>
                <Text className="text-xs text-white/60">
                  {viewingImage ? timeLabel(viewingImage.createdAt) : ''}
                </Text>
              </View>
            </View>
            {viewingImage ? (
              <RNImage
                source={{ uri: viewingImage.url }}
                resizeMode="contain"
                style={{ flex: 1, width: '100%' }}
              />
            ) : null}
          </SafeAreaView>
        </View>
      </Modal>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <PageHeader
          title="Shift Chat"
          subtitle={dateText ? `Shift date: ${dateText}` : undefined}
        />
        <View className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3">
          <Text className="text-sm font-extrabold leading-5 text-slate-900 dark:text-slate-100">
            {titleText}
          </Text>
        </View>

        {messagesQuery.isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#CC0000" />
            <Text className="mt-3 text-sm font-semibold text-slate-500 dark:text-slate-400">
              Loading chat...
            </Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            className="flex-1 px-4"
            contentContainerStyle={{ paddingVertical: 16, gap: 10 }}
            onScrollToIndexFailed={(info) => {
              listRef.current?.scrollToOffset({
                offset: Math.max(0, info.averageItemLength * info.index),
                animated: true,
              });
              setTimeout(() => {
                listRef.current?.scrollToIndex({
                  index: info.index,
                  animated: true,
                  viewPosition: 0.35,
                });
              }, 250);
            }}
            renderItem={({ item }) => {
              const isMine = item.senderUserId === user?.id;
              const isHighlighted = highlightedMessageId === item.id;
              return (
                <Pressable
                  onLongPress={() => setReplyingTo(item)}
                  delayLongPress={220}
                  className={`max-w-[84%] rounded-2xl px-3 py-2 ${isMine ? 'self-end bg-blue-600' : 'self-start bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700'} ${isHighlighted ? 'border-2 border-yellow-400' : ''}`}
                >
                  <Text
                    className={`mb-1 text-[11px] font-bold ${isMine ? 'text-white/80' : 'text-slate-500 dark:text-slate-400'}`}
                    numberOfLines={1}
                  >
                    {item.senderName || 'Worker'}
                  </Text>
                  {item.replyToMessageId ? (
                    <ReplyPreview
                      senderName={item.replyToSenderName}
                      preview={item.replyToPreview}
                      isMine={isMine}
                      onPress={() => scrollToMessage(item.replyToMessageId)}
                    />
                  ) : null}
                  {item.kind === 'image' && item.mediaUrl ? (
                    <Pressable
                      onPress={() =>
                        setViewingImage({
                          url: item.mediaUrl,
                          senderName: item.senderName,
                          createdAt: item.createdAt,
                        })
                      }
                      className="mb-2 overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-900"
                    >
                      <RNImage
                        source={{ uri: item.mediaUrl }}
                        resizeMode="cover"
                        style={{ width: 224, height: 176 }}
                        className="bg-[#F1F5F9] dark:bg-[#0f172a]"
                      />
                    </Pressable>
                  ) : null}
                  {item.kind === 'audio' && item.mediaUrl ? (
                    <AudioMessageBubble
                      source={item.mediaUrl}
                      label={item.mediaName}
                      isMine={isMine}
                    />
                  ) : null}
                  {item.body ? (
                    <Text
                      className={`text-sm ${isMine ? 'text-white' : 'text-slate-800 dark:text-slate-100'}`}
                    >
                      {item.body}
                    </Text>
                  ) : null}
                  <View className="mt-1 flex-row items-center justify-between gap-3">
                    <Text
                      className={`text-[10px] ${isMine ? 'text-white/70' : 'text-slate-400'}`}
                    >
                      {timeLabel(item.createdAt)}
                    </Text>
                    <Pressable
                      onPress={() => setReplyingTo(item)}
                      hitSlop={8}
                      className={`flex-row items-center gap-1 rounded-full px-2 py-1 ${isMine ? 'bg-white/10' : 'bg-slate-100 dark:bg-slate-900'}`}
                    >
                      <Ionicons
                        name="return-up-back-outline"
                        size={12}
                        color={themeColor(isMine ? '#fff' : NAVY)}
                      />
                      <Text
                        className={`text-[10px] font-bold ${isMine ? 'text-white' : 'text-slate-600 dark:text-slate-200'}`}
                      >
                        Reply
                      </Text>
                    </Pressable>
                    {isMine ? (
                      <Pressable
                        onPress={() => confirmDeleteMessage(item)}
                        hitSlop={8}
                        className="flex-row items-center gap-1 rounded-full bg-white/10 px-2 py-1"
                      >
                        <Ionicons name="trash-outline" size={12} color="#fff" />
                        <Text className="text-[10px] font-bold text-white">
                          Delete
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                </Pressable>
              );
            }}
          />
        )}

        <View className="border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-3">
          {replyingTo ? (
            <View className="mb-3 flex-row items-center gap-3 rounded-2xl border border-blue-100 dark:border-[#1e40af] bg-blue-50 dark:bg-[#172554] px-3 py-2">
              <View className="flex-1">
                <Text
                  className="text-xs font-bold text-blue-700 dark:text-[#93c5fd]"
                  numberOfLines={1}
                >
                  Replying to {replyingTo.senderName || 'Worker'}
                </Text>
                <Text
                  className="text-xs text-slate-600 dark:text-slate-200"
                  numberOfLines={1}
                >
                  {messagePreview(replyingTo)}
                </Text>
              </View>
              <Pressable
                onPress={() => setReplyingTo(null)}
                className="h-8 w-8 items-center justify-center rounded-full bg-white dark:bg-slate-800"
              >
                <Ionicons name="close" size={16} color={themeColor(NAVY)} />
              </Pressable>
            </View>
          ) : null}
          {pendingImage ? (
            <View className="mb-3 rounded-2xl border border-blue-100 dark:border-[#1e40af] bg-blue-50 dark:bg-[#172554] p-3">
              <View className="mb-2 flex-row items-center justify-between">
                <Text className="text-xs font-bold uppercase text-blue-700 dark:text-[#93c5fd]">
                  Preview photo
                </Text>
                <Pressable
                  disabled={sending}
                  onPress={() => setPendingImage(null)}
                  className="h-8 w-8 items-center justify-center rounded-full bg-white dark:bg-slate-800"
                >
                  <Ionicons name="trash-outline" size={16} color="#CC0000" />
                </Pressable>
              </View>
              <View className="overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-900">
                <RNImage
                  source={{ uri: pendingImage.uri }}
                  resizeMode="cover"
                  style={{ width: '100%', height: 192 }}
                  className="bg-[#F1F5F9] dark:bg-[#0f172a]"
                />
              </View>
              <Pressable
                disabled={sending}
                onPress={sendPendingImage}
                className="mt-3 h-10 flex-row items-center justify-center gap-2 rounded-xl bg-blue-600 disabled:opacity-50"
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="send" size={16} color="#fff" />
                )}
                <Text className="text-sm font-bold text-white">Send photo</Text>
              </Pressable>
            </View>
          ) : null}
          {pendingAudio ? (
            <View className="mb-3 rounded-2xl border border-blue-100 dark:border-[#1e40af] bg-blue-50 dark:bg-[#172554] p-3">
              <View className="mb-2 flex-row items-center justify-between">
                <Text className="text-xs font-bold uppercase text-blue-700 dark:text-[#93c5fd]">
                  Preview voice message
                </Text>
                <Pressable
                  disabled={sending}
                  onPress={() => setPendingAudio(null)}
                  className="h-8 w-8 items-center justify-center rounded-full bg-white dark:bg-slate-800"
                >
                  <Ionicons name="trash-outline" size={16} color="#CC0000" />
                </Pressable>
              </View>
              <AudioMessageBubble
                source={pendingAudio.uri}
                label={durationLabel(pendingAudio.durationMillis / 1000)}
                isMine={false}
              />
              <Pressable
                disabled={sending}
                onPress={sendPendingAudio}
                className="mt-1 h-10 flex-row items-center justify-center gap-2 rounded-xl bg-blue-600 disabled:opacity-50"
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="send" size={16} color="#fff" />
                )}
                <Text className="text-sm font-bold text-white">Send audio</Text>
              </Pressable>
            </View>
          ) : null}
          <View className="flex-row items-center gap-2">
            <Pressable
              disabled={
                sending ||
                recorderState.isRecording ||
                Boolean(pendingAudio) ||
                Boolean(pendingImage)
              }
              onPress={chooseImageSource}
              className="h-10 w-10 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-900 disabled:opacity-50"
            >
              <Ionicons
                name="image-outline"
                size={20}
                color={themeColor(NAVY)}
              />
            </Pressable>
            <Pressable
              disabled={
                (sending && !recorderState.isRecording) ||
                Boolean(pendingAudio) ||
                Boolean(pendingImage)
              }
              onPress={toggleRecording}
              className={`h-10 w-10 items-center justify-center rounded-xl ${recorderState.isRecording ? 'bg-red-600' : 'bg-slate-100 dark:bg-slate-900'} disabled:opacity-50`}
            >
              <Ionicons
                name={recorderState.isRecording ? 'stop' : 'mic-outline'}
                size={20}
                color={themeColor(recorderState.isRecording ? '#fff' : NAVY)}
              />
            </Pressable>
            {recorderState.isRecording ? (
              <View className="h-10 flex-1 flex-row items-center gap-2 rounded-xl border border-red-100 dark:border-[#991b1b] bg-red-50 dark:bg-[#450a0a] px-3">
                <View className="h-2.5 w-2.5 rounded-full bg-red-600" />
                <Text
                  className="flex-1 text-sm font-semibold text-red-700 dark:text-[#fca5a5]"
                  numberOfLines={1}
                >
                  Recording{' '}
                  {durationLabel((recorderState.durationMillis || 0) / 1000)}
                </Text>
                <Text className="text-xs font-medium text-red-500 dark:text-[#fca5a5]">
                  tap stop
                </Text>
              </View>
            ) : (
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Message the shift crew..."
                placeholderTextColor={themeColor('#64748B')}
                className="h-10 flex-1 rounded-xl bg-slate-100 dark:bg-slate-900 px-3 text-sm text-slate-900 dark:text-slate-100"
                editable={!sending && !pendingAudio && !pendingImage}
              />
            )}
            <Pressable
              disabled={sending || !draft.trim()}
              onPress={sendText}
              className="h-10 w-10 items-center justify-center rounded-xl bg-blue-600 disabled:opacity-50"
            >
              {sending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="send" size={17} color="#fff" />
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
