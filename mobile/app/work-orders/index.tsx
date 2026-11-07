import { useNativeTheme } from '@/hooks/use-native-theme';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { NotificationBell } from '@/components/notification-bell';
import { DeclineShiftModal } from '@/components/decline-shift-modal';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '@/contexts/auth-context';
import {
  fetchAssignmentById,
  updateAssignmentShiftConfirmation,
  type AssignmentListItem,
} from '@/lib/assignments-service';
import {
  fetchFormSubmissions,
  fetchFormTemplates,
  type FormSubmission,
  type FormTemplate,
} from '@/lib/forms-service';
import {
  acknowledgeShiftCancellation,
  fetchMobileNotifications,
} from '@/lib/notifications-service';
import { fetchShiftChatUnreadCount } from '@/lib/shift-chat-service';
import { shiftChatConversationTitle } from '@/lib/shift-chat-conversation';
import {
  canRespondToShift,
  isShiftNoResponse,
  useShiftResponseClock,
} from '@/lib/shift-response';

const WORK_ORDER_FORM_HREF = '/work-orders/form';
const CREW_HREF = '/work-orders/crew';
const EQUIPMENT_HREF = '/work-orders/equipment';
const CLIENT_HREF = '/work-orders/client';
const JOB_DOCUMENTS_HREF = '/work-orders/job-documents';
const SHIFT_CHAT_HREF = '/work-orders/chat';
const NAVY = '#1c2e4a';
const MUTED = '#74819a';

function monthDay(iso?: string) {
  if (!iso) return '';
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
}

function projectCode(item?: AssignmentListItem | null) {
  const raw = item?.projectNumber?.trim();
  if (!raw) return '';
  return raw.startsWith('#') ? raw : `#${raw}`;
}

function shiftDetailStatus(shift: AssignmentListItem['shifts'][number] | null) {
  if (!shift)
    return {
      label: 'Pending',
      wrap: 'bg-amber-100 dark:bg-[#451a03]',
      text: 'text-amber-700 dark:text-[#fcd34d]',
    };
  if (isShiftNoResponse(shift)) {
    return {
      label: 'No Response',
      wrap: 'bg-slate-200 dark:bg-slate-800',
      text: 'text-slate-800 dark:text-slate-100',
    };
  }
  if (shift.effectiveStatus === 'pm_approved') {
    return { label: 'PM Approved', wrap: 'bg-teal-500', text: 'text-white' };
  }
  if (shift.completed || shift.effectiveStatus === 'shift_completed') {
    return {
      label: 'Shift Completed',
      wrap: 'bg-slate-200 dark:bg-slate-800',
      text: 'text-slate-900 dark:text-slate-100',
    };
  }
  if (shift.effectiveStatus === 'shift_cancelled') {
    return {
      label: 'Shift Cancelled',
      wrap: 'bg-red-200 dark:bg-[#450a0a]',
      text: 'text-red-900 dark:text-[#fca5a5]',
    };
  }
  if (shift.confirmationStatus === 'declined') {
    return {
      label: 'Declined',
      wrap: 'bg-red-200 dark:bg-[#450a0a]',
      text: 'text-red-900 dark:text-[#fca5a5]',
    };
  }
  if (
    shift.effectiveStatus === 'workers_confirmed' ||
    shift.confirmationStatus === 'confirmed'
  ) {
    return {
      label: 'Confirmed',
      wrap: 'bg-emerald-200 dark:bg-[#022c22]',
      text: 'text-emerald-900 dark:text-[#6ee7b7]',
    };
  }
  if (shift.confirmationStatus === 'pending' && shift.confirmationRequested) {
    return {
      label: 'Action Required',
      wrap: 'bg-orange-200 dark:bg-[#431407]',
      text: 'text-orange-900 dark:text-[#fdba74]',
    };
  }
  if (shift.effectiveStatus === 'customer_pending') {
    return {
      label: 'Customer Pending',
      wrap: 'bg-amber-200 dark:bg-[#451a03]',
      text: 'text-amber-900 dark:text-[#fcd34d]',
    };
  }
  if (shift.effectiveStatus === 'dispatch_pending') {
    return {
      label: 'Dispatch Pending',
      wrap: 'bg-amber-200 dark:bg-[#451a03]',
      text: 'text-amber-900 dark:text-[#fcd34d]',
    };
  }
  if (
    shift.effectiveStatus === 'ready_to_notify' ||
    shift.effectiveStatus === 'awaiting_response'
  ) {
    return {
      label: 'Pending Notification',
      wrap: 'bg-blue-200 dark:bg-[#172554]',
      text: 'text-blue-900 dark:text-[#93c5fd]',
    };
  }
  return {
    label: 'Pending',
    wrap: 'bg-amber-100 dark:bg-[#451a03]',
    text: 'text-amber-700 dark:text-[#fcd34d]',
  };
}

function defaultShiftId(item?: AssignmentListItem | null) {
  if (!item?.shifts.length) return '';
  const today = new Date().toISOString().slice(0, 10);
  return (
    item.shifts.find((shift) => shift.date === today)?.id ??
    item.shifts[0]?.id ??
    ''
  );
}

function fullShiftDateLabel(iso?: string) {
  if (!iso) return '';
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
}

function shiftTimeLabel(value?: string) {
  if (!value) return '';
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return value;
  const hours = Number(match[1]);
  const minutes = match[2];
  if (!Number.isInteger(hours) || hours < 0 || hours > 23) return value;
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes} ${period}`;
}

function categoryKey(category?: string) {
  const key = (category || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s-]+/g, ' ');
  if (key.includes('timesheet')) return 'timesheet';
  if (key.includes('incident')) return 'incident';
  if (key.includes('work order') || key.includes('workorder'))
    return 'workorder';
  return 'other';
}

type FormCategoryKey = 'workorder' | 'timesheet' | 'incident' | 'other';
type QuickAccessItem = {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  count?: number;
  disabled?: boolean;
  onPress: () => void;
};
function templatesByCategory(
  templates: FormTemplate[],
  category: FormCategoryKey,
) {
  return templates.filter(
    (template) => categoryKey(template.category) === category,
  );
}

function categoryMeta(category: FormCategoryKey, templates: FormTemplate[]) {
  const firstTemplate = templatesByCategory(templates, category)[0];
  if (category === 'workorder') {
    return {
      title: firstTemplate?.category || 'Work Order',
      subtitle: firstTemplate?.description || 'Assignment form for this shift',
      tone: 'blue',
    } as const;
  }
  if (category === 'timesheet') {
    return {
      title: firstTemplate?.category || 'Timesheet',
      subtitle: firstTemplate?.description || 'Worker hours and signatures',
      tone: 'green',
    } as const;
  }
  if (category === 'incident') {
    return {
      title: firstTemplate?.category || 'Incident Report',
      subtitle:
        firstTemplate?.description || 'Use only if an issue occurs on site',
      tone: 'red',
    } as const;
  }
  return {
    title: 'Other Forms',
    subtitle: firstTemplate?.description || 'Additional required documents',
    tone: 'purple',
  } as const;
}

function categoryActionsFromTemplates(templates: FormTemplate[]) {
  const order: FormCategoryKey[] = [
    'workorder',
    'timesheet',
    'incident',
    'other',
  ];
  const available = new Set(
    templates.map((template) => categoryKey(template.category)),
  );
  return order
    .filter((category) => available.has(category))
    .map((category) => ({
      id: category,
      category,
      ...categoryMeta(category, templates),
    }));
}

function submittedTemplatesForShift(
  submissions: FormSubmission[],
  shiftId: string,
) {
  return new Set(
    submissions
      .filter(
        (submission) =>
          submission.shiftId === shiftId && submission.status === 'submitted',
      )
      .map((submission) => submission.templateId),
  );
}

export default function AssignmentDetailScreen() {
  const { themeColor } = useNativeTheme();
  useShiftResponseClock();
  const insets = useSafeAreaInsets();
  const { assignmentId, shiftId, notificationId } = useLocalSearchParams<{
    assignmentId?: string;
    shiftId?: string;
    notificationId?: string;
  }>();
  const { token, hasPermission, user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedShiftId, setSelectedShiftId] = useState(
    typeof shiftId === 'string' ? shiftId : '',
  );
  const [declineConfirmationOpen, setDeclineConfirmationOpen] = useState(false);
  const canConfirmShift = hasPermission('mobile.shifts.confirm');
  const canSubmitTimesheets = hasPermission('mobile.timesheets.submit');
  const canSubmitIncidents = hasPermission('mobile.incidents.submit');
  const canSubmitWorkOrdersGlobally = hasPermission(
    'mobile.work-orders.submit',
  );
  const canSubmitOtherForms = hasPermission('form-submissions.write');
  const [openingCategory, setOpeningCategory] =
    useState<FormCategoryKey | null>(null);
  const openingCategoryRef = useRef<FormCategoryKey | null>(null);

  const assignmentsQuery = useQuery({
    queryKey: ['mobile-assignment-detail', token, assignmentId],
    enabled: Boolean(token && assignmentId),
    queryFn: () =>
      fetchAssignmentById({
        token: token as string,
        assignmentId: assignmentId as string,
      }),
  });

  const assignment = assignmentsQuery.data ?? null;
  const selectedShift = useMemo(() => {
    if (!assignment?.shifts.length) return null;
    return (
      assignment.shifts.find((shift) => shift.id === selectedShiftId) ??
      assignment.shifts[0] ??
      null
    );
  }, [assignment, selectedShiftId]);
  const isViewerUser = (user?.role || '').toLowerCase() === 'viewer';
  const isAdminUser =
    user?.role === 'admin' || Boolean(user?.roles?.includes('admin'));
  const timesheetEntryLocked =
    isViewerUser && !isAdminUser && !selectedShift?.canManageWorkOrder;
  const canSubmitWorkOrders =
    canSubmitWorkOrdersGlobally || Boolean(selectedShift?.canManageWorkOrder);
  const canSubmitForms =
    canSubmitTimesheets ||
    canSubmitIncidents ||
    canSubmitWorkOrders ||
    canSubmitOtherForms;

  const confirmationMutation = useMutation({
    mutationFn: async (status: 'confirmed' | 'declined') => {
      if (!token || !assignment || !selectedShift)
        throw new Error('Shift unavailable.');
      if (!canRespondToShift(selectedShift)) {
        throw new Error(
          'This shift has ended and can no longer accept a response.',
        );
      }
      return updateAssignmentShiftConfirmation({
        token,
        assignmentId: assignment.id,
        shiftId: selectedShift.id,
        status,
      });
    },
    onSuccess: async (_assignment, status) => {
      await queryClient.invalidateQueries({
        queryKey: ['mobile-assignment-detail'],
      });
      await queryClient.invalidateQueries({ queryKey: ['mobile-assignments'] });
      if (status === 'declined') {
        setDeclineConfirmationOpen(false);
        router.replace('/(tabs)');
        return;
      }
      await assignmentsQuery.refetch();
    },
    onError: (error) => {
      Alert.alert(
        'Unable to update shift',
        error instanceof Error ? error.message : 'Please try again.',
      );
    },
  });

  useEffect(() => {
    if (!assignment || selectedShiftId) return;
    setSelectedShiftId(defaultShiftId(assignment));
  }, [assignment, selectedShiftId]);

  useEffect(() => {
    if (typeof shiftId === 'string' && shiftId && shiftId !== selectedShiftId) {
      setSelectedShiftId(shiftId);
    }
  }, [selectedShiftId, shiftId]);

  const templatesQuery = useQuery({
    queryKey: [
      'mobile-assignment-form-templates',
      token,
      assignment?.id,
      selectedShift?.id,
    ],
    enabled: Boolean(token && assignment?.id && selectedShift?.id),
    queryFn: () =>
      fetchFormTemplates({
        token: token as string,
        workOrderId: assignment?.id as string,
        shiftId: selectedShift?.id,
      }),
  });

  const submissionsQuery = useQuery({
    queryKey: ['mobile-assignment-form-submissions', token, assignment?.id],
    enabled: Boolean(token && assignment?.id),
    queryFn: () =>
      fetchFormSubmissions({
        token: token as string,
        workOrderId: assignment?.id as string,
      }),
  });

  const chatUnreadQuery = useQuery({
    queryKey: ['mobile-shift-chat-unread', token, selectedShift?.id],
    enabled: Boolean(token && selectedShift?.id),
    queryFn: () =>
      fetchShiftChatUnreadCount({
        token: token as string,
        shiftId: selectedShift?.id as string,
      }),
  });
  const refetchAssignment = assignmentsQuery.refetch;
  const refetchTemplates = templatesQuery.refetch;
  const refetchSubmissions = submissionsQuery.refetch;
  const refetchChatUnread = chatUnreadQuery.refetch;

  useFocusEffect(
    useCallback(() => {
      openingCategoryRef.current = null;
      setOpeningCategory(null);
      return undefined;
    }, []),
  );

  useFocusEffect(
    useCallback(() => {
      if (token && assignmentId && assignment?.id) void refetchAssignment();
      if (token && assignment?.id) {
        void refetchTemplates();
        void refetchSubmissions();
      }
      if (token && selectedShift?.id) void refetchChatUnread();
    }, [
      assignment?.id,
      assignmentId,
      refetchAssignment,
      refetchChatUnread,
      refetchSubmissions,
      refetchTemplates,
      selectedShift?.id,
      token,
    ]),
  );

  const formTemplates = useMemo(
    () => templatesQuery.data ?? [],
    [templatesQuery.data],
  );
  const formSubmissions = useMemo(
    () => submissionsQuery.data ?? [],
    [submissionsQuery.data],
  );
  const canOpenCategory = useCallback(
    (category: FormCategoryKey) => {
      if (category === 'timesheet') return canSubmitTimesheets;
      if (category === 'incident') return canSubmitIncidents;
      if (category === 'workorder') return canSubmitWorkOrders;

      return true;
    },
    [canSubmitTimesheets, canSubmitIncidents, canSubmitWorkOrders],
  );
  const accessibleFormTemplates = useMemo(
    () =>
      formTemplates.filter((template) =>
        canOpenCategory(categoryKey(template.category)),
      ),
    [formTemplates, canOpenCategory],
  );
  const requiredAccessibleFormTemplates = useMemo(
    () =>
      accessibleFormTemplates.filter(
        (template) => template.isRequired !== false,
      ),
    [accessibleFormTemplates],
  );
  const categoryActions = useMemo(
    () => categoryActionsFromTemplates(accessibleFormTemplates),
    [accessibleFormTemplates],
  );
  const requiredActions = categoryActions;
  const selectedSubmittedTemplates = selectedShift
    ? submittedTemplatesForShift(formSubmissions, selectedShift.id)
    : new Set<string>();
  for (const templateId of selectedShift?.completedFormTemplateIds ?? []) {
    selectedSubmittedTemplates.add(templateId);
  }
  const completedTemplatesForCategory = (category: FormCategoryKey) =>
    category === 'timesheet'
      ? new Set(selectedShift?.completedFormTemplateIds ?? [])
      : selectedSubmittedTemplates;
  const accessibleTemplateIds = useMemo(
    () =>
      new Set(requiredAccessibleFormTemplates.map((template) => template.id)),
    [requiredAccessibleFormTemplates],
  );
  const selectedSubmittedCount = [...selectedSubmittedTemplates].filter(
    (templateId) => accessibleTemplateIds.has(templateId),
  ).length;
  const selectedTotalForms = requiredAccessibleFormTemplates.length;
  const selectedShiftDeclined =
    selectedShift?.confirmationStatus === 'declined';
  const selectedShiftNoResponse = Boolean(
    selectedShift && isShiftNoResponse(selectedShift),
  );
  const selectedShiftCancelled =
    selectedShift?.effectiveStatus === 'shift_cancelled';
  const notifiedCancellationId =
    typeof notificationId === 'string' ? notificationId : '';
  const cancellationNotificationQuery = useQuery({
    queryKey: ['mobile-notifications', token],
    enabled: Boolean(
      token &&
      selectedShiftCancelled &&
      !selectedShift?.cancellationNotificationId &&
      !notifiedCancellationId,
    ),
    queryFn: () => fetchMobileNotifications(token as string),
  });
  const cancellationNotificationId =
    selectedShift?.cancellationNotificationId ||
    notifiedCancellationId ||
    cancellationNotificationQuery.data?.find(
      (notification) =>
        notification.type === 'shift_cancelled' &&
        notification.shiftId === selectedShift?.id &&
        !notification.acknowledgedAt,
    )?.id ||
    '';
  const cancellationConfirmed = Boolean(
    selectedShift?.cancellationAcknowledgedAt,
  );
  const selectedShiftCompleted = Boolean(
    selectedShift?.completed ||
    selectedShift?.effectiveStatus === 'shift_completed' ||
    selectedShift?.effectiveStatus === 'pm_approved',
  );
  const selectedShiftPending = Boolean(
    selectedShift && canRespondToShift(selectedShift),
  );
  const selectedShiftAccepted =
    !selectedShiftCancelled &&
    (selectedShift?.confirmationStatus === 'confirmed' ||
      selectedShiftCompleted);
  const selectedShiftStatus = shiftDetailStatus(selectedShift);
  const cancellationConfirmationMutation = useMutation({
    mutationFn: async () => {
      if (!token || !cancellationNotificationId) {
        throw new Error(
          'The cancellation notification is no longer available.',
        );
      }
      return acknowledgeShiftCancellation(token, cancellationNotificationId);
    },
    onSuccess: () => {
      router.replace('/(tabs)');
      void Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['mobile-assignment-detail'],
        }),
        queryClient.invalidateQueries({ queryKey: ['mobile-assignments'] }),
        queryClient.invalidateQueries({ queryKey: ['mobile-notifications'] }),
        queryClient.invalidateQueries({
          queryKey: ['mobile-notification-assignments'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['mobile-shift-calendar-assignments'],
        }),
      ]);
    },
    onError: (error) => {
      Alert.alert(
        'Unable to confirm cancellation',
        error instanceof Error ? error.message : 'Please try again.',
      );
    },
  });
  const selectedShiftIndex =
    assignment?.shifts.findIndex((shift) => shift.id === selectedShift?.id) ??
    -1;
  const quickAccessItems = useMemo(() => {
    if (!assignment) return [];
    const access = assignment.quickAccess;
    const items: QuickAccessItem[] = [];
    const crewMembers = access?.crew ?? [];
    const shiftCrew =
      selectedShift?.id &&
      crewMembers.some((member) => Array.isArray(member.shiftIds))
        ? crewMembers.filter((member) =>
            member.shiftIds?.includes(selectedShift.id),
          )
        : crewMembers;
    const equipmentItems = access?.equipment ?? [];
    const hasShiftScopedEquipment = equipmentItems.some((item) =>
      Array.isArray(item.shiftIds),
    );
    const shiftEquipment =
      selectedShift?.id && hasShiftScopedEquipment
        ? equipmentItems.filter((item) =>
            item.shiftIds?.includes(selectedShift.id),
          )
        : equipmentItems;

    if (shiftCrew.length > 0 || (access?.crewCount ?? 0) > 0) {
      items.push({
        id: 'crew',
        icon: 'people-outline',
        label: 'Crew',
        count: shiftCrew.length || access?.crewCount,
        onPress: () =>
          router.push({
            pathname: CREW_HREF,
            params: {
              assignmentId: assignment.id,
              shiftId: selectedShift?.id,
              shiftDate: selectedShift?.date,
            },
          }),
      });
    }
    if (
      shiftEquipment.length > 0 ||
      (!hasShiftScopedEquipment && (access?.equipmentCount ?? 0) > 0)
    ) {
      items.push({
        id: 'equipment',
        icon: 'car-outline',
        label: 'Equipment',
        count: shiftEquipment.length || access?.equipmentCount,
        onPress: () =>
          router.push({
            pathname: EQUIPMENT_HREF,
            params: { assignmentId: assignment.id, shiftId: selectedShift?.id },
          }),
      });
    }
    if (access?.hasClient) {
      items.push({
        id: 'client',
        icon: 'person-outline',
        label: 'Client',
        onPress: () =>
          router.push({
            pathname: CLIENT_HREF,
            params: { assignmentId: assignment.id },
          }),
      });
    }
    if ((access?.documentCount ?? 0) > 0) {
      items.push({
        id: 'documents',
        icon: 'document-outline',
        label: 'Documents',
        count: access?.documentCount,
        onPress: () =>
          router.push({
            pathname: JOB_DOCUMENTS_HREF,
            params: { assignmentId: assignment.id, section: 'documents' },
          }),
      });
    }
    if (access?.hasNotes) {
      items.push({
        id: 'notes',
        icon: 'document-text-outline',
        label: 'Notes',
        count: access.notes?.length,
        onPress: () =>
          router.push({
            pathname: JOB_DOCUMENTS_HREF,
            params: { assignmentId: assignment.id, section: 'notes' },
          }),
      });
    }
    if (selectedShift?.id) {
      items.push({
        id: 'chat',
        icon: 'chatbubble-ellipses-outline',
        label: 'Chat',
        count: chatUnreadQuery.data?.unreadCount || undefined,
        disabled:
          selectedShift.confirmationStatus === 'declined' ||
          selectedShift.effectiveStatus === 'shift_cancelled',
        onPress: () =>
          router.push({
            pathname: SHIFT_CHAT_HREF,
            params: {
              assignmentId: assignment.id,
              shiftId: selectedShift.id,
              title: shiftChatConversationTitle({
                projectNumber: assignment.projectNumber,
                projectName: assignment.projectName || assignment.title,
                shiftName: selectedShift.shiftName,
              }),
              shiftDate: selectedShift.date,
            },
          }),
      });
    }
    return items;
  }, [assignment, chatUnreadQuery.data?.unreadCount, selectedShift]);
  const openCategory = (category: FormCategoryKey) => {
    if (openingCategoryRef.current) return;
    if (!assignment || !selectedShift) return;
    if (selectedShift.effectiveStatus === 'shift_cancelled') {
      Alert.alert(
        'Shift cancelled',
        'Forms are disabled for this cancelled shift.',
      );
      return;
    }
    if (selectedShift.confirmationStatus === 'declined') {
      Alert.alert(
        'Shift declined',
        'Forms are disabled for this declined shift.',
      );
      return;
    }
    if (!canOpenCategory(category)) {
      Alert.alert(
        'Access restricted',
        'Your role cannot open or submit this form type.',
      );
      return;
    }
    const templatesForCategory = templatesByCategory(formTemplates, category);
    if (templatesForCategory.length === 0) return;
    openingCategoryRef.current = category;
    setOpeningCategory(category);
    router.push({
      pathname: WORK_ORDER_FORM_HREF,
      params: {
        assignmentId: assignment.id,
        workOrderId: assignment.id,
        shiftId: selectedShift.id,
        projectId: assignment.projectId,
        category,
        scheduledStartTime: selectedShift.startTime,
        scheduledEndTime: selectedShift.endTime,
      },
    });
  };

  const openNavigationApp = async (
    app: 'google' | 'waze' | 'apple' | 'default',
  ) => {
    if (!assignment || !selectedShift) return;

    const latitude = selectedShift.latitude;
    const longitude = selectedShift.longitude;
    const hasCoordinates =
      typeof latitude === 'number' &&
      Number.isFinite(latitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      typeof longitude === 'number' &&
      Number.isFinite(longitude) &&
      longitude >= -180 &&
      longitude <= 180 &&
      !(latitude === 0 && longitude === 0);
    const coordinates = hasCoordinates
      ? `${latitude.toFixed(6)},${longitude.toFixed(6)}`
      : '';
    const address = (selectedShift.address || assignment.location || '').trim();
    const destination = coordinates || address;
    if (!destination) {
      Alert.alert(
        'Location unavailable',
        'This shift does not have coordinates or an address to navigate to.',
      );
      return;
    }

    const encodedDestination = encodeURIComponent(destination);
    let appUrl: string;
    let fallbackUrl: string;

    if (app === 'waze') {
      const wazeUrl = coordinates
        ? `https://waze.com/ul?ll=${encodedDestination}&navigate=yes&zoom=17&utm_source=dr_workops_mobile`
        : `https://waze.com/ul?q=${encodedDestination}&navigate=yes&utm_source=dr_workops_mobile`;
      appUrl = wazeUrl;
      fallbackUrl = wazeUrl;
    } else if (app === 'apple') {
      appUrl = `maps://?daddr=${encodedDestination}&dirflg=d`;
      fallbackUrl = `https://maps.apple.com/?daddr=${encodedDestination}&dirflg=d`;
    } else if (app === 'default') {
      appUrl =
        Platform.OS === 'android'
          ? `geo:0,0?q=${encodedDestination}`
          : `maps://?daddr=${encodedDestination}&dirflg=d`;
      fallbackUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodedDestination}&travelmode=driving&dir_action=navigate`;
    } else {
      appUrl =
        Platform.OS === 'ios'
          ? `comgooglemaps://?daddr=${encodedDestination}&directionsmode=driving`
          : `google.navigation:q=${encodedDestination}&mode=d`;
      fallbackUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodedDestination}&travelmode=driving&dir_action=navigate`;
    }

    try {
      await Linking.openURL(appUrl);
    } catch {
      try {
        await Linking.openURL(fallbackUrl);
      } catch {
        Alert.alert(
          'Navigation unavailable',
          'No compatible navigation application could be opened.',
        );
      }
    }
  };

  const chooseNavigationApp = () => {
    if (Platform.OS === 'ios') {
      const options = ['Google Maps', 'Waze', 'Apple Maps', 'Cancel'];
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: 3, title: 'Start Navigation' },
        (buttonIndex) => {
          if (buttonIndex === 0) void openNavigationApp('google');
          if (buttonIndex === 1) void openNavigationApp('waze');
          if (buttonIndex === 2) void openNavigationApp('apple');
        },
      );
      return;
    }

    Alert.alert(
      'Start Navigation',
      'Choose a navigation app. If it is not installed, its web version will open.',
      [
        {
          text: 'Google Maps',
          onPress: () => void openNavigationApp('google'),
        },
        { text: 'Waze', onPress: () => void openNavigationApp('waze') },
        {
          text: 'Other Maps',
          onPress: () => void openNavigationApp('default'),
        },
      ],
      { cancelable: true },
    );
  };

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      void import('./form');
      void import('./signature-queue');
      void import('./incident-report');
      void import('./crew');
      void import('./equipment');
      void import('./job-documents');
    });
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <SafeAreaView
      edges={['left', 'right']}
      className="flex-1 bg-[#E8EDF5] dark:bg-slate-900"
    >
      <StatusBar style="light" backgroundColor="#1c2e4a" translucent={false} />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        <View
          className="bg-[#1c2e4a] px-5 pb-6 rounded-b-[28px] overflow-hidden"
          style={{ paddingTop: insets.top + 12 }}
        >
          <View className="absolute -right-14 -top-10 h-40 w-40 rounded-full bg-white/10" />
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-3">
              <Pressable
                onPress={() => router.back()}
                className="h-9 w-9 items-center justify-center rounded-xl bg-white/15"
                hitSlop={8}
              >
                <Ionicons name="chevron-back" size={18} color="#fff" />
              </Pressable>
              <View>
                <Text className="text-base font-semibold text-white">
                  DR Traffic Control
                </Text>
                <Text className="text-[11px] text-slate-100">
                  Operations Management Platform
                </Text>
              </View>
            </View>
            <NotificationBell />
          </View>
          <Text className="mt-4 text-[30px] font-bold text-white">
            Shift Details
          </Text>
        </View>

        <View className="-mt-5 px-4">
          {assignmentsQuery.isLoading ? (
            <View className="rounded-[22px] bg-white dark:bg-slate-800 p-6 shadow-sm border border-slate-200 dark:border-slate-700 items-center">
              <ActivityIndicator color="#CC0000" />
              <Text className="mt-3 text-sm font-semibold text-slate-500 dark:text-slate-400">
                Loading shift...
              </Text>
            </View>
          ) : null}

          {!assignmentsQuery.isLoading && assignmentId && !assignment ? (
            <View className="rounded-[22px] bg-white dark:bg-slate-800 p-6 shadow-sm border border-slate-200 dark:border-slate-700 items-center">
              <Ionicons name="alert-circle-outline" size={28} color="#94a3b8" />
              <Text className="mt-2 text-base font-bold text-slate-800 dark:text-slate-100">
                Shift unavailable
              </Text>
              <Text className="mt-1 text-center text-sm leading-5 text-slate-500 dark:text-slate-400">
                {assignmentsQuery.error instanceof Error
                  ? assignmentsQuery.error.message
                  : 'This shift could not be loaded.'}
              </Text>
              <Pressable
                onPress={() => void assignmentsQuery.refetch()}
                className="mt-4 rounded-xl bg-[#1c2e4a] px-5 py-3 active:opacity-80"
              >
                <Text className="font-bold text-white">Retry</Text>
              </Pressable>
            </View>
          ) : null}

          {!assignmentsQuery.isLoading && assignment ? (
            <>
              <View className="rounded-[24px] bg-white dark:bg-slate-800 px-5 pb-6 pt-5 shadow-sm border border-slate-200 dark:border-slate-700">
                <View className="flex-row items-start gap-5">
                  <View className="w-[78px] overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                    <View className="bg-violet-700 py-2">
                      <Text className="text-center text-sm font-extrabold text-white">
                        {selectedShift?.date
                          ? new Date(`${selectedShift.date}T12:00:00`)
                              .toLocaleDateString('en-US', { month: 'short' })
                              .toUpperCase()
                          : '--'}
                      </Text>
                    </View>
                    <Text className="pt-3 text-center text-[28px] font-extrabold text-[#071535] dark:text-slate-100">
                      {selectedShift?.date
                        ? new Date(`${selectedShift.date}T12:00:00`)
                            .getDate()
                            .toString()
                            .padStart(2, '0')
                        : '--'}
                    </Text>
                    <Text className="pb-3 text-center text-sm font-bold text-[#071535] dark:text-slate-100">
                      {selectedShift?.date
                        ? new Date(`${selectedShift.date}T12:00:00`)
                            .toLocaleDateString('en-US', { weekday: 'short' })
                            .toUpperCase()
                        : '--'}
                    </Text>
                  </View>

                  <View className="flex-1">
                    <Text className="text-[18px] font-extrabold text-violet-700 dark:text-[#c4b5fd]">
                      {selectedShift?.shiftName || ''}
                    </Text>
                    <Text className="mt-4 text-sm font-semibold text-slate-700 dark:text-slate-200">
                      Start Time
                    </Text>
                    <Text className="mt-1 text-[26px] font-extrabold text-[#071535] dark:text-slate-100">
                      {shiftTimeLabel(selectedShift?.startTime) || 'Not set'}
                    </Text>
                    <View
                      className={`mt-3 self-start rounded-lg px-3 py-2 ${selectedShiftStatus.wrap}`}
                    >
                      <Text
                        className={`text-xs font-bold ${selectedShiftStatus.text}`}
                      >
                        {selectedShiftStatus.label}
                      </Text>
                    </View>
                  </View>

                  <View className="w-[100px] items-center pt-8">
                    <View className="h-14 w-14 items-center justify-center rounded-full border border-slate-200 dark:border-slate-700">
                      <Ionicons
                        name="shield-checkmark-outline"
                        size={29}
                        color={themeColor('#071535')}
                      />
                    </View>
                    <Text className="mt-2 text-xs text-slate-600 dark:text-slate-200">
                      My Role
                    </Text>
                    <Text className="mt-1 text-center text-sm font-bold text-[#071535] dark:text-slate-100">
                      {selectedShift?.roleName || 'Not assigned'}
                    </Text>
                  </View>
                </View>

                <View className="my-5 h-px bg-slate-200 dark:bg-slate-800" />
                <Text className="text-[22px] font-extrabold text-[#071535] dark:text-slate-100">
                  {assignment.projectName || assignment.title}
                </Text>
                {projectCode(assignment) ? (
                  <Text className="mt-2 text-base text-slate-600 dark:text-slate-200">
                    Project {projectCode(assignment)}
                  </Text>
                ) : null}

                <View className="my-5 h-px bg-slate-200 dark:bg-slate-800" />
                <View className="flex-row items-center gap-4">
                  <Ionicons name="location-outline" size={30} color="#E11D2E" />
                  <Text className="flex-1 text-base leading-6 text-[#071535] dark:text-slate-100">
                    {selectedShift?.address ||
                      assignment.location ||
                      'No location'}
                  </Text>
                  {selectedShift?.address || assignment.location ? (
                    <Pressable
                      onPress={() =>
                        router.push({
                          pathname: '/work-orders/map' as never,
                          params: {
                            latitude: selectedShift?.latitude?.toString() || '',
                            longitude:
                              selectedShift?.longitude?.toString() || '',
                            location:
                              selectedShift?.address || assignment.location,
                            title: assignment.projectName || assignment.title,
                          },
                        })
                      }
                      className="flex-row items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-3"
                    >
                      <Ionicons
                        name="map-outline"
                        size={22}
                        color={themeColor('#5B21B6')}
                      />
                      <Text className="font-bold text-violet-700 dark:text-[#c4b5fd]">
                        View on Map
                      </Text>
                    </Pressable>
                  ) : null}
                </View>

                {selectedShift?.crossStreetLocationDetail ||
                (typeof selectedShift?.latitude === 'number' &&
                  typeof selectedShift?.longitude === 'number') ? (
                  <View className="mt-3 gap-1 pl-11">
                    {selectedShift.crossStreetLocationDetail ? (
                      <Text className="text-sm text-slate-600 dark:text-slate-200">
                        <Text className="font-bold text-slate-700 dark:text-slate-200">
                          Cross street:{' '}
                        </Text>
                        {selectedShift.crossStreetLocationDetail}
                      </Text>
                    ) : null}
                    {typeof selectedShift.latitude === 'number' &&
                    typeof selectedShift.longitude === 'number' ? (
                      <Text className="text-sm text-slate-600 dark:text-slate-200">
                        <Text className="font-bold text-slate-700 dark:text-slate-200">
                          Coordinates:{' '}
                        </Text>
                        {selectedShift.latitude.toFixed(6)},{' '}
                        {selectedShift.longitude.toFixed(6)}
                      </Text>
                    ) : null}
                  </View>
                ) : null}

                {!selectedShiftCancelled &&
                (selectedShift?.address ||
                  assignment.location ||
                  (typeof selectedShift?.latitude === 'number' &&
                    typeof selectedShift?.longitude === 'number')) ? (
                  <Pressable
                    onPress={chooseNavigationApp}
                    accessibilityRole="link"
                    accessibilityLabel="Start navigation to the shift location"
                    className="mt-4 flex-row items-center justify-center gap-2 rounded-xl bg-[#1c2e4a] px-4 py-4 active:opacity-90"
                  >
                    <Ionicons name="navigate" size={22} color="#FFFFFF" />
                    <Text className="text-base font-extrabold text-white">
                      Start Navigation
                    </Text>
                    <Ionicons name="open-outline" size={18} color="#FFFFFF" />
                  </Pressable>
                ) : null}

                {assignment.quickAccess?.notes?.length ? (
                  <View className="mt-5 rounded-xl border border-violet-100 dark:border-[#5b21b6] bg-[#F9F7FF] dark:bg-violet-950 p-4">
                    <View className="flex-row items-start gap-3">
                      <Ionicons
                        name="document-text-outline"
                        size={25}
                        color={themeColor('#5B21B6')}
                      />
                      <View className="flex-1">
                        <Text className="text-base font-extrabold text-[#071535] dark:text-slate-100">
                          Notes
                        </Text>
                        {assignment.quickAccess.notes.map((note) => (
                          <Text
                            key={note.id}
                            className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-200"
                          >
                            {note.body}
                          </Text>
                        ))}
                      </View>
                    </View>
                  </View>
                ) : null}

                {selectedShiftNoResponse ? (
                  <View className="mt-5 flex-row items-start gap-3 rounded-xl bg-slate-100 dark:bg-slate-900 p-4">
                    <Ionicons
                      name="remove-circle-outline"
                      size={26}
                      color={themeColor('#64748B')}
                    />
                    <View className="flex-1">
                      <Text className="text-sm font-extrabold text-slate-700 dark:text-slate-200">
                        No Response
                      </Text>
                      <Text className="mt-1 text-sm leading-5 text-slate-600 dark:text-slate-200">
                        This shift has ended. It remains available for
                        reference, but Accept and Decline are no longer
                        available.
                      </Text>
                    </View>
                  </View>
                ) : null}

                {selectedShiftCancelled ? (
                  <View className="mt-5 gap-3">
                    <View className="flex-row items-start gap-3 rounded-xl bg-red-50 dark:bg-red-950 p-4">
                      <Ionicons
                        name="alert-circle-outline"
                        size={26}
                        color={themeColor('#DC2626')}
                      />
                      <View className="flex-1">
                        <Text className="text-sm font-extrabold text-red-800 dark:text-red-200">
                          Shift Cancelled
                        </Text>
                        <Text className="mt-1 text-sm leading-5 text-red-700 dark:text-red-200">
                          This shift was cancelled. Confirm that you received
                          the cancellation notice.
                        </Text>
                      </View>
                    </View>
                    <Pressable
                      disabled={
                        !canConfirmShift ||
                        !cancellationNotificationId ||
                        cancellationConfirmed ||
                        cancellationConfirmationMutation.isPending
                      }
                      onPress={() => cancellationConfirmationMutation.mutate()}
                      accessibilityRole="button"
                      accessibilityLabel="Confirm shift cancellation"
                      className="flex-row items-center justify-center gap-3 rounded-xl bg-[#CC0000] py-4 active:opacity-90 disabled:opacity-50"
                    >
                      {cancellationConfirmationMutation.isPending ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Ionicons
                          name={
                            cancellationConfirmed
                              ? 'checkmark-done-circle'
                              : 'checkmark-circle'
                          }
                          size={25}
                          color="#fff"
                        />
                      )}
                      <Text className="text-lg font-extrabold text-white">
                        {cancellationConfirmationMutation.isPending
                          ? 'Confirming...'
                          : cancellationConfirmed
                            ? 'Confirmed'
                            : 'Confirm'}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}

                {selectedShiftPending && !selectedShiftCancelled ? (
                  <View className="mt-5 gap-3">
                    <Pressable
                      disabled={
                        !canConfirmShift || confirmationMutation.isPending
                      }
                      onPress={() => confirmationMutation.mutate('confirmed')}
                      className="flex-row items-center justify-center gap-3 rounded-xl bg-green-600 py-4 active:opacity-90 disabled:opacity-50"
                    >
                      {confirmationMutation.isPending &&
                      confirmationMutation.variables === 'confirmed' ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Ionicons
                          name="checkmark-circle"
                          size={25}
                          color="#fff"
                        />
                      )}
                      <Text className="text-lg font-extrabold text-white">
                        Accept Shift
                      </Text>
                    </Pressable>
                    <Pressable
                      disabled={
                        !canConfirmShift || confirmationMutation.isPending
                      }
                      onPress={() => setDeclineConfirmationOpen(true)}
                      className="flex-row items-center justify-center gap-3 rounded-xl border border-red-500 bg-white dark:bg-slate-800 py-4 active:opacity-90 disabled:opacity-50"
                    >
                      <Ionicons
                        name="close-circle-outline"
                        size={25}
                        color={themeColor('#DC2626')}
                      />
                      <Text className="text-lg font-extrabold text-red-600 dark:text-[#fca5a5]">
                        Decline Shift
                      </Text>
                    </Pressable>
                    <View className="flex-row items-start gap-3 rounded-xl bg-[#F9F7FF] dark:bg-violet-950 p-4">
                      <Ionicons
                        name="chatbubble-ellipses-outline"
                        size={26}
                        color={themeColor('#5B21B6')}
                      />
                      <Text className="flex-1 text-sm leading-6 text-slate-600 dark:text-slate-200">
                        Please review all shift details, notes and location
                        before accepting.
                      </Text>
                    </View>
                  </View>
                ) : null}
              </View>

              {selectedShiftAccepted ? (
                <View className="mt-4 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
                  <View className="flex-row items-center justify-between px-4 py-3">
                    <Text className="text-base font-extrabold text-[#071535] dark:text-slate-100">
                      Required Actions
                    </Text>
                    <Text className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                      {
                        requiredActions.filter((action) => {
                          const templateIds = new Set(
                            templatesByCategory(
                              accessibleFormTemplates,
                              action.category,
                            ).map((template) => template.id),
                          );
                          const completedIds = completedTemplatesForCategory(
                            action.category,
                          );
                          return (
                            templateIds.size > 0 &&
                            [...templateIds].every((id) => completedIds.has(id))
                          );
                        }).length
                      }{' '}
                      of {requiredActions.length} completed
                    </Text>
                  </View>
                  <View className="mx-4 h-px bg-slate-200 dark:bg-slate-800" />
                  {requiredActions.map((action, index) => {
                    const templates = templatesByCategory(
                      accessibleFormTemplates,
                      action.category,
                    );
                    const templateIds = new Set(
                      templates.map((template) => template.id),
                    );
                    const completedCount = [
                      ...completedTemplatesForCategory(action.category),
                    ].filter((templateId) =>
                      templateIds.has(templateId),
                    ).length;
                    const completed =
                      templates.length > 0 &&
                      completedCount >= templates.length;
                    const isOpening = openingCategory === action.category;
                    const disabled =
                      Boolean(openingCategory) ||
                      selectedShiftDeclined ||
                      selectedShiftPending;
                    return (
                      <Pressable
                        key={action.id}
                        disabled={disabled}
                        onPress={() => openCategory(action.category)}
                        className="mx-4 flex-row items-center gap-3 border-b border-slate-200 dark:border-slate-700 py-4 last:border-b-0 active:opacity-80 disabled:opacity-50"
                      >
                        <View className="h-8 w-8 items-center justify-center rounded-full border-2 border-red-600">
                          <Text className="text-sm font-extrabold text-red-600 dark:text-[#fca5a5]">
                            {index + 1}
                          </Text>
                        </View>
                        <Text className="flex-1 text-base font-extrabold text-[#071535] dark:text-slate-100">
                          {isOpening ? 'Opening...' : action.title}
                        </Text>
                        <Text
                          className={`text-sm font-semibold ${completed ? 'text-green-700 dark:text-[#86efac]' : 'text-slate-500 dark:text-slate-400'}`}
                        >
                          {completed ? 'Completed' : 'Not started'}
                        </Text>
                        {isOpening ? (
                          <ActivityIndicator size="small" color="#CC0000" />
                        ) : (
                          <Ionicons
                            name="chevron-forward"
                            size={20}
                            color={themeColor('#475569')}
                          />
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}

              {false ? (
                <View className="mt-4 rounded-[22px] bg-white dark:bg-slate-800 p-4 shadow-sm border border-slate-200 dark:border-slate-700">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                      Required Actions
                    </Text>
                    <Text className="text-sm font-semibold text-slate-400">
                      Shift {selectedShiftIndex + 1 || 1} of{' '}
                      {assignment!.shifts.length || 1}
                    </Text>
                  </View>

                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    nestedScrollEnabled
                    directionalLockEnabled
                    overScrollMode="never"
                    className="mt-4"
                    contentContainerStyle={{
                      paddingHorizontal: 4,
                      paddingVertical: 4,
                    }}
                  >
                    {assignment!.shifts.map((shift, idx) => {
                      const today = new Date().toISOString().slice(0, 10);
                      const done = Boolean(shift.completed);
                      const declined = shift.confirmationStatus === 'declined';
                      const isToday = shift.date === today;
                      const isActive = selectedShift?.id === shift.id;
                      const stateLabel = declined
                        ? 'Declined'
                        : done
                          ? 'Done'
                          : isActive || isToday
                            ? 'In Progress'
                            : 'Open';
                      const circleBg = declined
                        ? '#94a3b8'
                        : done
                          ? '#16a34a'
                          : isActive || isToday
                            ? '#174ea6'
                            : '#9aa3b2';
                      const stateColor = declined
                        ? '#64748b'
                        : done
                          ? '#16a34a'
                          : isActive || isToday
                            ? NAVY
                            : '#475569';
                      const nextShift = assignment!.shifts[idx + 1];
                      const showConnector = Boolean(nextShift);
                      const connectorColor = declined
                        ? '#cbd5e1'
                        : done
                          ? '#86efac'
                          : isActive || isToday
                            ? '#93c5fd'
                            : '#e2e8f0';
                      return (
                        <View key={shift.id} className="w-[88px]">
                          <Pressable
                            onPress={() => setSelectedShiftId(shift.id)}
                            className="items-center rounded-2xl px-2 py-2"
                            style={{
                              backgroundColor: themeColor(
                                isActive ? '#eef4ff' : 'transparent',
                                'background',
                              ),
                              borderWidth: 1,
                              borderColor: themeColor(
                                isActive ? '#bfdbfe' : 'transparent',
                                'border',
                              ),
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={`Select day ${idx + 1}`}
                          >
                            <View className="relative h-10 w-full items-center justify-center">
                              {showConnector ? (
                                <View
                                  className="absolute left-1/2 top-[19px] h-[2px] w-[88px]"
                                  style={{
                                    backgroundColor: themeColor(
                                      connectorColor,
                                      'background',
                                    ),
                                  }}
                                />
                              ) : null}
                              <View
                                className="h-9 w-9 items-center justify-center rounded-full"
                                style={{
                                  backgroundColor: themeColor(
                                    circleBg,
                                    'background',
                                  ),
                                }}
                              >
                                {declined ? (
                                  <Ionicons
                                    name="close"
                                    size={20}
                                    color="#fff"
                                  />
                                ) : done ? (
                                  <Ionicons
                                    name="checkmark"
                                    size={22}
                                    color="#fff"
                                  />
                                ) : isActive || isToday ? (
                                  <View className="h-2.5 w-2.5 rounded-full bg-white" />
                                ) : (
                                  <View className="h-2.5 w-2.5 rounded-full border-2 border-white" />
                                )}
                              </View>
                            </View>
                            <Text className="mt-1.5 text-center text-[13px] font-extrabold text-[#1c2e4a] dark:text-[#f1f5f9]">
                              Day {idx + 1}
                            </Text>
                            <Text className="mt-0.5 text-center text-[11px] font-semibold text-[#74819a] dark:text-[#94a3b8]">
                              {monthDay(shift.date)}
                            </Text>
                            <Text
                              className="mt-1 text-center text-[11px] font-extrabold"
                              style={{ color: themeColor(stateColor, 'text') }}
                            >
                              {stateLabel}
                            </Text>
                          </Pressable>
                        </View>
                      );
                    })}
                  </ScrollView>

                  <View className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-3">
                    <View className="flex-row items-center justify-between">
                      <Text className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        Selected shift
                      </Text>
                      <View
                        className={`rounded-full px-3 py-1 ${selectedShiftStatus.wrap}`}
                      >
                        <Text
                          className={`text-xs font-semibold ${selectedShiftStatus.text}`}
                        >
                          {selectedShiftStatus.label}
                        </Text>
                      </View>
                    </View>
                    <Text className="mt-2 text-xl font-bold text-slate-800 dark:text-slate-100">
                      {selectedShift?.shiftName || ''}
                    </Text>
                    <Text className="mt-0.5 text-sm font-semibold text-slate-600 dark:text-slate-200">
                      Day {selectedShiftIndex + 1 || 1} ·{' '}
                      {fullShiftDateLabel(selectedShift?.date)}
                    </Text>
                    <View className="mt-3 flex-row flex-wrap gap-x-5 gap-y-2">
                      <View className="flex-row items-center gap-1.5">
                        <Ionicons
                          name="time-outline"
                          size={16}
                          color={themeColor(MUTED)}
                        />
                        <Text className="text-sm text-slate-600 dark:text-slate-200">
                          Start time:{' '}
                          <Text className="font-semibold text-slate-800 dark:text-slate-100">
                            {shiftTimeLabel(selectedShift?.startTime) ||
                              'Not set'}
                          </Text>
                        </Text>
                      </View>
                      {selectedShift?.roleName ? (
                        <View className="flex-row items-center gap-1.5">
                          <Ionicons
                            name="person-outline"
                            size={16}
                            color={themeColor(MUTED)}
                          />
                          <Text className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                            {selectedShift!.roleName}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                      Shift progress
                    </Text>
                    <Text className="text-sm font-semibold text-slate-700 dark:text-slate-200 mt-0.5">
                      {selectedSubmittedCount} / {selectedTotalForms} completed
                    </Text>
                    <Text className="text-sm text-slate-600 dark:text-slate-200 mt-3">
                      {selectedShiftDeclined
                        ? 'This shift was declined. Forms and chat are disabled for this shift.'
                        : 'Complete the required forms below for this shift. Timesheet data is shared across Work Order and Timesheet forms.'}
                    </Text>
                  </View>

                  <View className="mt-4 gap-3">
                    {!canSubmitForms ? (
                      <View className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-3">
                        <Text className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                          Read-only access
                        </Text>
                        <Text className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                          Your role can review the assignment and submitted
                          progress, but cannot open or submit shift forms.
                        </Text>
                      </View>
                    ) : null}
                    {categoryActions.map((action, index) => {
                      const templatesForCategory = templatesByCategory(
                        accessibleFormTemplates,
                        action.category,
                      );
                      const requiredTemplatesForCategory =
                        templatesForCategory.filter(
                          (template) => template.isRequired !== false,
                        );
                      const categoryTemplateIds = new Set(
                        requiredTemplatesForCategory.map(
                          (template) => template.id,
                        ),
                      );
                      const completedCount = [
                        ...selectedSubmittedTemplates,
                      ].filter((templateId) =>
                        categoryTemplateIds.has(templateId),
                      ).length;
                      const totalCount = requiredTemplatesForCategory.length;
                      const isOpeningThisAction =
                        openingCategory === action.category;
                      const actionDisabled =
                        !canSubmitForms ||
                        Boolean(openingCategory) ||
                        selectedShiftDeclined ||
                        selectedShiftPending;
                      const rowClass =
                        'rounded-2xl border px-3 py-3 flex-row items-center gap-3';
                      const inner = (
                        <>
                          <View
                            className={`h-8 w-8 items-center justify-center rounded-xl ${
                              selectedShiftDeclined
                                ? 'bg-slate-400'
                                : action.tone === 'blue'
                                  ? 'bg-[#CC0000]'
                                  : action.tone === 'red'
                                    ? 'bg-red-500'
                                    : action.tone === 'purple'
                                      ? 'bg-purple-500'
                                      : 'bg-emerald-500'
                            }`}
                          >
                            <Text className="text-white font-bold">
                              {index + 1}
                            </Text>
                          </View>
                          <View className="flex-1">
                            <Text
                              className={`text-base font-semibold ${selectedShiftDeclined ? 'text-slate-500 dark:text-slate-400' : 'text-slate-800 dark:text-slate-100'}`}
                            >
                              {isOpeningThisAction
                                ? 'Opening...'
                                : action.title}
                            </Text>
                            <Text
                              className={`text-xs ${selectedShiftDeclined ? 'text-slate-400' : 'text-slate-500 dark:text-slate-400'}`}
                            >
                              {selectedShiftDeclined
                                ? 'Unavailable for declined shift.'
                                : isOpeningThisAction
                                  ? 'Please wait while the form opens.'
                                  : `${action.subtitle}${totalCount > 0 ? ` - ${completedCount}/${totalCount} required completed` : ' - optional'}${action.category === 'timesheet' && timesheetEntryLocked ? ' - view only' : ''}`}
                            </Text>
                          </View>
                        </>
                      );
                      return (
                        <Pressable
                          key={action.id}
                          disabled={actionDisabled}
                          onPress={() => openCategory(action.category)}
                          className={`${rowClass} ${
                            isOpeningThisAction
                              ? 'border-[#CC0000] bg-red-50 dark:bg-[#450a0a] opacity-100'
                              : selectedShiftDeclined
                                ? 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 opacity-70'
                                : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 active:opacity-90 disabled:opacity-60'
                          }`}
                          accessibilityRole="button"
                          accessibilityLabel={
                            isOpeningThisAction
                              ? `Opening ${action.title}`
                              : action.title
                          }
                          accessibilityState={{
                            disabled: actionDisabled,
                            busy: isOpeningThisAction,
                          }}
                        >
                          {inner}
                          {isOpeningThisAction ? (
                            <ActivityIndicator size="small" color="#CC0000" />
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              {selectedShiftAccepted && quickAccessItems.length > 0 ? (
                <View className="mt-4 rounded-[22px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm">
                  <Text className="mb-3 text-lg font-extrabold text-[#071535] dark:text-slate-100">
                    Quick Access
                  </Text>
                  <View className="flex-row flex-wrap gap-3">
                    {quickAccessItems.map((item) => (
                      <Pressable
                        key={item.id}
                        disabled={item.disabled}
                        onPress={item.onPress}
                        className="min-w-[58px] flex-1 items-center active:opacity-80 disabled:opacity-50"
                      >
                        <View className="relative h-14 w-full items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                          <Ionicons
                            name={item.icon}
                            size={27}
                            color={themeColor('#071535')}
                          />
                          {item.count ? (
                            <View className="absolute -right-1 -top-1 min-w-[20px] items-center rounded-full bg-red-600 px-1.5 py-0.5">
                              <Text className="text-[10px] font-bold text-white">
                                {item.count}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        <Text className="mt-2 text-center text-xs font-semibold text-slate-700 dark:text-slate-200">
                          {item.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}
            </>
          ) : null}
        </View>
      </ScrollView>
      <View
        className="flex-row border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 pt-2"
        style={{ paddingBottom: Math.max(insets.bottom, 8) }}
      >
        {[
          {
            label: 'Shifts',
            icon: 'briefcase' as const,
            path: '/' as const,
            active: true,
          },
          {
            label: 'Calendar',
            icon: 'calendar-outline' as const,
            path: '/calendar' as const,
          },
          {
            label: 'Timesheets',
            icon: 'time-outline' as const,
            path: '/timesheets' as const,
          },
          {
            label: 'Profile',
            icon: 'person-outline' as const,
            path: '/profile' as const,
          },
        ].map((item) => (
          <Pressable
            key={item.label}
            onPress={() => router.replace(item.path)}
            className="flex-1 items-center py-1.5 active:opacity-70"
          >
            <Ionicons
              name={item.icon}
              size={24}
              color={themeColor(item.active ? '#5B21B6' : '#64748B')}
            />
            <Text
              className={`mt-1 text-xs font-semibold ${item.active ? 'text-violet-700 dark:text-[#c4b5fd]' : 'text-slate-600 dark:text-slate-200'}`}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <DeclineShiftModal
        visible={declineConfirmationOpen}
        pending={
          confirmationMutation.isPending &&
          confirmationMutation.variables === 'declined'
        }
        onKeep={() => setDeclineConfirmationOpen(false)}
        onDecline={() => confirmationMutation.mutate('declined')}
      />
    </SafeAreaView>
  );
}
