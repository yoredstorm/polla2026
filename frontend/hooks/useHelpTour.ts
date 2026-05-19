"use client";

import { useCallback, useEffect, useState } from "react";
import { HELP_TOUR_STORAGE_KEY } from "@/lib/systemHelp";

export function useHelpTour() {
  const [tourDone, setTourDone] = useState(true);
  const [bannerVisible, setBannerVisible] = useState(false);

  useEffect(() => {
    try {
      const done = localStorage.getItem(HELP_TOUR_STORAGE_KEY) === "1";
      setTourDone(done);
      setBannerVisible(!done);
    } catch {
      setTourDone(false);
      setBannerVisible(true);
    }
  }, []);

  const markTourDone = useCallback(() => {
    try {
      localStorage.setItem(HELP_TOUR_STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setTourDone(true);
    setBannerVisible(false);
  }, []);

  const dismissBanner = useCallback(() => {
    markTourDone();
  }, [markTourDone]);

  return {
    tourDone,
    bannerVisible,
    markTourDone,
    dismissBanner,
    setBannerVisible,
  };
}
