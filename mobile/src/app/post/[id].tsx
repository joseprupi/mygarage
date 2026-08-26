import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";

import { blockApi, postApi, userApi, type Comment, type Post } from "@/lib/api";
import { Avatar, PostCard, timeAgo } from "@/components/post-card";
import { ReportSheet } from "@/components/report-sheet";

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [meId, setMeId] = useState<string | null>(null);
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Report / block state
  const [postMenuVisible, setPostMenuVisible] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ type: "post" | "comment"; id: string } | null>(null);
  const [commentMenuTarget, setCommentMenuTarget] = useState<Comment | null>(null);
  const [blockBusy, setBlockBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [p, c, me] = await Promise.all([
        postApi.get(id),
        postApi.comments(id),
        userApi.me().catch(() => null),
      ]);
      setPost(p);
      setComments(c);
      setMeId(me?.id ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load the post");
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function toggleLike() {
    if (!post) return;
    const liked = post.viewer_has_liked;
    setPost({
      ...post,
      viewer_has_liked: !liked,
      like_count: post.like_count + (liked ? -1 : 1),
    });
    void (liked ? postApi.unlike(post.id) : postApi.like(post.id)).catch(() => void load());
  }

  function confirmDelete() {
    if (!post) return;
    const doDelete = async () => {
      try {
        await postApi.delete(post.id);
        router.back();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't delete post");
      }
    };
    if (Platform.OS === "web") {
      if (window.confirm("Delete this post?")) void doDelete();
    } else {
      Alert.alert("Delete this post?", "This cannot be undone.", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => void doDelete() },
      ]);
    }
  }

  async function blockAuthor() {
    if (!post) return;
    const authorId = post.author.id;
    setPostMenuVisible(false);
    setBlockBusy(true);
    try {
      await blockApi.block(authorId);
      Alert.alert(`Blocked @${post.author.username}`, "They won't appear in your feed.");
      router.back();
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Couldn't block user");
    } finally {
      setBlockBusy(false);
    }
  }

  async function sendComment() {
    if (!post || !draft.trim() || sending) return;
    setSending(true);
    try {
      const comment = await postApi.addComment(post.id, draft.trim());
      setComments((prev) => [...prev, comment]);
      setPost({ ...post, comment_count: post.comment_count + 1 });
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't post comment");
    } finally {
      setSending(false);
    }
  }

  if (!post) {
    return (
      <View style={styles.center}>
        {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator />}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      <Stack.Screen
        options={{
          headerRight:
            meId && meId === post.author.id
              ? () => (
                  <Pressable onPress={confirmDelete} hitSlop={8}>
                    <Ionicons name="trash-outline" size={20} color="#dc2626" />
                  </Pressable>
                )
              : meId && meId !== post.author.id
              ? () => (
                  <Pressable onPress={() => setPostMenuVisible(true)} hitSlop={8}>
                    <Ionicons name="ellipsis-horizontal" size={22} color="#0b1120" />
                  </Pressable>
                )
              : undefined,
        }}
      />
      <FlatList
        data={comments}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
            <PostCard post={post} onToggleLike={toggleLike} />
            <Text style={styles.commentsTitle}>
              {comments.length ? "Comments" : "No comments yet — be the first."}
            </Text>
          </>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.comment}
            onLongPress={
              meId && item.author && meId !== item.author.id
                ? () => setCommentMenuTarget(item)
                : undefined
            }
          >
            <Pressable onPress={item.author ? () => router.push(`/u/${item.author!.id}`) : undefined}>
              <Avatar name={item.author?.display_name ?? item.author?.username ?? "?"} size={30} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={styles.commentAuthor}>
                {item.author?.display_name ?? item.author?.username ?? "Unknown"}{" "}
                <Text style={styles.commentTime}>{timeAgo(item.created_at)}</Text>
              </Text>
              <Text style={styles.commentBody}>{item.body}</Text>
            </View>
          </Pressable>
        )}
      />
      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          placeholder="Add a comment…"
          placeholderTextColor="#94a3b8"
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={sendComment}
        />
        <Pressable onPress={sendComment} disabled={sending || !draft.trim()} hitSlop={8}>
          {sending ? (
            <ActivityIndicator />
          ) : (
            <Ionicons name="send" size={22} color={draft.trim() ? "#2563eb" : "#cbd5e1"} />
          )}
        </Pressable>
      </View>

      {/* Post overflow menu (non-own) */}
      {postMenuVisible && post && (
        <Modal transparent animationType="fade" onRequestClose={() => setPostMenuVisible(false)}>
          <Pressable style={styles.menuOverlay} onPress={() => setPostMenuVisible(false)}>
            <View style={styles.menuSheet}>
              <Pressable
                style={styles.menuItem}
                onPress={() => {
                  setPostMenuVisible(false);
                  setReportTarget({ type: "post", id: post.id });
                }}
              >
                <Ionicons name="flag-outline" size={18} color="#0b1120" />
                <Text style={styles.menuItemText}>Report post</Text>
              </Pressable>
              <View style={styles.menuDivider} />
              <Pressable
                style={styles.menuItem}
                onPress={() => {
                  void router.push(`/u/${post.author.id}`);
                  setPostMenuVisible(false);
                }}
              >
                <Ionicons name="person-outline" size={18} color="#0b1120" />
                <Text style={styles.menuItemText}>View @{post.author.username}</Text>
              </Pressable>
              <View style={styles.menuDivider} />
              <Pressable style={styles.menuItem} onPress={blockAuthor} disabled={blockBusy}>
                <Ionicons name="eye-off-outline" size={18} color="#dc2626" />
                <Text style={[styles.menuItemText, { color: "#dc2626" }]}>
                  {blockBusy ? "…" : `Block @${post.author.username}`}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>
      )}

      {/* Comment overflow menu */}
      {commentMenuTarget && (
        <Modal transparent animationType="fade" onRequestClose={() => setCommentMenuTarget(null)}>
          <Pressable style={styles.menuOverlay} onPress={() => setCommentMenuTarget(null)}>
            <View style={styles.menuSheet}>
              <Pressable
                style={styles.menuItem}
                onPress={() => {
                  const t = commentMenuTarget;
                  setCommentMenuTarget(null);
                  setReportTarget({ type: "comment", id: t.id });
                }}
              >
                <Ionicons name="flag-outline" size={18} color="#0b1120" />
                <Text style={styles.menuItemText}>Report comment</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>
      )}

      {/* Report sheet */}
      {reportTarget && (
        <ReportSheet
          visible={true}
          onClose={() => setReportTarget(null)}
          targetType={reportTarget.type}
          targetId={reportTarget.id}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  list: { maxWidth: 560, width: "100%", alignSelf: "center", paddingBottom: 16 },
  commentsTitle: { paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, fontWeight: "700", color: "#334155" },
  comment: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingVertical: 8 },
  commentAuthor: { fontSize: 16, fontWeight: "700", color: "#0b1120" },
  commentTime: { fontSize: 14, color: "#94a3b8", fontWeight: "400" },
  commentBody: { fontSize: 17, color: "#0b1120", marginTop: 2 },
  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e2e8f0",
    padding: 12,
    maxWidth: 560,
    width: "100%",
    alignSelf: "center",
    backgroundColor: "#fff",
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 17,
    color: "#0b1120",
    backgroundColor: "#f8fafc",
  },
  error: { color: "#dc2626", fontSize: 16 },
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
  menuDivider: { height: StyleSheet.hairlineWidth, backgroundColor: "#e2e8f0", marginHorizontal: 20 },
});
