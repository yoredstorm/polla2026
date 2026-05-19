"use client";

import { useCallback } from "react";
import { driver, type DriveStep, type Config } from "driver.js";
import "driver.js/dist/driver.css";
import { getHelpText, TOUR_STEPS } from "@/lib/systemHelp";

const driverConfig: Partial<Config> = {
  showProgress: true,
  progressText: "{{current}} de {{total}}",
  nextBtnText: "Siguiente",
  prevBtnText: "Anterior",
  doneBtnText: "Listo",
  allowClose: true,
  overlayOpacity: 0.75,
  stagePadding: 8,
  popoverClass: "polla-driver-popover",
};

function buildSteps(): DriveStep[] {
  return TOUR_STEPS.map((step) => {
    const title = getHelpText(step.helpKey, "short");
    const description = getHelpText(step.helpKey, "detail") || step.helpKey;
    const base: DriveStep = {
      popover: {
        title,
        description,
        side: step.side ?? "bottom",
        align: "center",
      },
    };
    if (step.element) {
      return { ...base, element: step.element };
    }
    return base;
  });
}

export function runHelpTour(onComplete?: () => void) {
  const driverObj = driver({
    ...driverConfig,
    steps: buildSteps(),
    onDestroyed: () => {
      onComplete?.();
    },
  });
  driverObj.drive();
  return driverObj;
}

export function useHelpTourRunner(markTourDone: () => void) {
  const startTour = useCallback(() => {
    runHelpTour(markTourDone);
  }, [markTourDone]);

  return { startTour };
}
