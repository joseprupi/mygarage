import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";

import { blockApi, userApi, type Post, type UserProfile } from "@/lib/api";
import { ReportSheet } from "@/components/report-sheet";
import { PostCard } from "@/components/post-card";
import { Avatar } from "@/components/post-card";

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [user, me, userPosts] = await Promise.all([
        userApi.get(id),
        userApi.me().catch(() => null),
        userApi.posts(id).catch(() => [] as Post[]),
      ]);
      setProfile(user);
      setMeId(me?.id ?? null);
      setPosts(userPosts);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load profile");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function toggleBlock() {
    if (!profile || !id) return;
    const isBlocked = profile.viewerHasBlocked === true;
    setBlockBusy(true);
    setMenuVisible(false);
    try {
      if (isBlocked) {
        await blockApi.unblock(id);
      } else {
        await blockApi.block(id);
        Alert.alert(
          `You've blocked @${profile.username}`,
          "They won't appear in your feed.",
          [{ text: "Unblock", onPress: () => void toggleBlock() }, { text: "OK" }],
        );
      }
      await load();
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBlockBusy(false);
    }
  }

  const isSelf = meId && profile && meId === profile.id;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (error || !profile) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error ?? "Not found"}</Text>
      </View>
    );
  }

  const name = profile.display_name ?? profile.username;
  const isBlocked = profile.viewerHasBlocked === true;

  return (
    <>
      <Stack.Screen
        options={{
          title: `@${profile.username}`,
          headerRight:
            !isSelf
              ? () => (
                  <Pressable onPress={() => setMenuVisible(true)} hitSlop={8}>
                    <Ionicons name="ellipsis-horizontal" size={22} color="#0b1120" />
                  </Pressable>
                )
              : undefined,
        }}
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.profileHeader}>
          <Avatar name={name} size={64} />
          <View style={styles.profileInfo}>
            <Text style={styles.displayName}>{name}</Text>
            <Text style={styles.username}>@{profile.username}</Text>
            {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
            <Text style={styles.postCount}>{posts.length} posts</Text>
          </View>
        </View>

        {isBlocked && (
          <View style={styles.blockedBanner}>
            <Text style={styles.blockedText}>You&apos;ve blocked @{profile.username}</Text>
            <Pressable onPress={toggleBlock} disabled={blockBusy}>
              <Text style={styles.unblockBtn}>{blockBusy ? "…" : "Unblock"}</Text>
            </Pressable>
          </View>
        )}

        {posts.map((post) => (
          <PostCard key={post.id} post={post} onPress={() => router.push(`/post/${post.id}`)} />
        ))}

        {posts.length === 0 && !isBlocked && (
          <Text style={styles.empty}>No posts yet.</Text>
        )}
      </ScrollView>

      {/* Overflow menu */}
      {menuVisible && (
        <Pressable style={styles.menuOverlay} onPress={() => setMenuVisible(false)}>
          <View style={styles.menuSheet}>
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                setReportVisible(true);
              }}
            >
              <Ionicons name="flag-outline" size={18} color="#0b1120" />
              <Text style={styles.menuItemText}>Report @{profile.username}</Text>
            </Pressable>
            <View style={styles.menuDivider} />
            <Pressable style={styles.menuItem} onPress={() => void toggleBlock()} disabled={blockBusy}>
              <Ionicons name={isBlocked ? "eye-outline" : "eye-off-outline"} size={18} color="#dc2626" />
              <Text style={[styles.menuItemText, { color: "#dc2626" }]}>
                {blockBusy ? "…" : isBlocked ? `Unblock @${profile.username}` : `Block @${profile.username}`}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      )}

      <ReportSheet
        visible={reportVisible}
        onClose={() => setReportVisible(false)}
        targetType="user"
        targetId={id ?? ""}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { maxWidth: 560, width: "100%", alignSelf: "center", paddingBottom: 32 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  error: { color: "#dc2626", fontSize: 16 },
  profileHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
    padding: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e2e8f0",
  },
  profileInfo: { flex: 1, gap: 2 },
  displayName: { fontSize: 20, fontWeight: "700", color: "#0b1120" },
  username: { fontSize: 15, color: "#64748b" },
  bio: { fontSize: 15, color: "#334155", marginTop: 4, lineHeight: 22 },
  postCount: { fontSize: 14, color: "#94a3b8", marginTop: 4 },
  blockedBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fef2f2",
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
  },
  blockedText: { fontSize: 14, color: "#b91c1c", flex: 1 },
  unblockBtn: { fontSize: 14, color: "#2563eb", fontWeight: "600", marginLeft: 8 },
  empty: { padding: 32, fontSize: 16, color: "#94a3b8", textAlign: "center" },
  menuOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.3)",
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
  menuDivider: { height: StyleSheet.hairlineWidth, backgroundColor: "#e2e8f0", marginHorizontal: 20 },
});
