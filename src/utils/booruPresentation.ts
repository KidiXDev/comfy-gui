export function ratingColorClass(rating: string): string {
  switch (rating?.toLowerCase()) {
    case 'general':
    case 'safe':
    case 'g':
    case 's':
      return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400';
    case 'sensitive':
    case 'questionable':
    case 'q':
      return 'border-amber-500/40 bg-amber-500/10 text-amber-300';
    case 'explicit':
    case 'e':
      return 'border-rose-500/40 bg-rose-500/10 text-rose-400';
    default:
      return 'border-border bg-secondary text-muted-foreground';
  }
}
