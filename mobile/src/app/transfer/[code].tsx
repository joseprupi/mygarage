import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";

import { mediaUrl, transferApi, type TransferPreview } from "@/lib/api";
import { formatDate } from "@/lib/events";

export default function TransferAcceptScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();

  const [preview, setPreview] = useState<TransferPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!code) return;
    void (async () => {
      setLoading(true);
      try {
        const p = await transferApi.byCode(code);
        setPreview(p);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't load transfer");
      } finally {
        setLoading(false);
      }
    })();
  }, [code]);

  async function accept() {
    if (!code || !preview || accepting) return;
    setAccepting(true);
    try {
      const vehicle = await transferApi.accept(code);
      Alert.alert("It's yours!", `${vehicle.year ?? ""} ${vehicle.make} ${vehicle.model} is now in your garage.`, [
        {
          text: "View vehicle",
          onPress: () => router.replace(`/vehicle/${vehicle.id}`),
        },
      ]);
    } catch (err) {
      Alert.alert("Transfer failed", err instanceof Error ? err.message : "Something went wrong");
      setAccepting(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (error || !preview) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error ?? "Transfer not found or expired."}</Text>
      </View>
    );
  }

  const v = preview.vehicle;
  const title = v.nickname || [v.year, v.make, v.model].filter(Boolean).join(" ");
  const coverUri = mediaUrl(v.coverUrl);

  const from = preview.fromUser
    ? `from @${preview.fromUser.username}`
    : "from a previous owner";

  const includedItems = [
    preview.counts.events > 0 ? `${preview.counts.events} history events` : null,
    preview.counts.mods > 0 ? `${preview.counts.mods} mods` : null,
    preview.counts.photos > 0 ? `${preview.counts.photos} photos` : null,
  ].filter(Boolean);

  const transferredOptions = [
    preview.keepDocuments ? "Receipts/documents included" : "Receipts/documents not included",
    preview.keepPostsTagged ? "Seller's posts stay tagged" : "Seller's posts untagged",
    preview.showOwnerName ? "Previous owner name visible" : "Previous owner shown anonymously",
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: "Accept transfer" }} />

      <View style={styles.card}>
        {coverUri ? (
          <Image source={{ uri: coverUri }} style={styles.cover} contentFit="cover" />
        ) : (
          <View style={[styles.cover, styles.coverPlaceholder]} />
        )}

        <View style={styles.cardBody}>
          <Text style={styles.carTitle}>{title}</Text>
          <Text style={styles.from}>{from}</Text>

          {preview.handoverDate && (
            <Text style={styles.detail}>Handover date: {formatDate(preview.handoverDate)}</Text>
          )}
          {preview.handoverMileage != null && (
            <Text style={styles.detail}>
              Handover mileage: {preview.handoverMileage.toLocaleString()} mi
            </Text>
          )}

          {includedItems.length > 0 && (
            <Text style={styles.included}>Includes: {includedItems.join(", ")}</Text>
          )}
        </View>
      </View>

      <Text style={styles.sectionLabel}>What&apos;s included</Text>
      <View style={styles.optionsList}>
        {transferredOptions.map((item) => (
          <Text key={item} style={styles.optionRow}>
            • {item}
          </Text>
        ))}
      </View>

      {!preview.canAccept && (
        <View style={styles.warningBanner}>
          <Text style={styles.warningText}>
            You cannot accept this transfer. You may already be the owner, or the link has expired.
          </Text>
        </View>
      )}

      <Pressable
        style={[styles.acceptBtn, (!preview.canAccept || accepting) && { opacity: 0.5 }]}
        onPress={accept}
        disabled={!preview.canAccept || accepting}
      >
        {accepting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.acceptBtnText}>Accept ownership</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  content: { padding: 20, gap: 14, maxWidth: 560, width: "100%", alignSelf: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  error: { color: "#dc2626", fontSize: 16, textAlign: "center" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    overflow: "hidden",
  },
  cover: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#f1f5f9" },
  coverPlaceholder: { backgroundColor: "#e2e8f0" },
  cardBody: { padding: 16, gap: 4 },
  carTitle: { fontSize: 20, fontWeight: "800", color: "#0b1120" },
  from: { fontSize: 15, color: "#64748b" },
  detail: { fontSize: 14, color: "#64748b" },
  included: { fontSize: 14, color: "#334155", marginTop: 4 },
  sectionLabel: { fontSize: 13, fontWeight: "600", color: "#64748b", textTransform: "uppercase", letterSpacing: 0.4 },
  optionsList: { gap: 6, backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: "#e2e8f0", padding: 16 },
  optionRow: { fontSize: 15, color: "#334155", lineHeight: 22 },
  warningBanner: {
    backgroundColor: "#fef3c7",
    borderRadius: 12,
    padding: 14,
  },
  warningText: { fontSize: 14, color: "#92400e", lineHeight: 20 },
  acceptBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  acceptBtnText: { color: "#fff", fontWeight: "700", fontSize: 17 },
});
