import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ExportLabels } from "../domain/export";
import { scheduleTypes, type ScheduleType } from "../domain/timetable";
import { formatDate, formatNumber } from "./format";
import { currentLanguage } from "./i18n";

export function useExportLabels(): ExportLabels {
  const { t } = useTranslation("timeline");
  const { t: tCommon } = useTranslation("common");
  const language = currentLanguage();
  return useMemo(
    () => ({
      defaultTitle: t("defaultTitle"),
      scheduleTypes: Object.fromEntries(
        scheduleTypes.map((type) => [type, tCommon(`scheduleTypes.${type}`)]),
      ) as Record<ScheduleType, string>,
      timelineDescription: (count: number) =>
        t("svgDescription", { count, formattedCount: formatNumber(count, language) }),
      untimed: t("untimed"),
      unsetTime: tCommon("unset"),
      conflict: t("conflict"),
      formatDate: (date: string, timeZone: string) => formatDate(date, language, timeZone),
    }),
    [language, t, tCommon],
  );
}
