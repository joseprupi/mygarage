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
  ownershipApi,
  userApi,
  vehicleApi,
  type Post,
  type UserSettings,
  type Vehicle,
  type VehicleEvent,
  type VehicleMod,
  type VehicleOwnership,
} from "@/lib/api";
import type { GapInfo } from "@/lib/stats";
import { eventTypeColors, eventTypeLabel, formatDate, formatMoney, tagLabel } from "@/lib/events";
import { computeVehicleStats } from "@/lib/stats";
import { MileageChart } from "@/components/mileage-chart";
import { PostCard } from "@/components/post-card";

const TABS = ["History", "Build", "Posts"] as const;
type Tab = (typeof TABS)[number];
type StatsScope = "ownership" | "lifetime";

// --- helpers ---

/** Human-readable label for an ownership period. */
function periodLabel(o: VehicleOwnership): string {
  if (o.ownerUsername && o.showOwnerName) return `@${o.ownerUsername}`;
  return o.label ?? "Previous owner";
}

/** Unique key for the ownership "bucket" an event belongs to. */
function eventBucketKey(event: VehicleEvent): string {
  if (event.ownershipId) return event.ownershipId;
  if (event.isPreviousOwner) return "implicit";
  return "untracked";
}

/** Divider text when reading events top-to-bottom (newest first). The divider appears
 *  between event[i] (older attribution) and event[i-1] (newer attribution) and labels
 *  the START of the upper (newer) bucket. */
function dividerText(upperBucketKey: string, ownerships: VehicleOwnership[]): string | null {
  if (upperBucketKey === "implicit") return "▸ Previous owner";
  if (upperBucketKey === "untracked") return null;
  const period = ownerships.find((o) => o.id === upperBucketKey);
  if (!period) return null;
  const name = period.ownerUsername && period.showOwnerName
    ? `@${period.ownerUsername}`
    : period.label ?? "Previous owner";
  const verb = period.isCurrent ? " took over" : "";
  const datePart = period.startDate ? ` · ${formatDate(period.startDate)}` : "";
  const miPart = period.startMileage != null ? ` · ${period.startMileage.toLocaleString()} mi` : "";
  return `▸ ${name}${verb}${datePart}${miPart}`;
}

// --- subcomponents ---

function EventRow({
  event,
  onPress,
  showPrevOwnerBadge,
}: {
  event: VehicleEvent;
  onPress?: () => void;
  showPrevOwnerBadge?: boolean;
}) {
  const colors = eventTypeColors(event.event_type);
  const cost = formatMoney(event.cost_cents, event.currency);
  const thumb = mediaUrl(event.media[0]?.thumbnail_url ?? event.media[0]?.url);
  return (
    <Pressable style={styles.eventRow} onPress={onPress} disabled={!onPress}>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={styles.eventTop}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={[styles.badge, { backgroundColor: colors.bg }]}>
              <Text style={[styles.badgeText, { color: colors.text }]}>
                {eventTypeLabel(event.event_type)}
              </Text>
            </View>
            {showPrevOwnerBadge && (
              <View style={styles.prevOwnerPill}>
                <Text style={styles.prevOwnerPillText}>prev owner</Text>
              </View>
            )}
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

function OwnershipDivider({ text }: { text: string }) {
  return (
    <View style={styles.ownerDivider}>
      <Text style={styles.ownerDividerText}>{text}</Text>
    </View>
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

// --- main screen ---

export default function VehicleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  // core data
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [meSettings, setMeSettings] = useState<UserSettings | undefined>(undefined);
  const [tab, setTab] = useState<Tab>("History");
  const [events, setEvents] = useState<VehicleEvent[] | null>(null);
  const [ownerships, setOwnerships] = useState<VehicleOwnership[]>([]);
  const [mods, setMods] = useState<VehicleMod[] | null>(null);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissedGaps, setDismissedGaps] = useState<Set<string>>(new Set());

  // ownership UI state
  const [ownershipFilter, setOwnershipFilter] = useState<string | null>(null); // null = All
  const [statsScope, setStatsScope] = useState<StatsScope>("ownership");

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [v, me, ev, md, ps, own] = await Promise.all([
        vehicleApi.get(id),
        userApi.me().catch(() => null),
        vehicleApi.events(id),
        vehicleApi.mods(id),
        vehicleApi.posts(id),
        ownershipApi.list(id).catch(() => [] as VehicleOwnership[]),
      ]);
      setVehicle(v);
      setMeId(me?.id ?? null);
      setMeSettings(me?.settings);
      setEvents(ev);
      setMods(md);
      setPosts(ps);
      setOwnerships(own);
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
  const currentPeriod = ownerships.find((o) => o.isCurrent) ?? null;
  const hasImplicit = (events ?? []).some((e) => e.ownershipId === null && e.isPreviousOwner);
  const showFilterRow = ownerships.length > 1 || hasImplicit;

  // Filter chips definition
  const currentChipLabel = isOwner ? "Your ownership" : "Current owner";
  const filterChips: { key: string | null; label: string }[] = [
    { key: null, label: "All" },
    ...(currentPeriod ? [{ key: currentPeriod.id, label: currentChipLabel }] : []),
    ...ownerships
      .filter((o) => !o.isCurrent)
      .map((o) => ({ key: o.id, label: periodLabel(o) })),
    ...(hasImplicit ? [{ key: "implicit", label: "Previous owner" }] : []),
  ];

  // Apply ownership filter to events
  const allEvents = events ?? [];
  const filteredEvents =
    ownershipFilter === null
      ? allEvents
      : ownershipFilter === "implicit"
      ? allEvents.filter((e) => e.ownershipId === null && e.isPreviousOwner)
      : allEvents.filter((e) => e.ownershipId === ownershipFilter);

  // Stats scoping
  const statsEvents =
    statsScope === "ownership" && currentPeriod
      ? allEvents.filter((e) => e.ownershipId === currentPeriod.id)
      : allEvents;

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
  const stats = computeVehicleStats(vehicle, statsEvents, {
    detectMissedFillups: meSettings?.detectMissedFillups ?? true,
    includeEstimatedFuel: meSettings?.includeEstimatedFuel ?? true,
  });

  // Mileage chart boundaries (start of each period except the oldest = ordinal 1)
  const chartBoundaries = ownerships
    .filter((o) => o.ordinal > 1)
    .map((o) => ({
      date: o.startDate,
      label: o.ownerUsername && o.showOwnerName ? `@${o.ownerUsername}` : o.label ?? "New owner",
    }));

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
          {/* Stats scope toggle */}
          <View style={styles.scopeRow}>
            {(["ownership", "lifetime"] as StatsScope[]).map((scope) => {
              const label = scope === "ownership"
                ? (isOwner ? "Your ownership" : "Current owner")
                : "Lifetime";
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

          <View style={styles.statsRow}>
            <View style={styles.statTile}>
              <Text style={styles.statValue}>{statsEvents.length}</Text>
              <Text style={styles.statLabel}>Events</Text>
            </View>
            {stats.summary.map((row) => (
              <View key={row.label} style={styles.statTile}>
                <Text style={styles.statValue}>{row.value}</Text>
                <Text style={styles.statLabel}>{row.label}</Text>
              </View>
            ))}
          </View>
          <View style={styles.statsLinks}>
            <Pressable onPress={() => router.push(`/vehicle/${vehicle.id}/stats`)} hitSlop={6}>
              <Text style={styles.allStatsLink}>All stats →</Text>
            </Pressable>
            {isOwner && (
              <Pressable onPress={() => router.push(`/vehicle/${vehicle.id}/ownership`)} hitSlop={6}>
                <Text style={styles.ownershipLink}>Ownership →</Text>
              </Pressable>
            )}
          </View>

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
            events={statsEvents}
            origin={
              vehicle.purchase_date && vehicle.mileage != null
                ? { date: vehicle.purchase_date, miles: vehicle.mileage }
                : undefined
            }
            boundaries={chartBoundaries}
          />

          {/* Ownership filter chips */}
          {showFilterRow && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
              <View style={styles.chipRow}>
                {filterChips.map((chip) => (
                  <Pressable
                    key={String(chip.key)}
                    style={[styles.filterChip, ownershipFilter === chip.key && styles.filterChipActive]}
                    onPress={() => setOwnershipFilter(chip.key)}
                  >
                    <Text style={[styles.filterChipText, ownershipFilter === chip.key && styles.filterChipTextActive]}>
                      {chip.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          )}

          {/* Event list with ownership dividers */}
          {(() => {
            const activeGaps = stats.gaps.filter((g) => !dismissedGaps.has(g.beforeEventId));
            const gapMap = new Map(activeGaps.map((g) => [g.beforeEventId, g]));
            const rows: React.ReactNode[] = [];
            let prevBucket: string | null = null;

            for (let i = 0; i < filteredEvents.length; i++) {
              const event = filteredEvents[i];
              const bucket = eventBucketKey(event);

              // Insert divider when ownership attribution changes (skip for the first event)
              if (i > 0 && bucket !== prevBucket) {
                // prevBucket is the bucket of the event ABOVE (more recent);
                // the divider labels that bucket's start
                const text = prevBucket !== null ? dividerText(prevBucket, ownerships) : null;
                if (text) {
                  rows.push(<OwnershipDivider key={`div-${i}`} text={text} />);
                }
              }
              prevBucket = bucket;

              rows.push(
                <View key={event.id}>
                  <EventRow
                    event={event}
                    showPrevOwnerBadge={event.isPreviousOwner}
                    onPress={
                      event.canEdit
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
                </View>,
              );
            }

            // Add a trailing divider after the last event to label the oldest bucket
            if (prevBucket !== null && filteredEvents.length > 0) {
              const lastBucket = prevBucket;
              const text = dividerText(lastBucket, ownerships);
              if (text && filteredEvents.length > 0) {
                // Only show a trailing divider for the last section if it's the
                // oldest implicit / previous-owner bucket (to anchor it visually)
                // We skip this to avoid a dangling divider — the filter chips handle context
              }
            }

            return rows;
          })()}

          {filteredEvents.length === 0 && (
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
  scopeRow: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    overflow: "hidden",
  },
  scopeBtn: { flex: 1, paddingVertical: 7, alignItems: "center", backgroundColor: "#f8fafc" },
  scopeBtnActive: { backgroundColor: "#0b1120" },
  scopeBtnText: { fontSize: 14, fontWeight: "600", color: "#64748b" },
  scopeBtnTextActive: { color: "#fff" },
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
  statsLinks: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  allStatsLink: { fontSize: 15, color: "#2563eb", fontWeight: "700" },
  ownershipLink: { fontSize: 15, color: "#64748b", fontWeight: "600" },
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
  // filter chips
  chipScroll: { marginHorizontal: -16 },
  chipRow: { flexDirection: "row", gap: 6, paddingHorizontal: 16, paddingVertical: 2 },
  filterChip: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: "#f8fafc",
  },
  filterChipActive: { backgroundColor: "#0b1120", borderColor: "#0b1120" },
  filterChipText: { fontSize: 14, fontWeight: "600", color: "#64748b" },
  filterChipTextActive: { color: "#fff" },
  // ownership divider
  ownerDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
    paddingVertical: 6,
    paddingHorizontal: 4,
    marginVertical: 2,
  },
  ownerDividerText: { fontSize: 13, color: "#94a3b8", fontWeight: "600" },
  // events
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
  prevOwnerPill: {
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  prevOwnerPillText: { fontSize: 11, fontWeight: "600", color: "#94a3b8" },
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
