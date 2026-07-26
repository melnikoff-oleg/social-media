import { toast } from "sonner";

// ─── Error Classification ──────────────────────────────────────────────────────

export interface ClassifiedError {
  title: string;
  description: string;
  icon: string;
  duration: number;
  action?: "credits" | "settings" | "login";
}

/**
 * Classifies a raw backend error (code + message) into a user-friendly error object.
 */
export function classifyError(raw: {
  code?: string;
  message?: string;
  error?: string;
  status?: number;
}): ClassifiedError {
  const code = raw.code || "";
  const msg = (raw.message || raw.error || "").toLowerCase();
  const status = raw.status;

  // ── Credit / Billing ──────────────────────────────────────────────────────
  if (
    code === "INSUFFICIENT_CREDITS" ||
    msg.includes("insufficient") ||
    msg.includes("credits")
  ) {
    return {
      title: "Credits Exhausted",
      description:
        "You've run out of credits for this feature. Upgrade your plan to continue.",
      icon: "💳",
      duration: 8000,
      action: "credits",
    };
  }

  // ── Apify ─────────────────────────────────────────────────────────────────
  if (code === "APIFY_QUOTA_EXCEEDED" || msg.includes("apify_quota")) {
    return {
      title: "Apify Credits Exhausted",
      description:
        "Your Apify scraping account has no compute credits left. Top up at apify.com to continue scraping.",
      icon: "🚫",
      duration: 10000,
    };
  }
  if (code === "APIFY_INVALID_TOKEN" || msg.includes("apify_invalid")) {
    return {
      title: "Invalid Apify Token",
      description:
        "Your Apify API token is invalid or expired. Please update it in Settings → API Keys.",
      icon: "🔑",
      duration: 8000,
      action: "settings",
    };
  }

  // ── Gemini AI ─────────────────────────────────────────────────────────────
  if (code === "GEMINI_QUOTA_EXCEEDED" || msg.includes("gemini_quota")) {
    return {
      title: "Gemini AI Quota Exhausted",
      description:
        "Your Gemini API quota is exhausted. Check your Google Cloud usage or switch API keys in Settings.",
      icon: "🚫",
      duration: 10000,
      action: "settings",
    };
  }
  if (code === "GEMINI_INVALID_KEY" || msg.includes("gemini_invalid")) {
    return {
      title: "Invalid Gemini API Key",
      description:
        "Your Gemini API key is invalid or expired. Please update it in Settings → API Keys.",
      icon: "🔑",
      duration: 8000,
      action: "settings",
    };
  }

  // ── Video / Media ─────────────────────────────────────────────────────────
  if (
    msg.includes("no downloadable video") ||
    msg.includes("no video") ||
    msg.includes("has no downloadable")
  ) {
    return {
      title: "No Video Available",
      description:
        "This ad doesn't have a downloadable video file. Only video ads with accessible media can be analyzed.",
      icon: "🎬",
      duration: 6000,
    };
  }

  // ── Auth / Permission ─────────────────────────────────────────────────────
  if (status === 401 || msg.includes("unauthorized") || msg.includes("jwt")) {
    return {
      title: "Session Expired",
      description:
        "Your login session has expired. Please log in again to continue.",
      icon: "🔒",
      duration: 6000,
      action: "login",
    };
  }
  if (status === 403 || msg.includes("forbidden") || msg.includes("permission")) {
    return {
      title: "Access Denied",
      description:
        "You don't have permission to perform this action. Contact support if this is unexpected.",
      icon: "⛔",
      duration: 6000,
    };
  }

  // ── Not Found ─────────────────────────────────────────────────────────────
  if (status === 404 || msg.includes("not found")) {
    return {
      title: "Not Found",
      description:
        "The requested resource was not found. It may have been deleted or the URL is incorrect.",
      icon: "🔍",
      duration: 5000,
    };
  }

  // ── Network / Connection ──────────────────────────────────────────────────
  if (
    msg.includes("network") ||
    msg.includes("fetch failed") ||
    msg.includes("failed to fetch") ||
    msg.includes("net::err") ||
    msg.includes("econnrefused") ||
    msg.includes("econnreset")
  ) {
    return {
      title: "Connection Lost",
      description:
        "Network connection failed. Check your internet connection and make sure the server is running.",
      icon: "📡",
      duration: 8000,
    };
  }

  // ── Timeout ───────────────────────────────────────────────────────────────
  if (
    msg.includes("timeout") ||
    msg.includes("etimedout") ||
    msg.includes("timed out") ||
    msg.includes("aborted")
  ) {
    return {
      title: "Request Timed Out",
      description:
        "The server took too long to respond. It may be overloaded — please try again in a minute.",
      icon: "⏱️",
      duration: 8000,
    };
  }

  // ── No Stream ─────────────────────────────────────────────────────────────
  if (msg.includes("no response stream") || msg.includes("stream")) {
    return {
      title: "Connection Interrupted",
      description:
        "The data stream from the server was interrupted. Please refresh the page and try again.",
      icon: "🔌",
      duration: 6000,
    };
  }

  // ── Server Error (500) ────────────────────────────────────────────────────
  if (status === 500 || msg.includes("internal server error")) {
    return {
      title: "Server Error",
      description:
        "Something went wrong on our end. Please try again or contact support if the issue persists.",
      icon: "⚙️",
      duration: 8000,
    };
  }

  // ── Analysis-specific ─────────────────────────────────────────────────────
  if (msg.includes("analysis failed") || msg.includes("failed to analyze")) {
    return {
      title: "Analysis Failed",
      description:
        "The AI analysis could not be completed. This may be due to video format issues or API limits. Try again.",
      icon: "❌",
      duration: 6000,
    };
  }

  if (msg.includes("scrape") && msg.includes("fail")) {
    return {
      title: "Scraping Failed",
      description:
        "Could not scrape data from the target. The page might be private, removed, or temporarily unavailable.",
      icon: "🕷️",
      duration: 8000,
    };
  }

  // ── Default ───────────────────────────────────────────────────────────────
  const originalMsg = raw.message || raw.error || "Unknown error";
  return {
    title: "Something Went Wrong",
    description: originalMsg.length > 200
      ? originalMsg.substring(0, 200) + "…"
      : originalMsg,
    icon: "⚠️",
    duration: 6000,
  };
}

// ─── Toast Helper ───────────────────────────────────────────────────────────────

/**
 * Shows a user-friendly toast for a backend error.
 * Returns the classified error and the action to take (if any).
 */
export function showErrorToast(
  raw: {
    code?: string;
    message?: string;
    error?: string;
    status?: number;
  },
  setShowCreditModal?: (v: boolean) => void
): ClassifiedError {
  const classified = classifyError(raw);

  // Show toast
  toast.error(`${classified.icon} ${classified.title}`, {
    description: classified.description,
    duration: classified.duration,
  });

  // Auto-trigger credit modal if needed
  if (classified.action === "credits" && setShowCreditModal) {
    setShowCreditModal(true);
  }

  return classified;
}

/**
 * Processes an SSE error event and shows a user-friendly toast.
 * Use this inside SSE stream event handlers.
 */
export function handleSSEError(
  data: { type: string; code?: string; error?: string; message?: string },
  setShowCreditModal?: (v: boolean) => void
): ClassifiedError {
  return showErrorToast(
    { code: data.code, message: data.error || data.message },
    setShowCreditModal
  );
}

/**
 * Processes a caught JS Error and shows a user-friendly toast.
 */
export function handleCatchError(
  err: unknown,
  setShowCreditModal?: (v: boolean) => void
): ClassifiedError {
  if (err instanceof Error) {
    return showErrorToast(
      { message: err.message },
      setShowCreditModal
    );
  }
  return showErrorToast(
    { message: String(err) },
    setShowCreditModal
  );
}
