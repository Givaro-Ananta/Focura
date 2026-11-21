"use client";

import { useEffect } from "react";
import { initializeApp } from "../js/app.js";
import { setupDropdowns } from "../js/dropdowns.js";

export default function Initialize() {
  useEffect(() => {
    const root = document.getElementById("focura");
    const stopDropdowns = setupDropdowns(root);
    function initialize() {
      const button = root.querySelector("#btn-google-login");
      if (!button || button.dataset.initialized) return;
      button.dataset.initialized = "true";
      void initializeApp();
    }
    initialize();
    // A refresh of the server-rendered shell can replace its HTML without remounting this component.
    const observer = new MutationObserver(initialize);
    observer.observe(root, { childList: true });
    return () => {
      observer.disconnect();
      stopDropdowns();
    };
  }, []);
  return null;
}
