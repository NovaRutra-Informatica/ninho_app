const fallbackMessage = "Não foi possível concluir esta ação. Tente novamente.";

/** Removes Electron's transport envelope while keeping the actual failure reason. */
export function errorMessage(
  error: unknown,
  fallback = fallbackMessage,
): string {
  let message = "";
  if (typeof error === "string") message = error;
  else if (error && typeof error === "object" && "message" in error) {
    if (typeof error.message === "string") message = error.message;
  }
  message = message.trim();
  for (let index = 0; index < 8; index++) {
    const next = message
      .replace(/^Error:\s*/i, "")
      .replace(/^Error invoking remote method (?:'[^']*'|"[^"]*"):\s*/i, "")
      .trim();
    if (next === message) break;
    message = next;
  }
  // Stack locations belong to diagnostics, not the explanation shown to the learner.
  message = message.split(/\n\s+at\s/)[0].trim();
  return message && message !== "[object Object]" ? message : fallback;
}
