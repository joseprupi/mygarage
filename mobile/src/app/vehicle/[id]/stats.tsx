import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";

import {
  ownershipApi,
  userApi,
  vehicleApi,
  type UserSettings,
  type Vehicle,
  type VehicleEvent,
  type VehicleOwnership,
} from "@/lib/api";
import { computeVehicleStats } from "@/lib/stats";

type StatsScope = "ownership" | "lifetime";

export default function VehicleStatsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [events, setEvents] = useState<VehicleEvent[] | null>(null);
  const [ownerships, setOwnerships] = useState<VehicleOwnership[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [meSettings, setMeSettings] = useState<UserSettings | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [statsScope, setStatsScope] = useState<StatsScope>("ownership");

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      void Promise.all([
        vehicleApi.get(id),
        vehicleApi.events(id),
        userApi.me().catch(() => null),
        ownershipApi.list(id).catch(() => [] as VehicleOwnership[]),
      ])
        .then(([v, ev, me, own]) => {
          setVehicle(v);
          setEvents(ev);
          setMeId(me?.id ?? null);
          setMeSettings(me?.settings);
          setOwnerships(own);
          setError(null);
        })
        .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load stats"));
    }, [id]),
  );

  if (!vehicle || events === null) {
    return (
      <View style={styles.center}>
        {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator />}
      </View>
    );
  }

  const isOwner = meId !== null && meId === vehicle.owner_user_id;
  const currentPeriod = ownerships.find((o) => o.isCurrent) ?? null;

  const scopedEvents =
    statsScope === "ownership" && currentPeriod
      ? events.filter((e) => e.ownershipId === currentPeriod.id)
      : events;

  const stats = computeVehicleStats(vehicle, scopedEvents, {
    detectMissedFillups: meSettings?.detectMissedFillups ?? true,
    includeEstimatedFuel: meSettings?.includeEstimatedFuel ?? true,
  });

  const currentChipLabel = isOwner ? "Your ownership" : "Current owner";

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: "Stats" }} />

      {/* Scope toggle */}
      <View style={styles.scopeRow}>
        {(["ownership", "lifetime"] as StatsScope[]).map((scope) => {
          const label = scope === "ownership" ? currentChipLabel : "Lifetime";
          return (
            <Pressable
              key={scope}
              style={[styles.scopeBtn, statsScope === scope && styles.scopeBtnActive]}
              onPress={() => setStatsScope(scope)}
            >
              <Text style={[styles.scopeBtnText, statsScope === scope && styles.scopeBtnTextActive]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.intro}>
        Everything derivable from this car&apos;s history. More fuel-ups and events with mileage =
        better numbers.
      </Text>
      {stats.sections.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          {section.rows.map((row, i) => (
            <View
              key={`${row.label}-${i}`}
              style={[styles.row, i % 2 === 1 && styles.rowAlt]}
            >
              <Text style={[styles.rowLabel, row.label.startsWith("  ") && styles.rowLabelSub]}>
                {row.label.trim()}
              </Text>
              <Text style={styles.rowValue}>{row.value}</Text>
            </View>
          ))}
        </View>
      ))}
      {stats.sections.length === 0 && (
        <Text style={styles.empty}>
          No stats yet — log events with mileage and fuel-ups to feed this table.
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 16, gap: 16, maxWidth: 560, width: "100%", alignSelf: "center", paddingBottom: 48 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  scopeRow: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    overflow: "hidden",
  },
  scopeBtn: { flex: 1, paddingVertical: 8, alignItems: "center", backgroundColor: "#f8fafc" },
  scopeBtnActive: { backgroundColor: "#0b1120" },
  scopeBtnText: { fontSize: 14, fontWeight: "600", color: "#64748b" },
  scopeBtnTextActive: { color: "#fff" },
  intro: { fontSize: 15, color: "#64748b" },
  section: { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 14, overflow: "hidden" },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0b1120",
    textTransform: "uppercase",
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#f8fafc",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  rowAlt: { backgroundColor: "#f8fafc" },
  rowLabel: { fontSize: 16, color: "#334155" },
  rowLabelSub: { color: "#94a3b8", paddingLeft: 12 },
  rowValue: { fontSize: 16, fontWeight: "700", color: "#0b1120" },
  empty: { fontSize: 15, color: "#94a3b8", textAlign: "center", padding: 24 },
  error: { color: "#dc2626", fontSize: 16 },
});
