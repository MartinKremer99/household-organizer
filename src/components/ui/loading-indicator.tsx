export function LoadingIndicator({
  label,
  srOnly = false,
}: {
  label: string;
  srOnly?: boolean;
}) {
  return (
    <div className="grid min-h-[calc(100svh-8rem)] place-items-center">
      <div className="flex flex-col items-center gap-3">
        <span
          className="size-8 animate-spin rounded-full border-2 border-border border-t-primary motion-reduce:animate-none"
          aria-hidden="true"
        />
        <p
          role="status"
          className={srOnly ? "sr-only" : "text-secondary text-muted-foreground"}
        >
          {label}
        </p>
      </div>
    </div>
  );
}
