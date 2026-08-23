import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { C, F, RADIUS, shadow } from "@/src/theme";

export function Card({ children, style, testID }: { children: React.ReactNode; style?: ViewStyle; testID?: string }) {
  return <View testID={testID} style={[styles.card, style]}>{children}</View>;
}

export function PrimaryButton({
  title, onPress, disabled, loading, testID, color = C.primary, style,
}: {
  title: string; onPress?: () => void; disabled?: boolean; loading?: boolean;
  testID?: string; color?: string; style?: ViewStyle;
}) {
  return (
    <Pressable
      testID={testID}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryBtn,
        { backgroundColor: disabled ? C.border : color },
        !disabled && shadow("primary"),
        pressed && !disabled && { transform: [{ scale: 0.985 }] },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={disabled ? C.textTertiary : "#fff"} />
      ) : (
        <Text style={[styles.primaryBtnText, { color: disabled ? C.textTertiary : "#fff" }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function SecondaryButton({
  title, onPress, testID, dark, style,
}: { title: string; onPress?: () => void; testID?: string; dark?: boolean; style?: ViewStyle }) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        dark ? styles.darkBtn : styles.outlineBtn,
        pressed && { transform: [{ scale: 0.985 }] },
        style,
      ]}
    >
      <Text style={[dark ? styles.darkBtnText : styles.outlineBtnText]}>{title}</Text>
    </Pressable>
  );
}

type PillTone = "success" | "warning" | "danger" | "neutral" | "primary";
const TONES: Record<PillTone, { bg: string; text: string; dot: string }> = {
  success: { bg: C.successBg, text: C.successText, dot: C.success },
  warning: { bg: C.warningBg, text: C.warningText, dot: C.warning },
  danger: { bg: C.dangerBg, text: C.dangerText, dot: C.danger },
  neutral: { bg: C.divider, text: C.textSecondary, dot: C.textTertiary },
  primary: { bg: C.primaryTintStrong, text: C.primaryOnTint, dot: C.primary },
};

export function StatusPill({ tone, label, testID }: { tone: PillTone; label: string; testID?: string }) {
  const t = TONES[tone];
  return (
    <View testID={testID} style={[styles.pill, { backgroundColor: t.bg }]}>
      <View style={[styles.dot, { backgroundColor: t.dot }]} />
      <Text style={[styles.pillText, { color: t.text }]}>{label}</Text>
    </View>
  );
}

export function Chip({ label, active, onPress, testID }: { label: string; active?: boolean; onPress?: () => void; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={[styles.chip, active ? styles.chipActive : styles.chipIdle]}
    >
      <Text style={[styles.chipText, { color: active ? "#fff" : "#374151" }]}>{label}</Text>
    </Pressable>
  );
}

export function Segmented({
  options, value, onChange, testID,
}: { options: { key: string; label: string }[]; value: string; onChange: (k: string) => void; testID?: string }) {
  return (
    <View testID={testID} style={styles.segmentTrack}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            testID={`${testID}-${o.key}`}
            onPress={() => onChange(o.key)}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, { color: active ? C.ink : C.textSecondary }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Avatar({ initials, bg = C.primaryTintStrong, color = C.primaryOnTint, size = 44 }: { initials: string; bg?: string; color?: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color, fontWeight: F.w800, fontSize: size * 0.36 }}>{initials}</Text>
    </View>
  );
}

export function ScreenHeader({ title, right, onBack }: { title: string; right?: React.ReactNode; onBack?: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        {onBack && (
          <Pressable testID="back-button" onPress={onBack} hitSlop={10} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={C.ink} />
          </Pressable>
        )}
        <Text style={styles.headerTitle}>{title}</Text>
      </View>
      {right}
    </View>
  );
}

export function Screen({
  children, header, contentStyle,
}: { children: React.ReactNode; header?: React.ReactNode; contentStyle?: ViewStyle }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      {header}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[{ padding: 20, paddingBottom: insets.bottom + 90 }, contentStyle]}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </View>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.appBg },
  card: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: RADIUS.card, padding: 18, ...shadow("card") },
  primaryBtn: { height: 54, borderRadius: RADIUS.input, alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
  primaryBtnText: { fontSize: 15.5, fontWeight: F.w800 },
  outlineBtn: { height: 50, borderRadius: RADIUS.input, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
  outlineBtnText: { color: C.ink, fontSize: 14.5, fontWeight: F.w800 },
  darkBtn: { height: 50, borderRadius: RADIUS.input, backgroundColor: C.ink, alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
  darkBtnText: { color: "#fff", fontSize: 14.5, fontWeight: F.w800 },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.pill, alignSelf: "flex-start" },
  dot: { width: 7, height: 7, borderRadius: 4 },
  pillText: { fontSize: 10.5, fontWeight: F.w800 },
  chip: { height: 36, paddingHorizontal: 16, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  chipActive: { backgroundColor: C.ink },
  chipIdle: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  chipText: { fontSize: 13, fontWeight: F.w700 },
  segmentTrack: { flexDirection: "row", backgroundColor: "#EEF2F7", borderRadius: RADIUS.input, padding: 4, gap: 4 },
  segment: { flex: 1, height: 42, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  segmentActive: { backgroundColor: "#fff", ...shadow("card") },
  segmentText: { fontSize: 13.5, fontWeight: F.w800 },
  header: { paddingHorizontal: 20, paddingBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: C.appBg },
  headerTitle: { fontSize: 22, fontWeight: F.w800, letterSpacing: -0.5, color: C.ink },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  sectionLabel: { fontSize: 11.5, fontWeight: F.w800, letterSpacing: 0.6, color: C.textTertiary, textTransform: "uppercase", marginBottom: 10 },
});
