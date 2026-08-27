import i18n from "./i18n";
import { errorCode, errorDetails, type AppErrorCode } from "../domain/errors";

export function localizeError(error: unknown, fallback: AppErrorCode): string {
  const code = errorCode(error, fallback);
  return i18n.t(`errors.${code}`, errorDetails(error));
}
