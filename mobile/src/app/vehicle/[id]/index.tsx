import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";

import {
  eventApi,
  mediaUrl,
  userApi,
  vehicleApi,
  type Post,
  type UserSettings,
  type Vehicle,
  type VehicleEvent,
  type VehicleMod,
} from "@/lib/api";
import type { GapInfo } from "@/lib/stats";
import { eventTypeColors, eventTypeLabel, formatDate, formatMoney, tagLabel } from "@/lib/events";
import { computeVehicleStats } from "@/lib/stats";
import { MileageChart } from "@/components/mileage-chart";
import { PostCard } from "@/components/post-card";

const TABS = ["History", "Build", "Posts"] as const;
type Tab = (typeof TABS)[number];

function EventRow({ event, onPress }: { event: VehicleEvent; onPress?: () => void }) {
  const colors = eventTypeColors(event.event_type);
  const cost = formatMoney(event.cost_cents, event.currency);
  const thumb = mediaUrl(event.media[0]?.thumbnail_url ?? event.media[0]?.url);
  return (
    <Pressable style={styles.eventRow} onPress={onPress} disabled={!onPress}>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={styles.eventTop}>
          <View style={[styles.badge, { backgroundColor: colors.bg }]}>
            <Text style={[styles.badgeText, { color: colors.text }]}>
              {eventTypeLabel(event.event_type)}
            </Text>
          </View>
          <Text style={styles.eventDate}>{formatDate(event.event_date)}</Text>
        </View>
        <Text style={styles.eventTitle}>{event.title}</Text>
        {event.tags?.length > 0 && (
          <View style={styles.tagRow}>
            {event.tags.map((t) => (
              <View key={t} style={styles.tagPill}>
                <Text style={styles.tagPillText}>{tagLabel(t)}</Text>
              </View>
            ))}
          </View>
        )}
        <Text style={styles.eventMeta}>
          {[
            cost,
            event.mileage != null ? `${event.mileage.toLocaleString()} mi` : null,
            event.shop_name,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </View>
      {thumb && <Image source={{ uri: thumb }} style={styles.eventThumb} contentFit="cover" />}
    </Pressable>
  );
}

function GapCard({
  gap,
  vehicleId,
  onDismiss,
}: {
  gap: GapInfo;
  vehicleId: string;
  onDismiss: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function markNotMissed() {
    setBusy(true);
    try {
      await eventApi.update(gap.beforeEventId, { fuelMissedPrevious: false });
      onDismiss();
    } catch {
      // ignore
    } finally {
      setBusy(false);
    }
  }

  const costStr = gap.estCostCents != null ? `~$${(gap.estCostCents / 100).toFixed(0)}` : null;
  const desc = [
    `~${gap.estGallons.toFixed(1)} gal`,
    costStr,
  ].filter(Boolean).join(" · ");

  return (
    <View style={styles.gapCard}>
      <Text style={styles.gapTitle}>Possible missed fill-up</Text>
      <Text style={styles.gapDesc}>~{gap.date} · {desc}</Text>
      <View style={styles.gapActions}>
        <Pressable
          style={styles.gapBtn}
          onPress={() =>
            router.push(
              `/vehicle/${vehicleId}/fuel?prefillDate=${gap.date}&prefillGallons=${gap.estGallons.toFixed(1)}&prefillCostCents=${gap.estCostCents ?? ""}`,
            )
          }
        >
          <Text style={styles.gapBtnText}>Add it</Text>
        </Pressable>
        <Pressable style={[styles.gapBtn, styles.gapBtnSecondary]} onPress={markNotMissed} disabled={busy}>
          <Text style={styles.gapBtnSecondaryText}>{busy ? "…" : "Not missed"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function VehicleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [meSettings, setMeSettings] = useState<UserSettings | undefined>(undefined);
  const [tab, setTab] = useState<Tab>("History");
  const [events, setEvents] = useState<VehicleEvent[] | null>(null);
  const [mods, setMods] = useState<VehicleMod[] | null>(null);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissedGaps, setDismissedGaps] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [v, me, ev, md, ps] = await Promise.all([
        vehicleApi.get(id),
        userApi.me().catch(() => null),
        vehicleApi.events(id),
        vehicleApi.mods(id),
        vehicleApi.posts(id),
      ]);
      setVehicle(v);
      setMeId(me?.id ?? null);
      setMeSettings(me?.settings);
      setEvents(ev);
      setMods(md);
      setPosts(ps);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load the vehicle");
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!vehicle) {
    return (
      <View style={styles.center}>
        {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator />}
      </View>
    );
  }

  const isOwner = meId !== null && meId === vehicle.owner_user_id;

  function confirmDeleteVehicle() {
    if (!vehicle) return;
    const doDelete = async () => {
      try {
        await vehicleApi.delete(vehicle.id);
        router.replace("/garage");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't delete vehicle");
      }
    };
    const warning = "This deletes the vehicle AND its entire history. This cannot be undone.";
    if (Platform.OS === "web") {
      if (window.confirm(`Delete this vehicle?\n\n${warning}`)) void doDelete();
    } else {
      Alert.alert("Delete this vehicle?", warning, [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => void doDelete() },
      ]);
    }
  }

  const title = vehicle.nickname || [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ");
  const cover = mediaUrl(vehicle.cover_image_url);
  const stats = computeVehicleStats(vehicle, events ?? [], {
    detectMissedFillups: meSettings?.detectMissedFillups ?? true,
    includeEstimatedFuel: meSettings?.includeEstimatedFuel ?? true,
  });

  const modsByCategory = new Map<string, VehicleMod[]>();
  for (const mod of mods ?? []) {
    const list = modsByCategory.get(mod.category) ?? [];
    list.push(mod);
    modsByCategory.set(mod.category, list);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{
          title,
          headerRight: isOwner
            ? () => (
                <View style={{ flexDirection: "row", gap: 18 }}>
                  <Pressable
                    onPress={() => router.push(`/vehicle-form?vehicleId=${vehicle.id}`)}
                    hitSlop={8}
                  >
                    <Ionicons name="pencil-outline" size={20} color="#2563eb" />
                  </Pressable>
                  <Pressable onPress={confirmDeleteVehicle} hitSlop={8}>
                    <Ionicons name="trash-outline" size={20} color="#dc2626" />
                  </Pressable>
                </View>
              )
            : undefined,
        }}
      />
      {cover && <Image source={{ uri: cover }} style={styles.cover} contentFit="cover" />}
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>
          {[vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ")}
        </Text>
        <Text style={styles.meta}>
          {[
            vehicle.mileage != null ? `${vehicle.mileage.toLocaleString()} mi` : null,
            vehicle.engine,
            vehicle.transmission,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </View>

      <View style={styles.tabs}>
        {TABS.map((t) => (
          <Pressable
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t}</Text>
          </Pressable>
        ))}
      </View>

      {tab === "History" && (
        <View style={styles.section}>
          <View style={styles.statsRow}>
            <View style={styles.statTile}>
              <Text style={styles.statValue}>{(events ?? []).length}</Text>
              <Text style={styles.statLabel}>Events</Text>
            </View>
            {stats.summary.map((row) => (
              <View key={row.label} style={styles.statTile}>
                <Text style={styles.statValue}>{row.value}</Text>
                <Text style={styles.statLabel}>{row.label}</Text>
              </View>
            ))}
          </View>
          <Pressable onPress={() => router.push(`/vehicle/${vehicle.id}/stats`)} hitSlop={6}>
            <Text style={styles.allStatsLink}>All stats →</Text>
          </Pressable>
          {isOwner && (
            <View style={styles.actionRow}>
              <Pressable
                style={[styles.addBtn, styles.fuelBtn]}
                onPress={() => router.push(`/vehicle/${vehicle.id}/fuel`)}
              >
                <Text style={styles.addBtnText}>⛽ Fuel-up</Text>
              </Pressable>
              <Pressable
                style={styles.addBtn}
                onPress={() => router.push(`/vehicle/${vehicle.id}/event-form`)}
              >
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={styles.addBtnText}>Add event</Text>
              </Pressable>
            </View>
          )}
          <MileageChart
            events={events ?? []}
            origin={
              vehicle.purchase_date && vehicle.mileage != null
                ? { date: vehicle.purchase_date, miles: vehicle.mileage }
                : undefined
            }
          />
          {(() => {
            // Build a map of gapCard keyed by beforeEventId (the newer event)
            // so we can render the gap card after the newer event (list is newest-first)
            const activeGaps = stats.gaps.filter((g) => !dismissedGaps.has(g.beforeEventId));
            const gapMap = new Map(activeGaps.map((g) => [g.beforeEventId, g]));
            return (events ?? []).map((event) => (
              <View key={event.id}>
                <EventRow
                  event={event}
                  onPress={
                    isOwner
                      ? () => router.push(`/vehicle/${vehicle.id}/event-form?eventId=${event.id}`)
                      : undefined
                  }
                />
                {isOwner && gapMap.has(event.id) && (
                  <GapCard
                    gap={gapMap.get(event.id)!}
                    vehicleId={vehicle.id}
                    onDismiss={() =>
                      setDismissedGaps((prev) => new Set([...prev, event.id]))
                    }
                  />
                )}
              </View>
            ));
          })()}
          {(events ?? []).length === 0 && (
            <Text style={styles.emptyText}>No history events yet.</Text>
          )}
        </View>
      )}

      {tab === "Build" && (
        <View style={styles.section}>
          <Text style={styles.sectionInfo}>{(mods ?? []).length} mods</Text>
          {isOwner && (
            <View style={styles.actionRow}>
              <Pressable
                style={styles.addBtn}
                onPress={() => router.push(`/vehicle/${vehicle.id}/mod-form`)}
              >
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={styles.addBtnText}>Add mod</Text>
              </Pressable>
            </View>
          )}
          {[...modsByCategory.entries()].map(([category, list]) => (
            <View key={category} style={{ gap: 4 }}>
              <Text style={styles.category}>{category}</Text>
              {list.map((mod) => (
                <Pressable
                  key={mod.id}
                  style={styles.modRow}
                  disabled={!isOwner}
                  onPress={() =>
                    router.push(`/vehicle/${vehicle.id}/mod-form?modId=${mod.id}`)
                  }
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modName}>
                      {mod.name}
                      {mod.brand ? <Text style={styles.modBrand}> — {mod.brand}</Text> : null}
                    </Text>
                    <Text style={styles.eventMeta}>
                      {[
                        formatMoney(mod.cost_cents, mod.currency),
                        formatDate(mod.installed_date),
                        mod.mileage != null ? `${mod.mileage.toLocaleString()} mi` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ))}
          {(mods ?? []).length === 0 && <Text style={styles.emptyText}>No mods listed yet.</Text>}
        </View>
      )}

      {tab === "Posts" && (
        <View>
          {(posts ?? []).map((post) => (
            <PostCard key={post.id} post={post} onPress={() => router.push(`/post/${post.id}`)} />
          ))}
          {(posts ?? []).length === 0 && <Text style={styles.emptyText}>No posts yet.</Text>}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { maxWidth: 560, width: "100%", alignSelf: "center", paddingBottom: 32 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  cover: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#f1f5f9" },
  header: { padding: 16, gap: 4 },
  title: { fontSize: 22, fontWeight: "800", color: "#0b1120" },
  subtitle: { fontSize: 16, color: "#64748b" },
  meta: { fontSize: 15, color: "#94a3b8" },
  tabs: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e2e8f0",
  },
  tab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: "#f1f5f9" },
  tabActive: { backgroundColor: "#0b1120" },
  tabText: { fontSize: 16, fontWeight: "600", color: "#475569" },
  tabTextActive: { color: "#fff" },
  section: { padding: 16, gap: 10 },
  sectionInfo: { fontSize: 15, color: "#64748b", fontWeight: "600" },
  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statTile: {
    flexGrow: 1,
    minWidth: 96,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: "center",
    gap: 1,
  },
  statValue: { fontSize: 17, fontWeight: "800", color: "#0b1120" },
  statLabel: { fontSize: 12, color: "#64748b", fontWeight: "600" },
  allStatsLink: { fontSize: 15, color: "#2563eb", fontWeight: "700", textAlign: "right" },
  actionRow: { flexDirection: "row", gap: 8 },
  addBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: "#2563eb",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  addBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  fuelBtn: { backgroundColor: "#0b1120" },
  eventRow: {
    flexDirection: "row",
    gap: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    padding: 12,
  },
  eventTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 14, fontWeight: "700" },
  eventDate: { fontSize: 14, color: "#94a3b8" },
  eventTitle: { fontSize: 17, fontWeight: "700", color: "#0b1120" },
  eventMeta: { fontSize: 15, color: "#64748b" },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  tagPill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: "#eff6ff" },
  tagPillText: { fontSize: 12, fontWeight: "600", color: "#1d4ed8" },
  eventThumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: "#f1f5f9" },
  category: { fontSize: 15, fontWeight: "800", color: "#334155", textTransform: "uppercase", marginTop: 8 },
  modRow: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    padding: 12,
  },
  modName: { fontSize: 17, fontWeight: "700", color: "#0b1120" },
  modBrand: { fontWeight: "400", color: "#64748b" },
  emptyText: { padding: 16, fontSize: 16, color: "#94a3b8", textAlign: "center" },
  error: { color: "#dc2626", fontSize: 16 },
  gapCard: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#94a3b8",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#f8fafc",
    marginVertical: 4,
    gap: 4,
  },
  gapTitle: { fontSize: 14, fontWeight: "600", color: "#64748b" },
  gapDesc: { fontSize: 13, color: "#94a3b8" },
  gapActions: { flexDirection: "row", gap: 8, marginTop: 4 },
  gapBtn: {
    backgroundColor: "#0b1120",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  gapBtnText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  gapBtnSecondary: { backgroundColor: "transparent", borderWidth: 1, borderColor: "#cbd5e1" },
  gapBtnSecondaryText: { color: "#64748b", fontWeight: "600", fontSize: 13 },
});
