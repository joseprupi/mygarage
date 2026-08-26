import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";

import {
  eventApi,
  eventMediaApi,
  mediaUrl,
  ownershipApi,
  userApi,
  vehicleApi,
  type Media,
  type Post,
  type UserSettings,
  type Vehicle,
  type VehicleEvent,
  type VehicleMod,
  type VehicleOwnership,
} from "@/lib/api";
import { ReportSheet } from "@/components/report-sheet";
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

/** Divider text when reading events top-to-bottom (newest first). */
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

/** Human-readable labels for editedFields values. */
const EDITED_FIELD_LABELS: Record<string, string> = {
  event_date: "date",
  cost_cents: "cost",
  mileage: "mileage",
  shop_name: "shop",
  fuel_gallons: "gallons",
  fuel_price_cents: "price/gal",
};

/** Readable PII kind labels. */
const PII_KIND_LABELS: Record<string, string> = {
  name: "name",
  address: "address",
  phone: "phone",
  email: "email",
  license_number: "driver's license",
  signature: "signature",
  vin: "VIN",
  plate: "plate",
  payment_card: "payment card",
  other: "other",
};

// --- Media Viewer Modal ---

function MediaViewerModal({
  media,
  onClose,
  onTogglePublic,
}: {
  media: Media;
  onClose: () => void;
  onTogglePublic: (newVal: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  async function handleToggle(val: boolean) {
    setBusy(true);
    try {
      await onTogglePublic(val);
    } catch (err) {
      Alert.alert(
        "Can't change visibility",
        err instanceof Error ? err.message : "Something went wrong",
      );
    } finally {
      setBusy(false);
    }
  }

  const imageUri = mediaUrl(media.url) ?? undefined;
  const piiDetected = media.piiStatus === "detected";
  const piiUnknown = media.piiStatus === "unknown";
  const piiKindsText =
    piiDetected && media.piiKinds?.length
      ? media.piiKinds.map((k) => PII_KIND_LABELS[k] ?? k).join(", ")
      : null;

  const switchEnabled = media.piiStatus === "none" && !busy;
  const switchHint = piiDetected
    ? "Locked private — contains personal info"
    : piiUnknown
    ? "Locked until checked"
    : null;

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <View style={viewerStyles.bg}>
        <Pressable style={viewerStyles.closeBtn} onPress={onClose} hitSlop={12}>
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>

        <Image
          source={imageUri ? { uri: imageUri } : undefined}
          style={viewerStyles.image}
          contentFit="contain"
        />

        <View style={viewerStyles.footer}>
          {(piiDetected || piiUnknown) && (
            <View style={viewerStyles.piiBanner}>
              <Ionicons name="warning-outline" size={16} color="#f59e0b" />
              <Text style={viewerStyles.piiText}>
                {piiDetected
                  ? `Contains personal info${piiKindsText ? `: ${piiKindsText}` : ""}`
                  : "Checking for personal info…"}
              </Text>
            </View>
          )}

          <View style={viewerStyles.visRow}>
            <Text style={viewerStyles.visLabel}>Visible to everyone</Text>
            <Switch
              value={media.isPublic ?? false}
              onValueChange={handleToggle}
              disabled={!switchEnabled}
              trackColor={{ true: "#2563eb" }}
            />
          </View>
          {switchHint && <Text style={viewerStyles.visHint}>{switchHint}</Text>}
        </View>
      </View>
    </Modal>
  );
}

const viewerStyles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    justifyContent: "center",
  },
  closeBtn: {
    position: "absolute",
    top: 52,
    right: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    flex: 1,
    marginHorizontal: 0,
    marginTop: 80,
    marginBottom: 0,
  },
  footer: {
    backgroundColor: "rgba(0,0,0,0.7)",
    padding: 16,
    gap: 8,
  },
  piiBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  piiText: {
    flex: 1,
    fontSize: 14,
    color: "#fde68a",
    fontWeight: "600",
    lineHeight: 20,
  },
  visRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  visLabel: { fontSize: 16, color: "#fff", fontWeight: "600" },
  visHint: { fontSize: 13, color: "#94a3b8" },
});

// --- subcomponents ---

function EventRow({
  event,
  onPress,
  showPrevOwnerBadge,
  isOwner,
  onOpenMedia,
  onToggleHidden,
}: {
  event: VehicleEvent;
  onPress?: () => void;
  showPrevOwnerBadge?: boolean;
  isOwner?: boolean;
  onOpenMedia?: (media: Media) => void;
  onToggleHidden?: () => void;
}) {
  const colors = eventTypeColors(event.event_type);
  const cost = formatMoney(event.cost_cents, event.currency);

  // Build provenance label
  let provenanceLabel: string | null = null;
  if (event.source === "scan") {
    provenanceLabel = "From receipt";
  } else if (event.source === "scan_edited") {
    const fieldLabels = (event.editedFields ?? [])
      .map((f) => EDITED_FIELD_LABELS[f] ?? f)
      .join(", ");
    provenanceLabel = fieldLabels ? `From receipt · edited: ${fieldLabels}` : "From receipt · edited";
  }

  // Build media thumbnail node
  const firstMedia = event.media[0] ?? null;
  let thumbNode: React.ReactNode = null;

  if (firstMedia) {
    const canView = firstMedia.canView !== false; // treat undefined as true (legacy)
    if (canView) {
      const thumbUri = mediaUrl(firstMedia.thumbnailUrl ?? firstMedia.url) ?? undefined;
      thumbNode = (
        <Pressable
          onPress={isOwner && onOpenMedia ? () => onOpenMedia(firstMedia) : undefined}
          disabled={!(isOwner && onOpenMedia)}
        >
          <View style={styles.thumbWrap}>
            <Image source={thumbUri ? { uri: thumbUri } : undefined} style={styles.eventThumb} contentFit="cover" />
            {!firstMedia.isPublic && (
              <View style={styles.lockOverlay}>
                <Ionicons name="lock-closed" size={10} color="#fff" />
              </View>
            )}
          </View>
        </Pressable>
      );
    } else {
      // Non-owner, private: show blur placeholder
      const blurUri = mediaUrl(firstMedia.blurUrl) ?? undefined;
      thumbNode = (
        <View style={styles.thumbWrap}>
          {blurUri ? (
            <Image source={{ uri: blurUri }} style={[styles.eventThumb, { opacity: 0.6 }]} contentFit="cover" />
          ) : (
            <View style={[styles.eventThumb, styles.docTile]}>
              <Ionicons name="document-outline" size={22} color="#94a3b8" />
            </View>
          )}
          <View style={styles.lockOverlay}>
            <Ionicons name="lock-closed" size={10} color="#fff" />
          </View>
          <Text style={styles.onFileCaption}>On file</Text>
        </View>
      );
    }
  } else if (event.documents[0]) {
    // Document (PDF etc.) — show grey tile
    const doc = event.documents[0];
    const canView = doc.canView !== false;
    thumbNode = (
      <View style={styles.thumbWrap}>
        <View style={[styles.eventThumb, styles.docTile]}>
          <Ionicons name="document-outline" size={22} color="#94a3b8" />
        </View>
        {!canView && (
          <View style={styles.lockOverlay}>
            <Ionicons name="lock-closed" size={10} color="#fff" />
          </View>
        )}
        {!canView && <Text style={styles.onFileCaption}>On file</Text>}
      </View>
    );
  }

  return (
    <Pressable
      style={[styles.eventRow, event.hidden && { opacity: 0.6 }]}
      onPress={onPress}
      onLongPress={isOwner && onToggleHidden ? onToggleHidden : undefined}
      disabled={!onPress && !(isOwner && onToggleHidden)}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <View style={styles.eventTop}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
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
            {event.hidden && (
              <View style={styles.hiddenPill}>
                <Ionicons name="eye-off-outline" size={11} color="#94a3b8" />
                <Text style={styles.hiddenPillText}>hidden</Text>
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
        {provenanceLabel && (
          <View style={styles.provenanceRow}>
            <Ionicons name="scan-outline" size={11} color="#64748b" />
            <Text style={styles.provenanceText}>{provenanceLabel}</Text>
          </View>
        )}
      </View>
      {thumbNode}
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

  // media viewer
  const [viewerMedia, setViewerMedia] = useState<Media | null>(null);

  // vehicle menu (non-owner)
  const [vehicleMenuVisible, setVehicleMenuVisible] = useState(false);
  const [reportVehicleVisible, setReportVehicleVisible] = useState(false);

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

  async function handleTogglePublic(media: Media, val: boolean) {
    if (!media.id) throw new Error("No media id");
    await eventMediaApi.setPublic(media.id, val);
    setViewerMedia(null);
    void load();
  }

  function handleToggleHidden(event: VehicleEvent) {
    const newVal = !event.hidden;
    // Optimistic update
    setEvents((prev) =>
      prev ? prev.map((e) => (e.id === event.id ? { ...e, hidden: newVal } : e)) : prev,
    );
    void eventApi.setHidden(event.id, newVal).catch(() => {
      // Revert
      setEvents((prev) =>
        prev ? prev.map((e) => (e.id === event.id ? { ...e, hidden: event.hidden } : e)) : prev,
      );
      Alert.alert("Error", "Couldn't update visibility");
    });
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
                    onPress={() => router.push(`/vehicle/${vehicle.id}/transfer`)}
                    hitSlop={8}
                  >
                    <Ionicons name="swap-horizontal-outline" size={22} color="#64748b" />
                  </Pressable>
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
            : meId
            ? () => (
                <Pressable onPress={() => setVehicleMenuVisible(true)} hitSlop={8}>
                  <Ionicons name="ellipsis-horizontal" size={22} color="#0b1120" />
                </Pressable>
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

              if (i > 0 && bucket !== prevBucket) {
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
                    isOwner={isOwner}
                    onOpenMedia={(media) => setViewerMedia(media)}
                    onToggleHidden={isOwner ? () => handleToggleHidden(event) : undefined}
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

      {/* Media viewer modal — only shown to owner */}
      {viewerMedia && isOwner && (
        <MediaViewerModal
          media={viewerMedia}
          onClose={() => setViewerMedia(null)}
          onTogglePublic={(val) => handleTogglePublic(viewerMedia, val)}
        />
      )}

      {/* Vehicle overflow menu (non-owner) */}
      {vehicleMenuVisible && (
        <Modal transparent animationType="fade" onRequestClose={() => setVehicleMenuVisible(false)}>
          <Pressable style={styles.menuOverlay} onPress={() => setVehicleMenuVisible(false)}>
            <View style={styles.menuSheet}>
              <Pressable
                style={styles.menuItem}
                onPress={() => {
                  setVehicleMenuVisible(false);
                  setReportVehicleVisible(true);
                }}
              >
                <Ionicons name="flag-outline" size={18} color="#0b1120" />
                <Text style={styles.menuItemText}>Report vehicle</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>
      )}

      <ReportSheet
        visible={reportVehicleVisible}
        onClose={() => setReportVehicleVisible(false)}
        targetType="vehicle"
        targetId={vehicle.id}
      />
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
  eventTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
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
  // provenance
  provenanceRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 1 },
  provenanceText: { fontSize: 12, color: "#64748b", fontStyle: "italic" },
  // thumbnails
  thumbWrap: { alignItems: "center" },
  eventThumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: "#f1f5f9" },
  docTile: { alignItems: "center", justifyContent: "center" },
  lockOverlay: {
    position: "absolute",
    bottom: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  onFileCaption: { fontSize: 10, color: "#94a3b8", marginTop: 2, textAlign: "center" },
  // build tab
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
  // hidden pill
  hiddenPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  hiddenPillText: { fontSize: 11, fontWeight: "600", color: "#94a3b8" },
  // vehicle overflow menu
  menuOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },
  menuSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 32,
    paddingTop: 8,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  menuItemText: { fontSize: 16, color: "#0b1120", fontWeight: "500" },
});
