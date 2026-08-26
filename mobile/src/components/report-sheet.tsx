import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { reportApi, type ReportPayload } from "@/lib/api";

type Reason = ReportPayload["reason"];

const REASONS: { key: Reason; label: string }[] = [
  { key: "spam", label: "Spam" },
  { key: "harassment", label: "Harassment or bullying" },
  { key: "inappropriate", label: "Inappropriate content" },
  { key: "privacy", label: "Privacy concern" },
  { key: "other", label: "Other" },
];

type Props = {
  visible: boolean;
  onClose: () => void;
  targetType: ReportPayload["targetType"];
  targetId: string;
};

export function ReportSheet({ visible, onClose, targetType, targetId }: Props) {
  const [reason, setReason] = useState<Reason | null>(null);
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);

  function reset() {
    setReason(null);
    setDetails("");
    setSending(false);
  }

  async function submit() {
    if (!reason) return;
    setSending(true);
    try {
      await reportApi.create({ targetType, targetId, reason, details: details.trim() || undefined });
      reset();
      onClose();
      Alert.alert("Report submitted", "Thanks — we'll review it.");
    } catch {
      setSending(false);
      Alert.alert("Couldn't submit", "Please try again.");
    }
  }

  function handleClose() {
    reset();
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Report</Text>
          <Pressable onPress={handleClose} hitSlop={10}>
            <Ionicons name="close" size={24} color="#0b1120" />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.sectionLabel}>Why are you reporting this?</Text>
          {REASONS.map((r) => (
            <Pressable key={r.key} style={styles.reasonRow} onPress={() => setReason(r.key)}>
              <View style={[styles.radio, reason === r.key && styles.radioSelected]}>
                {reason === r.key && <View style={styles.radioDot} />}
              </View>
              <Text style={styles.reasonLabel}>{r.label}</Text>
            </Pressable>
          ))}

          <Text style={[styles.sectionLabel, { marginTop: 16 }]}>Additional details (optional)</Text>
          <TextInput
            style={styles.detailsInput}
            multiline
            numberOfLines={3}
            value={details}
            onChangeText={setDetails}
            placeholder="Describe what you saw…"
            placeholderTextColor="#94a3b8"
          />

          <Pressable
            style={[styles.submitBtn, (!reason || sending) && { opacity: 0.5 }]}
            onPress={submit}
            disabled={!reason || sending}
          >
            {sending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitBtnText}>Submit report</Text>
            )}
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e2e8f0",
  },
  title: { fontSize: 18, fontWeight: "700", color: "#0b1120" },
  body: { padding: 20, gap: 8 },
  sectionLabel: { fontSize: 13, fontWeight: "600", color: "#64748b", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 },
  reasonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#f1f5f9",
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#cbd5e1",
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: { borderColor: "#2563eb" },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#2563eb" },
  reasonLabel: { fontSize: 16, color: "#0b1120" },
  detailsInput: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    color: "#0b1120",
    minHeight: 80,
    textAlignVertical: "top",
  },
  submitBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 12,
  },
  submitBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
