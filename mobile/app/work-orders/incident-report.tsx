import { useNativeTheme } from '@/hooks/use-native-theme';
import { Ionicons } from '@expo/vector-icons';
import { type ReactNode, useCallback, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { PageHeader } from '@/components/page-header';
import { useAuth } from '@/contexts/auth-context';

const LINE = '#dce4f0';
const MUTED = '#74819a';
const BLUE_SOFT = '#edf3ff';
const BLUE_BORDER = '#cddcff';
const BLUE_TEXT = '#2f62e6';
const RED_SOFT = '#ffeceb';
const RED_BORDER = '#f3c2bc';
const RED_TEXT = '#d8574e';
const ORANGE_SOFT = '#fff4e6';
const ORANGE_BORDER = '#f0d5a2';
const ORANGE_TEXT = '#c78518';

const INCIDENT_TYPES = [
  'Injury',
  'Near Miss',
  'Property Damage',
  'Traffic Event',
  'Equipment Issue',
  'Safety Violation',
] as const;

const QUICK_TAGS = [
  'Slip / Trip / Fall',
  'Minor injury',
  'No vehicle involved',
  'Traffic control area',
  'Equipment handling',
  'Site hazard',
] as const;

const SEVERITY_OPTIONS = ['Low', 'Medium', 'High', 'Critical'] as const;

function FieldLabel({ children }: { children: string }) {
  return (
    <Text
      className="text-[12px] font-extrabold text-[#5d6c87] dark:text-slate-300 mb-[7px]"
      style={{ letterSpacing: 0.4, textTransform: 'uppercase' }}
    >
      {children}
    </Text>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <View
      className="rounded-[20px] p-4 mb-3 bg-white dark:bg-slate-800 border-[#dce4f0] dark:border-[#334155]"
      style={{ borderWidth: 1 }}
    >
      {children}
    </View>
  );
}

function TextField({
  value,
  onChangeText,
  placeholder,
  multiline,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const { themeColor } = useNativeTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={themeColor(MUTED)}
      multiline={multiline}
      className="text-[14px] px-3.5 py-3.5 rounded-[14px] text-[#182641] dark:text-slate-100 border-[#dce4f0] dark:border-[#334155] bg-[#fff] dark:bg-[#1e293b]"
      style={{
        borderWidth: 1,
        minHeight: multiline ? 110 : undefined,
        textAlignVertical: multiline ? 'top' : 'center',
      }}
    />
  );
}

function TwoCol({ children }: { children: ReactNode }) {
  return <View className="flex-row flex-wrap gap-3">{children}</View>;
}

function Col({ children }: { children: ReactNode }) {
  return <View className="flex-1 min-w-[140px]">{children}</View>;
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const { themeColor } = useNativeTheme();
  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map((opt) => {
        const active = value === opt;
        return (
          <Pressable
            key={opt}
            onPress={() => onChange(opt)}
            className="rounded-full px-3 py-2.5 border"
            style={{
              borderColor: themeColor(active ? BLUE_BORDER : LINE, 'border'),
              backgroundColor: themeColor(
                active ? BLUE_SOFT : '#fff',
                'background',
              ),
            }}
          >
            <Text
              className="text-[13px] font-bold"
              style={{
                color: themeColor(active ? BLUE_TEXT : '#50617d', 'text'),
              }}
            >
              {opt}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function RedChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { themeColor } = useNativeTheme();
  return (
    <Pressable
      onPress={onPress}
      className="rounded-full px-3 py-2.5 border"
      style={{
        borderColor: themeColor(active ? RED_BORDER : LINE, 'border'),
        backgroundColor: themeColor(active ? RED_SOFT : '#fff', 'background'),
      }}
    >
      <Text
        className="text-[13px] font-bold"
        style={{ color: themeColor(active ? RED_TEXT : '#50617d', 'text') }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function OrangeChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { themeColor } = useNativeTheme();
  return (
    <Pressable
      onPress={onPress}
      className="rounded-full px-3 py-2.5 border"
      style={{
        borderColor: themeColor(active ? ORANGE_BORDER : LINE, 'border'),
        backgroundColor: themeColor(
          active ? ORANGE_SOFT : '#fff',
          'background',
        ),
      }}
    >
      <Text
        className="text-[13px] font-bold"
        style={{ color: themeColor(active ? ORANGE_TEXT : '#50617d', 'text') }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function IncidentReportScreen() {
  const { themeColor } = useNativeTheme();
  const insets = useSafeAreaInsets();
  const { hasPermission } = useAuth();
  const canSubmitIncident = hasPermission('mobile.incidents.submit');
  const bottomPad = Math.max(insets.bottom, 12);
  const scrollBottomPad = 100 + bottomPad;

  const [reportDate, setReportDate] = useState('2026-04-01');
  const [reportTime, setReportTime] = useState('08:45');
  const [incidentTypes, setIncidentTypes] = useState<Set<string>>(
    () => new Set(['Injury']),
  );
  const [severity, setSeverity] = useState('Medium');
  const [incidentDate, setIncidentDate] = useState('2026-04-01');
  const [incidentTime, setIncidentTime] = useState('08:20');
  const [location, setLocation] = useState(
    'West side staging area near Redwood Blvd intersection',
  );
  const [personReporting, setPersonReporting] = useState('Derek Doan');
  const [peopleInvolved, setPeopleInvolved] = useState(
    'Freddy Moran – Flagger\nPena Zamora – Crew\nDerek Doan – Foreman',
  );
  const [whatHappened, setWhatHappened] = useState(
    'Worker slipped while moving cones near the shoulder area. No vehicle collision occurred. Minor injury reported to lower arm.',
  );
  const [quickTags, setQuickTags] = useState<Set<string>>(() => new Set());

  const [immediateActions, setImmediateActions] = useState(
    'Foreman stopped cone movement in the area, checked the worker, moved crew away from hazard, and documented the scene.',
  );
  const [medicalNeeded, setMedicalNeeded] = useState('No');
  const [workStopped, setWorkStopped] = useState('Yes');
  const [supervisorNotified, setSupervisorNotified] = useState('Yes');

  const [witnesses, setWitnesses] = useState(
    'Maria Santos – Operator\nAngel Ramirez – Flagger',
  );
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [confirmChecked, setConfirmChecked] = useState(true);

  const toggleIncidentType = useCallback((tag: string) => {
    setIncidentTypes((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }, []);

  const handleBlockedSubmit = useCallback(() => {
    Alert.alert(
      'Read-only access',
      'Your role can view incident forms, but cannot save or submit reports.',
    );
  }, []);

  const toggleQuickTag = useCallback((tag: string) => {
    setQuickTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }, []);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-[#eef3fb] dark:bg-[#0f172a]"
    >
      <StatusBar style="light" backgroundColor="#1c2e4a" translucent={false} />
      <PageHeader title="Incident Report" subtitle="Today's Actions" />

      <ScrollView
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 6,
          paddingBottom: scrollBottomPad,
        }}
      >
        <Card>
          <Text className="text-[18px] font-extrabold text-[#182641] dark:text-[#f1f5f9]">
            #WO-2026-003
          </Text>
          <Text className="text-[13px] mt-1 leading-[1.45] text-[#74819a] dark:text-[#94a3b8]">
            Redwood Blvd · Apr 01, 2026 · Oakland, CA
          </Text>
          <View className="flex-row flex-wrap gap-2.5 mt-3">
            <View className="rounded-full px-3 py-2 bg-[#ffeceb] dark:bg-[#450a0a]">
              <Text className="text-[12px] font-extrabold text-[#d8574e] dark:text-[#fca5a5]">
                Needs Reporting
              </Text>
            </View>
          </View>
        </Card>

        <Card>
          <Text className="text-[20px] font-extrabold mb-1 text-[#182641] dark:text-[#f1f5f9]">
            Incident Details
          </Text>
          <Text className="text-[13px] mb-3 text-[#74819a] dark:text-[#94a3b8]">
            Capture the incident clearly and quickly
          </Text>

          <View
            className="rounded-xl p-3 mb-3.5 bg-[#f7faff] dark:bg-[#0f172a] border-[#dce6fb] dark:border-slate-700"
            style={{ borderWidth: 1 }}
          >
            <Text className="text-[13px] leading-[1.45] text-[#182641] dark:text-[#f1f5f9]">
              <Text className="font-extrabold text-[#213459] dark:text-slate-100">
                Important:
              </Text>{' '}
              Use this form only for job-related incidents, unsafe events,
              injuries, damage, or near misses. Keep the report factual and
              specific.
            </Text>
          </View>

          <TwoCol>
            <Col>
              <FieldLabel>Report Date</FieldLabel>
              <TextField
                value={reportDate}
                onChangeText={setReportDate}
                placeholder="YYYY-MM-DD"
              />
            </Col>
            <Col>
              <FieldLabel>Report Time</FieldLabel>
              <TextField
                value={reportTime}
                onChangeText={setReportTime}
                placeholder="HH:MM"
              />
            </Col>
          </TwoCol>

          <View className="h-3" />

          <FieldLabel>Incident Type</FieldLabel>
          <View className="flex-row flex-wrap gap-2">
            {INCIDENT_TYPES.map((t) => (
              <RedChip
                key={t}
                label={t}
                active={incidentTypes.has(t)}
                onPress={() => toggleIncidentType(t)}
              />
            ))}
          </View>

          <View className="h-3" />

          <FieldLabel>Severity</FieldLabel>
          <Segmented
            options={SEVERITY_OPTIONS}
            value={severity}
            onChange={setSeverity}
          />

          <View className="h-3" />

          <TwoCol>
            <Col>
              <FieldLabel>Incident Date</FieldLabel>
              <TextField
                value={incidentDate}
                onChangeText={setIncidentDate}
                placeholder="YYYY-MM-DD"
              />
            </Col>
            <Col>
              <FieldLabel>Incident Time</FieldLabel>
              <TextField
                value={incidentTime}
                onChangeText={setIncidentTime}
                placeholder="HH:MM"
              />
            </Col>
          </TwoCol>

          <View className="h-3" />

          <FieldLabel>Location</FieldLabel>
          <TextField value={location} onChangeText={setLocation} />

          <View className="h-3" />

          <FieldLabel>Person Reporting</FieldLabel>
          <TextField
            value={personReporting}
            onChangeText={setPersonReporting}
          />

          <View className="h-3" />

          <FieldLabel>People Involved</FieldLabel>
          <TextField
            value={peopleInvolved}
            onChangeText={setPeopleInvolved}
            placeholder="List names and roles of people involved..."
            multiline
          />

          <View className="h-3" />

          <FieldLabel>What Happened?</FieldLabel>
          <TextField
            value={whatHappened}
            onChangeText={setWhatHappened}
            placeholder="Describe the incident clearly and factually..."
            multiline
          />

          <View className="h-3" />

          <FieldLabel>Quick Tags</FieldLabel>
          <View className="flex-row flex-wrap gap-2">
            {QUICK_TAGS.map((tag) => (
              <OrangeChip
                key={tag}
                label={tag}
                active={quickTags.has(tag)}
                onPress={() => toggleQuickTag(tag)}
              />
            ))}
          </View>
          <Text className="text-[12px] mt-1.5 leading-snug text-[#74819a] dark:text-[#94a3b8]">
            Use quick tags to speed up repeated descriptions.
          </Text>
        </Card>

        <Card>
          <Text className="text-[20px] font-extrabold mb-1 text-[#182641] dark:text-[#f1f5f9]">
            Immediate Response
          </Text>
          <Text className="text-[13px] mb-3 text-[#74819a] dark:text-[#94a3b8]">
            Document what was done right away
          </Text>

          <FieldLabel>Immediate Actions Taken</FieldLabel>
          <TextField
            value={immediateActions}
            onChangeText={setImmediateActions}
            placeholder="Describe immediate response..."
            multiline
          />

          <View className="h-3" />

          <FieldLabel>Medical Attention Needed?</FieldLabel>
          <Segmented
            options={['No', 'Yes']}
            value={medicalNeeded}
            onChange={setMedicalNeeded}
          />

          <View className="h-3" />

          <FieldLabel>Work Stopped?</FieldLabel>
          <Segmented
            options={['No', 'Yes']}
            value={workStopped}
            onChange={setWorkStopped}
          />

          <View className="h-3" />

          <FieldLabel>Was Supervisor Notified?</FieldLabel>
          <Segmented
            options={['Yes', 'No']}
            value={supervisorNotified}
            onChange={setSupervisorNotified}
          />
        </Card>

        <Card>
          <Text className="text-[20px] font-extrabold mb-1 text-[#182641] dark:text-[#f1f5f9]">
            Witnesses & Evidence
          </Text>
          <Text className="text-[13px] mb-3 text-[#74819a] dark:text-[#94a3b8]">
            Add supporting information
          </Text>

          <FieldLabel>Witnesses</FieldLabel>
          <TextField
            value={witnesses}
            onChangeText={setWitnesses}
            placeholder="List witnesses if any..."
            multiline
          />

          <View className="h-3" />

          <FieldLabel>Photos / Evidence</FieldLabel>
          <Pressable
            className="rounded-2xl px-4 py-6 items-center justify-center border-[#cfd9ea] dark:border-slate-700 bg-[#fbfcff] dark:bg-[#0f172a]"
            style={{ borderWidth: 2, borderStyle: 'dashed' }}
          >
            <Text className="text-sm text-center leading-[1.45] text-[#8090ad] dark:text-[#94a3b8]">
              Tap to upload photos or supporting evidence{'\n'}JPG, PNG, PDF
              supported
            </Text>
          </Pressable>

          <View className="h-3" />

          <FieldLabel>Additional Notes</FieldLabel>
          <TextField
            value={additionalNotes}
            onChangeText={setAdditionalNotes}
            placeholder="Add anything else relevant..."
            multiline
          />
        </Card>

        <Card>
          <Text className="text-[20px] font-extrabold mb-1 text-[#182641] dark:text-[#f1f5f9]">
            Final Review
          </Text>
          <Text className="text-[13px] mb-3 text-[#74819a] dark:text-[#94a3b8]">
            Confirm and sign the report
          </Text>

          <FieldLabel>Reporter Signature</FieldLabel>
          <Pressable
            className="rounded-2xl items-center justify-center px-3 py-6 border-[#cfd9ea] dark:border-slate-700 bg-[#fbfcff] dark:bg-[#0f172a]"
            style={{ minHeight: 120, borderWidth: 2, borderStyle: 'dashed' }}
          >
            <Text className="text-sm text-center text-[#8090ad] dark:text-[#94a3b8]">
              Signature area{'\n'}Tap to sign
            </Text>
          </Pressable>

          <View className="h-3" />

          <FieldLabel>Confirmation</FieldLabel>
          <Pressable
            onPress={() => setConfirmChecked(!confirmChecked)}
            className="flex-row items-start gap-2.5 px-3.5 py-3 rounded-[14px] bg-white dark:bg-slate-800 border-[#dce4f0] dark:border-[#334155]"
            style={{ borderWidth: 1 }}
          >
            <Ionicons
              name={confirmChecked ? 'checkbox' : 'square-outline'}
              size={22}
              color={themeColor(confirmChecked ? BLUE_TEXT : MUTED)}
              style={{ marginTop: 2 }}
            />
            <Text className="text-[14px] flex-1 leading-snug text-[#182641] dark:text-[#f1f5f9]">
              I confirm this incident report is accurate to the best of my
              knowledge and reflects the facts known at the time of submission.
            </Text>
          </Pressable>
        </Card>
      </ScrollView>

      <View
        className="absolute left-0 right-0 bottom-0 px-4 pt-3 bg-[#eef3fb] dark:bg-[#0f172a]"
        style={{
          paddingBottom: bottomPad,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.06,
          shadowRadius: 6,
          elevation: 8,
        }}
      >
        <View className="flex-row gap-2.5">
          <Pressable
            disabled={!canSubmitIncident}
            onPress={canSubmitIncident ? undefined : handleBlockedSubmit}
            className="flex-1 rounded-2xl py-4 items-center bg-[#e9eef7] dark:bg-[#334155]"
            style={{ opacity: canSubmitIncident ? 1 : 0.6 }}
          >
            <Text className="text-sm font-extrabold text-[#42506a] dark:text-[#cbd5e1]">
              Save Draft
            </Text>
          </Pressable>
          <Pressable
            disabled={!canSubmitIncident}
            onPress={canSubmitIncident ? undefined : handleBlockedSubmit}
            className="flex-1 rounded-2xl py-4 items-center bg-[#CC0000]"
            style={{ opacity: canSubmitIncident ? 1 : 0.6 }}
          >
            <Text className="text-sm font-extrabold text-white">
              Submit Report
            </Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
