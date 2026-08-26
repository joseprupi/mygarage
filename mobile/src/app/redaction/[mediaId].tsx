/**
 * Redaction Review Screen
 *
 * Route: /redaction/[mediaId]?eventId=<id>
 *
 * Shows the owner the original image with AI-detected redaction boxes overlaid.
 * Allows removing individual boxes (× tap) and adding new boxes via drag gesture.
 * Every change PATCHes the server to re-render the redacted copy.
 * Footer actions: Show redacted copy toggle, Redo with AI, Done.
 *
 * PanResponder add-box: implemented. Uses locationX/locationY (relative to the
 * image container View) to convert touch coords → 0-1000 box coords.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";

import {
  eventApi,
  mediaUrl,
  redactionApi,
  type Media,
  type RedactionBox,
  type VehicleEvent,
} from "@/lib/api";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function boxToPx(
  box: [number, number, number, number],
  imgW: number,
  imgH: number,
): { top: number; left: number; width: number; height: number } {
  const [ymin, xmin, ymax, xmax] = box;
  return {
    top: (ymin / 1000) * imgH,
    left: (xmin / 1000) * imgW,
    height: ((ymax - ymin) / 1000) * imgH,
    width: ((xmax - xmin) / 1000) * imgW,
  };
}

// ---------------------------------------------------------------------------
// component
// ---------------------------------------------------------------------------

export default function RedactionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mediaId: string; eventId: string }>();
  const mediaId = params.mediaId as string;
  const eventId = params.eventId as string;

  // ── all hooks up front (no early returns before these) ──
  const [event, setEvent] = useState<VehicleEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [boxes, setBoxes] = useState<RedactionBox[]>([]);
  const [showRedacted, setShowRedacted] = useState(false);
  const [addBoxMode, setAddBoxMode] = useState(false);
  const [dragging, setDragging] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const [patchBusy, setPatchBusy] = useState(false);
  const [redoBusy, setRedoBusy] = useState(false);
  // Cache-bust token — incremented after each PATCH so the redacted image reloads
  const [cacheBust, setCacheBust] = useState(() => Date.now());

  // Stable refs so PanResponder handlers close over live values without stale captures
  const imgLayoutRef = useRef<{ width: number; height: number } | null>(null);
  const addBoxModeRef = useRef(false);
  const boxesRef = useRef<RedactionBox[]>([]);
  const patchBusyRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  addBoxModeRef.current = addBoxMode;
  boxesRef.current = boxes;
  patchBusyRef.current = patchBusy;

  // ── data loading ──
  const load = useCallback(async () => {
    if (!eventId) return;
    try {
      const ev = await eventApi.get(eventId);
      setEvent(ev);
      const m = ev.media.find((item) => item.id === mediaId);
      if (m?.redactionBoxes) {
        setBoxes(m.redactionBoxes as RedactionBox[]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load media");
    }
  }, [eventId, mediaId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // ── box PATCH helper ──
  async function patchBoxes(newBoxes: RedactionBox[]) {
    if (!mediaId || patchBusyRef.current) return;
    setPatchBusy(true);
    try {
      const updated = await redactionApi.setBoxes(mediaId, newBoxes);
      setBoxes((updated.redactionBoxes as RedactionBox[]) ?? newBoxes);
      setCacheBust(Date.now());
      // Refresh event so redactedUrl is current
      setEvent((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          media: prev.media.map((m) =>
            m.id === mediaId ? { ...m, ...updated } : m,
          ),
        };
      });
    } catch (err) {
      Alert.alert("Error updating boxes", err instanceof Error ? err.message : String(err));
    } finally {
      setPatchBusy(false);
    }
  }

  function removeBox(index: number) {
    const next = boxes.filter((_, i) => i !== index);
    setBoxes(next);
    void patchBoxes(next);
  }

  // ── PanResponder for add-box drag ──
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => addBoxModeRef.current,
        onMoveShouldSetPanResponder: () => addBoxModeRef.current,
        onPanResponderGrant: (evt) => {
          if (!addBoxModeRef.current) return;
          const { locationX: x, locationY: y } = evt.nativeEvent;
          dragStartRef.current = { x, y };
          setDragging({ top: y, left: x, width: 0, height: 0 });
        },
        onPanResponderMove: (evt) => {
          if (!addBoxModeRef.current) return;
          const start = dragStartRef.current;
          if (!start) return;
          const { locationX: x, locationY: y } = evt.nativeEvent;
          setDragging({
            top: Math.min(start.y, y),
            left: Math.min(start.x, x),
            width: Math.abs(x - start.x),
            height: Math.abs(y - start.y),
          });
        },
        onPanResponderRelease: (evt) => {
          const start = dragStartRef.current;
          dragStartRef.current = null;
          setDragging(null);
          if (!addBoxModeRef.current || !imgLayoutRef.current || !start) return;
          const { locationX: x, locationY: y } = evt.nativeEvent;
          const { width: imgW, height: imgH } = imgLayoutRef.current;
          const top = Math.min(start.y, y), left = Math.min(start.x, x);
          const bottom = Math.max(start.y, y), right = Math.max(start.x, x);
          const ymin = clamp(Math.round((top / imgH) * 1000), 0, 1000);
          const xmin = clamp(Math.round((left / imgW) * 1000), 0, 1000);
          const ymax = clamp(Math.round((bottom / imgH) * 1000), 0, 1000);
          const xmax = clamp(Math.round((right / imgW) * 1000), 0, 1000);
          if (ymax - ymin > 10 && xmax - xmin > 10) {
            const newBox: RedactionBox = { kind: "other", box: [ymin, xmin, ymax, xmax] };
            const next = [...boxesRef.current, newBox];
            setBoxes(next);
            void patchBoxes(next);
          }
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ── Redo with AI ──
  async function handleRedo() {
    if (!mediaId || redoBusy) return;
    setRedoBusy(true);
    try {
      const updated = await redactionApi.regenerate(mediaId);
      setBoxes((updated.redactionBoxes as RedactionBox[]) ?? []);
      setCacheBust(Date.now());
      setEvent((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          media: prev.media.map((m) =>
            m.id === mediaId ? { ...m, ...updated } : m,
          ),
        };
      });
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : String(err));
    } finally {
      setRedoBusy(false);
    }
  }

  // ── early returns — AFTER all hooks ──
  if (!event) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: "Redaction review" }} />
        {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator />}
      </View>
    );
  }

  const media: Media | undefined = event.media.find((m) => m.id === mediaId);
  if (!media) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: "Redaction review" }} />
        <Text style={styles.error}>Media item not found in this event.</Text>
      </View>
    );
  }

  const originalUri = mediaUrl(media.url) ?? undefined;
  const redactedUri = media.redactedUrl
    ? (mediaUrl(media.redactedUrl) ?? undefined)
    : undefined;
  // Cache-bust the redacted copy so it reloads after PATCH
  const redactedUriCacheBusted = redactedUri ? `${redactedUri}?v=${cacheBust}` : undefined;
  const displayUri = showRedacted && redactedUriCacheBusted ? redactedUriCacheBusted : originalUri;

  // Aspect ratio for the image container (so boxes align with the rendered image)
  const aspectRatio =
    media.width && media.height ? media.width / media.height : 4 / 3;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: "Redaction review" }} />

      {/* ── image + box overlays ── */}
      <View
        style={[styles.imgContainer, { aspectRatio }]}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          imgLayoutRef.current = { width, height };
        }}
        {...(addBoxMode ? panResponder.panHandlers : {})}
      >
        <Image
          source={displayUri ? { uri: displayUri } : undefined}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />

        {/* Existing boxes (shown only when viewing original) */}
        {!showRedacted &&
          boxes.map((b, i) => {
            const layout = imgLayoutRef.current;
            if (!layout) return null;
            const px = boxToPx(b.box, layout.width, layout.height);
            return (
              <View key={i} style={[styles.boxOverlay, px]}>
                <Text style={styles.boxKind} numberOfLines={1}>
                  {b.kind}
                </Text>
                <Pressable
                  style={styles.boxRemoveBtn}
                  onPress={() => removeBox(i)}
                  hitSlop={6}
                >
                  <Text style={styles.boxRemoveText}>×</Text>
                </Pressable>
              </View>
            );
          })}

        {/* Dragging rectangle while adding a new box */}
        {dragging && (
          <View
            style={[
              styles.boxOverlay,
              styles.boxDragging,
              {
                top: dragging.top,
                left: dragging.left,
                width: dragging.width,
                height: dragging.height,
              },
            ]}
          />
        )}

        {addBoxMode && (
          <View style={styles.addBoxHint} pointerEvents="none">
            <Text style={styles.addBoxHintText}>Drag to add a box</Text>
          </View>
        )}
      </View>

      {/* ── controls ── */}
      <View style={styles.controls}>
        <Text style={styles.helpText}>
          Only the redacted copy is shared. The original never leaves your private storage. Check
          the preview — the AI can miss things.
        </Text>

        {/* Show redacted copy toggle */}
        {redactedUri && (
          <Pressable
            style={styles.toggleBtn}
            onPress={() => setShowRedacted((v) => !v)}
          >
            <Text style={styles.toggleBtnText}>
              {showRedacted ? "Show original" : "Show redacted copy"}
            </Text>
          </Pressable>
        )}
        {!redactedUri && (
          <Text style={styles.noPreview}>Redacted copy not available yet. Add/remove boxes to generate one.</Text>
        )}

        {/* Add-box mode toggle */}
        <Pressable
          style={[styles.toggleBtn, addBoxMode && styles.toggleBtnActive]}
          onPress={() => setAddBoxMode((v) => !v)}
        >
          <Text style={[styles.toggleBtnText, addBoxMode && styles.toggleBtnTextActive]}>
            {addBoxMode ? "Cancel adding box" : "Add box"}
          </Text>
        </Pressable>

        {patchBusy && (
          <View style={styles.patchRow}>
            <ActivityIndicator size="small" color="#2563eb" />
            <Text style={styles.patchText}>Updating redacted copy…</Text>
          </View>
        )}

        {/* Boxes list */}
        {boxes.length > 0 && (
          <View style={styles.boxList}>
            <Text style={styles.boxListTitle}>Boxes ({boxes.length})</Text>
            {boxes.map((b, i) => (
              <View key={i} style={styles.boxListRow}>
                <Text style={styles.boxListKind}>{b.kind}</Text>
                <Text style={styles.boxListCoords}>
                  [{b.box.join(", ")}]
                </Text>
                <Pressable onPress={() => removeBox(i)} hitSlop={8}>
                  <Text style={styles.boxListRemove}>Remove</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {/* Footer actions */}
        <View style={styles.footer}>
          <Pressable
            style={[styles.actionBtn, styles.redoBtn]}
            onPress={handleRedo}
            disabled={redoBusy || patchBusy}
          >
            {redoBusy ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.actionBtnText}>Redo with AI</Text>
            )}
          </Pressable>

          <Pressable
            style={[styles.actionBtn, styles.doneBtn]}
            onPress={() => router.back()}
          >
            <Text style={styles.actionBtnText}>Done</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  content: { paddingBottom: 40 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  error: { color: "#dc2626", fontSize: 15, textAlign: "center" },

  imgContainer: {
    width: "100%",
    backgroundColor: "#0b1120",
    position: "relative",
    overflow: "hidden",
  },

  // Box overlay
  boxOverlay: {
    position: "absolute",
    backgroundColor: "rgba(100,100,100,0.5)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.7)",
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    padding: 2,
    overflow: "hidden",
  },
  boxKind: {
    fontSize: 9,
    color: "#fff",
    fontWeight: "700",
    backgroundColor: "rgba(0,0,0,0.4)",
    paddingHorizontal: 3,
    borderRadius: 2,
    flexShrink: 1,
  },
  boxRemoveBtn: {
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 2,
    paddingHorizontal: 3,
  },
  boxRemoveText: { color: "#fff", fontSize: 12, fontWeight: "700", lineHeight: 14 },
  boxDragging: {
    backgroundColor: "rgba(37,99,235,0.3)",
    borderColor: "#2563eb",
  },
  addBoxHint: {
    position: "absolute",
    bottom: 8,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  addBoxHintText: { color: "#fff", fontSize: 13, fontWeight: "600" },

  // Controls
  controls: { padding: 16, gap: 12 },
  helpText: { fontSize: 13, color: "#64748b", lineHeight: 18 },
  toggleBtn: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignSelf: "flex-start",
  },
  toggleBtnActive: { backgroundColor: "#0b1120", borderColor: "#0b1120" },
  toggleBtnText: { fontSize: 14, fontWeight: "600", color: "#0b1120" },
  toggleBtnTextActive: { color: "#fff" },
  noPreview: { fontSize: 13, color: "#94a3b8" },
  patchRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  patchText: { fontSize: 13, color: "#64748b" },

  // Boxes list (text fallback)
  boxList: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    padding: 10,
    gap: 6,
  },
  boxListTitle: { fontSize: 13, fontWeight: "700", color: "#334155" },
  boxListRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  boxListKind: { fontSize: 13, color: "#0b1120", fontWeight: "600", minWidth: 70 },
  boxListCoords: { fontSize: 11, color: "#94a3b8", flex: 1 },
  boxListRemove: { fontSize: 13, color: "#dc2626", fontWeight: "600" },

  // Footer
  footer: { marginTop: 8, gap: 10 },
  actionBtn: {
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
  },
  redoBtn: { backgroundColor: "#475569" },
  doneBtn: { backgroundColor: "#2563eb" },
  actionBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
