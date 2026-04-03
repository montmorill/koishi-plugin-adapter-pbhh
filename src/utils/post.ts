export function getPostDisplayName(postId: number, title?: string | null): string {
  const normalizedTitle = typeof title === 'string' ? title.trim() : '';
  if (normalizedTitle) {
    return normalizedTitle;
  }
  return `post#${postId}暂无标题`;
}
