export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
    .trim();
}

export function paginate<T>(items: T[], page: number, limit: number) {
  const offset = (page - 1) * limit;
  return {
    data: items.slice(offset, offset + limit),
    pagination: {
      page,
      limit,
      total: items.length,
      hasNext: offset + limit < items.length,
    },
  };
}
