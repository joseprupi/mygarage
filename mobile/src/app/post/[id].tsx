import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";

import { postApi, type Comment, type Post } from "@/lib/api";
import { Avatar, PostCard, timeAgo } from "@/components/post-card";

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [p, c] = await Promise.all([postApi.get(id), postApi.comments(id)]);
      setPost(p);
      setComments(c);
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
          <View style={styles.comment}>
            <Avatar name={item.author?.display_name ?? item.author?.username ?? "?"} size={30} />
            <View style={{ flex: 1 }}>
              <Text style={styles.commentAuthor}>
                {item.author?.display_name ?? item.author?.username ?? "Unknown"}{" "}
                <Text style={styles.commentTime}>{timeAgo(item.created_at)}</Text>
              </Text>
              <Text style={styles.commentBody}>{item.body}</Text>
            </View>
          </View>
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
});
