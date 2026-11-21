interface QueryStateProps {
  isLoading: boolean;
  isError: boolean;
  errorMessage: string;
  loadingMessage?: string;
  onRetry: () => void;
}

export function QueryState({ isLoading, isError, errorMessage, loadingMessage = "Ładowanie…", onRetry }: QueryStateProps) {
  if (isError) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2">
        <p className="text-sm text-red-700">{errorMessage}</p>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
        >
          Spróbuj ponownie
        </button>
      </div>
    );
  }
  if (isLoading) return <p className="text-sm text-slate-500">{loadingMessage}</p>;
  return null;
}
