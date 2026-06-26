export const CLIENT_CANCEL_SEEN_MARK = "[admin_seen_client_cancel]";

export function isClientCancelSeen(adminComment: string | null | undefined) {
  return String(adminComment || "").includes(CLIENT_CANCEL_SEEN_MARK);
}

export function markClientCancelSeen(adminComment: string | null | undefined) {
  const current = String(adminComment || "").trim();
  if (isClientCancelSeen(current)) return current;
  return current ? `${current}\n${CLIENT_CANCEL_SEEN_MARK}` : CLIENT_CANCEL_SEEN_MARK;
}
